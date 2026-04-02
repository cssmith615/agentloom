import { readFile, writeFile, mkdir, readdir, unlink } from 'fs/promises'
import { join } from 'path'

// Absolute path so loom works correctly regardless of which subdirectory it's invoked from.
// NOTE: resolves to cwd at process start — does not walk up to find project root.
export const STATE_DIR = join(process.cwd(), '.claude-team')

export type TaskStatus = 'pending' | 'claimed' | 'done' | 'failed'

export type Task = {
  id: string
  description: string
  agentType?: string
  status: TaskStatus
  workerId?: string
  result?: string
  error?: string
  createdAt: string
  claimedAt?: string
  completedAt?: string
}

export type Session = {
  id: string
  description: string
  status: 'running' | 'verifying' | 'done' | 'failed'
  workerCount: number
  createdAt: string
  completedAt?: string
  verificationResult?: 'pass' | 'fail'
  verificationNotes?: string
}

export async function ensureStateDir(): Promise<void> {
  await mkdir(join(STATE_DIR, 'tasks'), { recursive: true })
  await mkdir(join(STATE_DIR, 'workers'), { recursive: true })
  await mkdir(join(STATE_DIR, 'context'), { recursive: true })
}

export async function writeSession(session: Session): Promise<void> {
  await writeFile(
    join(STATE_DIR, 'session.json'),
    JSON.stringify(session, null, 2)
  )
}

export async function readSession(): Promise<Session | null> {
  try {
    return JSON.parse(await readFile(join(STATE_DIR, 'session.json'), 'utf8'))
  } catch {
    return null
  }
}

export async function writeTask(task: Task): Promise<void> {
  const dir = join(STATE_DIR, 'tasks')
  // Remove any existing files for this task id to prevent ghost duplicates on status change.
  try {
    const files = await readdir(dir)
    await Promise.all(
      files
        .filter(f => f.startsWith(`${task.id}-`) && f.endsWith('.json'))
        .map(f => unlink(join(dir, f)).catch(() => {}))
    )
  } catch { /* dir may not exist yet — ensureStateDir handles this */ }
  await writeFile(join(dir, `${task.id}-${task.status}.json`), JSON.stringify(task, null, 2))
}

export async function readTasks(): Promise<Task[]> {
  const dir = join(STATE_DIR, 'tasks')
  try {
    const files = await readdir(dir)
    const tasks = await Promise.all(
      files.filter(f => f.endsWith('.json')).map(async f =>
        JSON.parse(await readFile(join(dir, f), 'utf8')) as Task
      )
    )
    // Deduplicate by id — keep highest-priority status in case of ghost duplicates.
    const STATUS_PRIORITY: Record<string, number> = { done: 4, failed: 3, claimed: 2, pending: 1 }
    const byId = new Map<string, Task>()
    for (const task of tasks) {
      const existing = byId.get(task.id)
      if (!existing || (STATUS_PRIORITY[task.status] ?? 0) > (STATUS_PRIORITY[existing.status] ?? 0)) {
        byId.set(task.id, task)
      }
    }
    return [...byId.values()]
  } catch {
    return []
  }
}
