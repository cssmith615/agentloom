import { readdir, readFile, rename, writeFile } from 'fs/promises'
import { join, basename } from 'path'
import { type Task, STATE_DIR } from '../state/session.js'

const TASKS_DIR = join(STATE_DIR, 'tasks')
const CLAIM_TTL_MS = 30 * 60 * 1000 // 30 minutes — claimed tasks older than this are re-queued

// Recover tasks whose worker crashed before completing.
// Finds -claimed- files older than CLAIM_TTL_MS and renames them back to -pending.json.
export async function recoverStaleClaims(): Promise<number> {
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
      const { mtimeMs } = await import('fs/promises').then(m =>
        m.stat(filePath)
      )
      if (now - mtimeMs < CLAIM_TTL_MS) continue

      // Parse task id from filename: {id}-claimed-{workerId}.json
      const taskId = file.split('-claimed-')[0]
      if (!taskId) continue

      const pendingPath = join(TASKS_DIR, `${taskId}-pending.json`)

      // Re-read the file and reset status before writing back as pending
      const task: Task = JSON.parse(await readFile(filePath, 'utf8'))
      task.status = 'pending'
      delete task.workerId
      delete task.claimedAt

      await writeFile(pendingPath, JSON.stringify(task, null, 2))
      await rename(filePath, pendingPath).catch(() => {
        // If the write succeeded but rename fails (e.g. destination now exists from another
        // recovery run), leave it — the pending file was already written
      })
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
      // Prepare the updated task object BEFORE the rename.
      // If writeFile fails after a successful rename, we rename back so the task
      // re-enters the pending pool rather than being stuck as claimed with stale data.
      const raw = await readFile(oldPath, 'utf8')
      const task: Task = JSON.parse(raw)

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
        throw writeErr
      }

      return task
    } catch {
      // Another worker claimed it first (ENOENT/EPERM), or rollback — try next
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
    // If the claimed file is already gone (double-complete), write directly to done path
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
