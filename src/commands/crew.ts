import { execSync, spawn } from 'child_process'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'
import {
  parseWorkerSpec,
  initSession,
  writeContextSnapshot,
  decomposeTasks,
} from '../team/orchestrator.js'
import { allDone, pendingCount } from '../team/queue.js'
import { readSession, writeSession, STATE_DIR } from '../state/session.js'

const hasTmux = (): boolean => {
  try { execSync('tmux -V', { stdio: 'ignore' }); return true } catch { return false }
}

const isWSL = (): boolean =>
  process.platform === 'linux' && !!process.env.WSL_DISTRO_NAME

export async function crew(args: string[]): Promise<void> {
  if (args.length === 0) {
    console.error('Usage: loom crew [N] "<task>"')
    process.exit(1)
  }

  const { specs, task } = parseWorkerSpec(args)
  const totalWorkers = specs.reduce((sum, s) => sum + s.count, 0)
  const slug = task.slice(0, 30).toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')

  console.log(`\nagentloom crew`)
  console.log(`Task:    ${task}`)
  console.log(`Workers: ${totalWorkers}`)
  console.log(`Mode:    ${hasTmux() && !isWSL() ? 'tmux' : 'background processes'}\n`)

  const session = await initSession(task, totalWorkers)
  const contextPath = await writeContextSnapshot(slug, task)
  const tasks = await decomposeTasks(task, specs)

  console.log(`Session: ${session.id}`)
  console.log(`Tasks:   ${tasks.length} created`)
  console.log(`Context: ${contextPath}\n`)

  const workerPrompt = buildWorkerPrompt(task, contextPath, session.id)

  if (hasTmux() && !isWSL()) {
    await launchTmux(session.id, totalWorkers, specs, workerPrompt)
  } else {
    await launchBackground(session.id, totalWorkers, specs, workerPrompt)
  }

  console.log(`\nWorkers launched. Monitor with: loom status`)
  console.log(`State dir: ${STATE_DIR}/`)
}

function buildWorkerPrompt(task: string, contextPath: string, sessionId: string): string {
  return `You are a worker agent in an agentloom crew session (${sessionId}).

Your job: help complete this task: "${task}"

## Your protocol

1. Read the shared context at: ${contextPath}
2. Check ${STATE_DIR}/tasks/ for unclaimed work (files ending in -pending.json)
3. Claim a task by reading it and noting the task ID
4. Do the work thoroughly using all tools available to you
5. Write your result back to ${STATE_DIR}/workers/
6. Repeat until no pending tasks remain

## Rules
- Claim only one task at a time
- Write your findings to the context file so other workers can see them
- Do not stop until you have completed at least one task
- If all tasks are claimed, do exploratory work relevant to the main task

Begin now. Check for pending tasks and start working.`
}

async function launchBackground(
  sessionId: string,
  count: number,
  specs: Array<{ count: number; agentType: string }>,
  prompt: string,
): Promise<void> {
  await mkdir(join(STATE_DIR, 'workers'), { recursive: true })

  let workerIdx = 0
  for (const spec of specs) {
    for (let i = 0; i < spec.count; i++) {
      const workerId = `w${String(workerIdx).padStart(2, '0')}`
      workerIdx++

      const promptFile = join(STATE_DIR, 'workers', `${workerId}-prompt.md`)
      await writeFile(promptFile, prompt)

      const child = spawn(
        'claude',
        ['--print', '--dangerously-skip-permissions', '-p', prompt],
        {
          detached: true,
          stdio: ['ignore', 'ignore', 'ignore'],
          env: { ...process.env, AGENTLOOM_WORKER_ID: workerId, AGENTLOOM_SESSION: sessionId },
        }
      )
      child.unref()
      console.log(`  ✓ Worker ${workerId} (${spec.agentType}) launched [pid ${child.pid}]`)
    }
  }
}

async function launchTmux(
  sessionId: string,
  count: number,
  specs: Array<{ count: number; agentType: string }>,
  prompt: string,
): Promise<void> {
  const tmuxSession = `loom-${sessionId}`

  execSync(`tmux new-session -d -s ${tmuxSession} -x 220 -y 50`)

  let workerIdx = 0
  for (const spec of specs) {
    for (let i = 0; i < spec.count; i++) {
      const workerId = `w${String(workerIdx).padStart(2, '0')}`
      workerIdx++

      if (workerIdx > 1) {
        execSync(`tmux split-window -h -t ${tmuxSession}`)
        execSync(`tmux select-layout -t ${tmuxSession} tiled`)
      }

      const cmd = `AGENTLOOM_WORKER_ID=${workerId} AGENTLOOM_SESSION=${sessionId} claude --print --dangerously-skip-permissions -p '${prompt.replace(/'/g, "'\"'\"'")}'; echo '[worker done]'; read`
      execSync(`tmux send-keys -t ${tmuxSession} "${cmd}" Enter`)
      console.log(`  ✓ Worker ${workerId} (${spec.agentType}) launched in tmux pane`)
    }
  }

  execSync(`tmux attach-session -t ${tmuxSession}`)
}
