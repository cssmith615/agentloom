import { readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'

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

export type Worker = {
  id: string
  agentType: string
  status: 'idle' | 'working' | 'done'
  currentTaskId?: string
  startedAt: string
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
  const path = join(STATE_DIR, 'session.json')
  if (!existsSync(path)) return null
  return JSON.parse(await readFile(path, 'utf8'))
}

export async function writeTask(task: Task): Promise<void> {
  await writeFile(
    join(STATE_DIR, 'tasks', `${task.id}-${task.status}.json`),
    JSON.stringify(task, null, 2)
  )
}

export async function writeWorker(worker: Worker): Promise<void> {
  await writeFile(
    join(STATE_DIR, 'workers', `${worker.id}.json`),
    JSON.stringify(worker, null, 2)
  )
}

export async function readWorkers(): Promise<Worker[]> {
  const { readdir } = await import('fs/promises')
  const dir = join(STATE_DIR, 'workers')
  if (!existsSync(dir)) return []
  const files = await readdir(dir)
  return Promise.all(
    files.filter(f => f.endsWith('.json')).map(async f =>
      JSON.parse(await readFile(join(dir, f), 'utf8'))
    )
  )
}

export async function readTasks(): Promise<Task[]> {
  const { readdir } = await import('fs/promises')
  const dir = join(STATE_DIR, 'tasks')
  if (!existsSync(dir)) return []
  const files = await readdir(dir)
  return Promise.all(
    files.filter(f => f.endsWith('.json')).map(async f =>
      JSON.parse(await readFile(join(dir, f), 'utf8'))
    )
  )
}
