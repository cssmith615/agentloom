import { writeFile } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { spawnSync } from 'child_process'
import { type Task, type Session, STATE_DIR, ensureStateDir, writeSession, writeTask } from '../state/session.js'

export type WorkerSpec = {
  count: number
  agentType: string
}

export function parseWorkerSpec(
  args: string[],
  defaultWorkers = 2,
  defaultAgentType = 'general-purpose',
): { specs: WorkerSpec[], task: string } {
  const task = args[args.length - 1] ?? ''
  const specArg = args.length > 1 ? args[0] ?? '' : ''

  if (!specArg) {
    return { specs: [{ count: defaultWorkers, agentType: defaultAgentType }], task }
  }

  // Plain number: "3"
  if (/^\d+$/.test(specArg)) {
    return { specs: [{ count: parseInt(specArg), agentType: defaultAgentType }], task }
  }

  // Typed specs: "2:explore+1:code-reviewer"
  const parts = specArg.split('+')
  const specs: WorkerSpec[] = parts.map(part => {
    const [countStr, agentType] = part.split(':')
    return {
      count: parseInt(countStr ?? '1'),
      agentType: agentType ?? defaultAgentType,
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

export async function decomposeTasks(task: string, specs: WorkerSpec[], dryRun = false): Promise<Task[]> {
  const totalWorkers = specs.reduce((sum, s) => sum + s.count, 0)
  const subtasks = callClaudeDecompose(task, totalWorkers)

  const tasks: Task[] = []
  let idx = 0

  for (const spec of specs) {
    for (let i = 0; i < spec.count; i++) {
      const t: Task = {
        id: randomUUID().slice(0, 8),
        description: subtasks[idx] ?? task,
        agentType: spec.agentType,
        status: 'pending',
        createdAt: new Date().toISOString(),
      }
      tasks.push(t)
      if (!dryRun) await writeTask(t)
      idx++
    }
  }

  return tasks
}

function callClaudeDecompose(task: string, n: number): string[] {
  if (n <= 1) return [task]

  const prompt = `Decompose this task into exactly ${n} independent subtasks that can run in parallel. Each must be specific and actionable. Respond with a JSON array of ${n} strings — no explanation, no markdown, just the array.

Task: "${task}"`

  try {
    const result = spawnSync('claude', ['--print', '-p', prompt], {
      encoding: 'utf8',
      timeout: 30_000,
    })

    if (result.status !== 0 || !result.stdout) throw new Error(result.stderr ?? 'no output')

    // Extract JSON array from the response (strip any surrounding prose)
    const match = result.stdout.match(/\[[\s\S]*\]/)
    if (!match) throw new Error('No JSON array in response')
    const parsed: unknown = JSON.parse(match[0])
    if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('Empty array')
    const subtasks = parsed.map(String)
    // Pad or trim to exactly n
    while (subtasks.length < n) subtasks.push(task)
    return subtasks.slice(0, n)
  } catch {
    // Fallback: every worker gets the same task description
    return Array<string>(n).fill(task)
  }
}
