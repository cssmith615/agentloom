import { readdir, readFile, rename, writeFile, stat, unlink } from 'fs/promises'
import { join } from 'path'
import { type Task, STATE_DIR } from '../state/session.js'
import { loadConfig } from '../config.js'

const TASKS_DIR = join(STATE_DIR, 'tasks')

// Recover tasks whose worker crashed before completing.
// Finds -claimed- files older than CLAIM_TTL_MS and re-queues them as -pending.
export async function recoverStaleClaims(): Promise<number> {
  const config = await loadConfig()
  const claimTtlMs = config.claimTtlMinutes * 60 * 1000

  let recovered = 0
  let files: string[]
  try {
    files = await readdir(TASKS_DIR)
  } catch {
    return 0
  }

  const now = Date.now()
  const claimed = files.filter(f => f.includes('-claimed-'))

  for (const file of claimed) {
    const filePath = join(TASKS_DIR, file)
    try {
      const { mtimeMs } = await stat(filePath)
      if (now - mtimeMs < claimTtlMs) continue

      const taskId = file.split('-claimed-')[0]
      if (!taskId) continue

      const task: Task = JSON.parse(await readFile(filePath, 'utf8'))
      task.status = 'pending'
      delete task.workerId
      delete task.claimedAt

      const pendingPath = join(TASKS_DIR, `${taskId}-pending.json`)

      // Write the reset task to the pending path, then remove the stale claimed file.
      // (Do NOT rename claimed→pending: that would overwrite our fresh write with stale data.)
      await writeFile(pendingPath, JSON.stringify(task, null, 2))
      await unlink(filePath).catch(() => { /* best effort — pending file is already written */ })
      recovered++
    } catch {
      // Skip files we can't read/stat — don't crash the recovery pass
    }
  }

  return recovered
}

export async function claimTask(workerId: string): Promise<Task | null> {
  // Self-heal: recover any stale claimed tasks before scanning for pending ones
  await recoverStaleClaims()

  let files: string[]
  try {
    files = await readdir(TASKS_DIR)
  } catch {
    return null
  }

  const pending = files.filter(f => f.endsWith('-pending.json'))

  for (const file of pending) {
    const oldPath = join(TASKS_DIR, file)
    const newFile = file.replace('-pending.json', `-claimed-${workerId}.json`)
    const newPath = join(TASKS_DIR, newFile)

    try {
      // Prepare updated task object BEFORE the rename.
      const task: Task = JSON.parse(await readFile(oldPath, 'utf8'))
      task.status = 'claimed'
      task.workerId = workerId
      task.claimedAt = new Date().toISOString()
      const updated = JSON.stringify(task, null, 2)

      // Atomic claim — first writer wins
      await rename(oldPath, newPath)

      try {
        await writeFile(newPath, updated)
      } catch (writeErr) {
        // Rename succeeded but write failed — roll back so the task isn't orphaned
        await rename(newPath, oldPath).catch(() => { /* best effort */ })
        // Log genuine I/O errors (disk full, permissions) — these are not race conditions
        process.stderr.write(`[agentloom] claimTask writeFile failed for ${file}: ${writeErr}\n`)
        // Continue to next task rather than crashing — another task may succeed
        continue
      }

      return task
    } catch (err: unknown) {
      // ENOENT/EPERM = another worker claimed it first — expected, try next file
      // Any other error is unexpected; log and skip
      const code = (err as NodeJS.ErrnoException).code
      if (code !== 'ENOENT' && code !== 'EPERM' && code !== 'EACCES') {
        process.stderr.write(`[agentloom] claimTask unexpected error for ${file}: ${err}\n`)
      }
      continue
    }
  }

  return null
}

export async function completeTask(task: Task, result: string): Promise<void> {
  const workerId = task.workerId ?? 'unknown'
  const claimedFile = join(TASKS_DIR, `${task.id}-claimed-${workerId}.json`)
  const doneFile = join(TASKS_DIR, `${task.id}-done-${workerId}.json`)

  task.status = 'done'
  task.result = result
  task.completedAt = new Date().toISOString()

  try {
    await writeFile(claimedFile, JSON.stringify(task, null, 2))
    await rename(claimedFile, doneFile)
  } catch {
    // Double-complete or missing claimed file — write directly to done path
    await writeFile(doneFile, JSON.stringify(task, null, 2)).catch(() => { /* best effort */ })
  }
}

export async function failTask(task: Task, error: string): Promise<void> {
  const workerId = task.workerId ?? 'unknown'
  const claimedFile = join(TASKS_DIR, `${task.id}-claimed-${workerId}.json`)
  const failedFile = join(TASKS_DIR, `${task.id}-failed-${workerId}.json`)

  task.status = 'failed'
  task.error = error
  task.completedAt = new Date().toISOString()

  try {
    await writeFile(claimedFile, JSON.stringify(task, null, 2))
    await rename(claimedFile, failedFile)
  } catch {
    await writeFile(failedFile, JSON.stringify(task, null, 2)).catch(() => { /* best effort */ })
  }
}

export async function pendingCount(): Promise<number> {
  try {
    const files = await readdir(TASKS_DIR)
    return files.filter(f => f.endsWith('-pending.json')).length
  } catch {
    return 0
  }
}

export async function allDone(): Promise<boolean> {
  try {
    const files = await readdir(TASKS_DIR)
    return !files.some(f => f.endsWith('-pending.json') || f.includes('-claimed-'))
  } catch {
    return true
  }
}
