import { writeFile } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { type Task, type Session, STATE_DIR, ensureStateDir, writeSession, writeTask } from '../state/session.js'

export type WorkerSpec = {
  count: number
  agentType: string
}

export function parseWorkerSpec(args: string[]): { specs: WorkerSpec[], task: string } {
  // Formats:
  //   omc team "task description"
  //   omc team 3 "task description"
  //   omc team 2:explore "task description"
  //   omc team 2:explore+1:code-reviewer "task description"

  const task = args[args.length - 1] ?? ''
  const specArg = args.length > 1 ? args[0] ?? '' : ''

  if (!specArg) {
    return { specs: [{ count: 2, agentType: 'general-purpose' }], task }
  }

  // Plain number: "3"
  if (/^\d+$/.test(specArg)) {
    return { specs: [{ count: parseInt(specArg), agentType: 'general-purpose' }], task }
  }

  // Typed specs: "2:explore+1:code-reviewer"
  const parts = specArg.split('+')
  const specs: WorkerSpec[] = parts.map(part => {
    const [countStr, agentType] = part.split(':')
    return {
      count: parseInt(countStr ?? '1'),
      agentType: agentType ?? 'general-purpose',
    }
  })

  return { specs, task }
}

export async function initSession(description: string, workerCount: number): Promise<Session> {
  await ensureStateDir()

  const session: Session = {
    id: randomUUID().slice(0, 8),
    description,
    status: 'running',
    workerCount,
    createdAt: new Date().toISOString(),
  }

  await writeSession(session)
  return session
}

export async function writeContextSnapshot(slug: string, task: string): Promise<string> {
  const path = join(STATE_DIR, 'context', `${slug}.md`)
  const content = `# Task Context\n\n**Task:** ${task}\n\n**Started:** ${new Date().toISOString()}\n\n## Notes\n\n_Workers will append findings here._\n`
  await writeFile(path, content)
  return path
}

export async function decomposeTasks(task: string, specs: WorkerSpec[]): Promise<Task[]> {
  // For now: create one task per worker spec segment.
  // In a future iteration, we'll use Claude to decompose the task.
  const tasks: Task[] = []

  for (const spec of specs) {
    for (let i = 0; i < spec.count; i++) {
      const t: Task = {
        id: randomUUID().slice(0, 8),
        description: task,
        agentType: spec.agentType,
        status: 'pending',
        createdAt: new Date().toISOString(),
      }
      tasks.push(t)
      await writeTask(t)
    }
  }

  return tasks
}
