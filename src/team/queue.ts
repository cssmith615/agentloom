import { readdir, readFile, rename, writeFile } from 'fs/promises'
import { join, basename } from 'path'
import { existsSync } from 'fs'
import { type Task, STATE_DIR } from '../state/session.js'

const TASKS_DIR = join(STATE_DIR, 'tasks')

export async function claimTask(workerId: string): Promise<Task | null> {
  if (!existsSync(TASKS_DIR)) return null
  const files = await readdir(TASKS_DIR)
  const pending = files.filter(f => f.endsWith('-pending.json'))

  for (const file of pending) {
    const oldPath = join(TASKS_DIR, file)
    const task: Task = JSON.parse(await readFile(oldPath, 'utf8'))
    const newFile = file.replace('-pending.json', `-claimed-${workerId}.json`)
    const newPath = join(TASKS_DIR, newFile)

    // Atomic rename = claim. First writer wins.
    try {
      await rename(oldPath, newPath)
      task.status = 'claimed'
      task.workerId = workerId
      task.claimedAt = new Date().toISOString()
      await writeFile(newPath, JSON.stringify(task, null, 2))
      return task
    } catch {
      // Another worker claimed it first — try next
      continue
    }
  }

  return null
}

export async function completeTask(task: Task, result: string): Promise<void> {
  const claimedFile = join(TASKS_DIR, `${task.id}-claimed-${task.workerId}.json`)
  const doneFile = join(TASKS_DIR, `${task.id}-done-${task.workerId}.json`)

  task.status = 'done'
  task.result = result
  task.completedAt = new Date().toISOString()

  await writeFile(claimedFile, JSON.stringify(task, null, 2))
  await rename(claimedFile, doneFile)
}

export async function failTask(task: Task, error: string): Promise<void> {
  const claimedFile = join(TASKS_DIR, `${task.id}-claimed-${task.workerId}.json`)
  const failedFile = join(TASKS_DIR, `${task.id}-failed-${task.workerId}.json`)

  task.status = 'failed'
  task.error = error
  task.completedAt = new Date().toISOString()

  await writeFile(claimedFile, JSON.stringify(task, null, 2))
  await rename(claimedFile, failedFile)
}

export async function pendingCount(): Promise<number> {
  if (!existsSync(TASKS_DIR)) return 0
  const files = await readdir(TASKS_DIR)
  return files.filter(f => f.includes('-pending.json')).length
}

export async function allDone(): Promise<boolean> {
  if (!existsSync(TASKS_DIR)) return true
  const files = await readdir(TASKS_DIR)
  const active = files.filter(
    f => f.includes('-pending.json') || f.includes('-claimed-')
  )
  return active.length === 0
}
