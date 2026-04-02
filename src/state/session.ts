import { readFile, writeFile, mkdir, readdir } from 'fs/promises'
import { join } from 'path'

export const STATE_DIR = '.claude-team'

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
  await writeFile(
    join(STATE_DIR, 'tasks', `${task.id}-${task.status}.json`),
    JSON.stringify(task, null, 2)
  )
}

export async function readTasks(): Promise<Task[]> {
  const dir = join(STATE_DIR, 'tasks')
  try {
    const files = await readdir(dir)
    return Promise.all(
      files.filter(f => f.endsWith('.json')).map(async f =>
        JSON.parse(await readFile(join(dir, f), 'utf8'))
      )
    )
  } catch {
    return []
  }
}
