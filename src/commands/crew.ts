import { execSync, spawn } from 'child_process'
import { writeFile, mkdir, open } from 'fs/promises'
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
    console.error('Usage: loom crew [--dry-run] [N] "<task>"')
    process.exit(1)
  }

  const dryRun = args.includes('--dry-run')
  const filteredArgs = args.filter(a => a !== '--dry-run')

  const { specs, task } = parseWorkerSpec(filteredArgs)
  const totalWorkers = specs.reduce((sum, s) => sum + s.count, 0)
  const slug = task.slice(0, 30).toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')

  console.log(`\nagentloom crew`)
  console.log(`Task:    ${task}`)
  console.log(`Workers: ${totalWorkers}`)

  if (dryRun) {
    console.log(`Mode:    dry-run\n`)
    console.log('Decomposing task...\n')
    const tasks = await decomposeTasks(task, specs, true)
    let idx = 0
    for (const spec of specs) {
      for (let i = 0; i < spec.count; i++) {
        const t = tasks[idx++]
        console.log(`  [w${String(idx - 1).padStart(2, '0')}] (${spec.agentType})`)
        console.log(`       ${t?.description ?? task}\n`)
      }
    }
    console.log('Run without --dry-run to launch workers.')
    return
  }

  console.log(`Mode:    ${hasTmux() && !isWSL() ? 'tmux' : 'background processes'}\n`)

  const session = await initSession(task, totalWorkers)
  const contextPath = await writeContextSnapshot(slug, task)
  const tasks = await decomposeTasks(task, specs)

  console.log(`Session: ${session.id}`)
  console.log(`Tasks:   ${tasks.length} created`)
  console.log(`Context: ${contextPath}\n`)

  if (hasTmux() && !isWSL()) {
    await launchTmux(session.id, totalWorkers, specs, tasks.map(t => t.description), contextPath)
  } else {
    await launchBackground(session.id, specs, tasks.map(t => t.description), contextPath)
  }

  console.log(`\nWorkers launched. Monitor with:`)
  console.log(`  loom status`)
  console.log(`  loom logs`)
  console.log(`State dir: ${STATE_DIR}/`)
}

function buildWorkerPrompt(subtask: string, contextPath: string, sessionId: string, workerId: string): string {
  const resultFile = join(STATE_DIR, 'workers', `${workerId}-result.md`)
  return `You are worker ${workerId} in an agentloom crew session (${sessionId}).

Your assigned subtask: "${subtask}"

## Protocol

1. Read the shared context: ${contextPath}
2. Do the work thoroughly using all tools available to you
3. When done, write a result summary to: ${resultFile}
   Format: brief markdown — what you did, what you found, any blockers

## Rules
- Focus only on your assigned subtask
- Write findings to the context file (${contextPath}) so other workers can see them
- Do not stop until your subtask is complete or you have hit a genuine blocker

Begin now.`
}

async function launchBackground(
  sessionId: string,
  specs: Array<{ count: number; agentType: string }>,
  subtasks: string[],
  contextPath: string,
): Promise<void> {
  await mkdir(join(STATE_DIR, 'workers'), { recursive: true })

  let workerIdx = 0
  for (const spec of specs) {
    for (let i = 0; i < spec.count; i++) {
      const workerId = `w${String(workerIdx).padStart(2, '0')}`
      const subtask = subtasks[workerIdx] ?? subtasks[0] ?? ''
      workerIdx++

      const prompt = buildWorkerPrompt(subtask, contextPath, sessionId, workerId)
      const logFile = join(STATE_DIR, 'workers', `${workerId}.log`)

      // Write prompt to disk for inspection
      await writeFile(join(STATE_DIR, 'workers', `${workerId}-prompt.md`), prompt)

      const log = await open(logFile, 'w')
      const child = spawn(
        'claude',
        ['--print', '--dangerously-skip-permissions', '-p', prompt],
        {
          detached: true,
          stdio: ['ignore', log.fd, log.fd],
          env: { ...process.env, AGENTLOOM_WORKER_ID: workerId, AGENTLOOM_SESSION: sessionId },
        }
      )
      child.on('close', () => log.close())
      child.unref()
      console.log(`  ✓ Worker ${workerId} (${spec.agentType}) launched [pid ${child.pid}] → ${logFile}`)
    }
  }
}

async function launchTmux(
  sessionId: string,
  count: number,
  specs: Array<{ count: number; agentType: string }>,
  subtasks: string[],
  contextPath: string,
): Promise<void> {
  const tmuxSession = `loom-${sessionId}`

  execSync(`tmux new-session -d -s ${tmuxSession} -x 220 -y 50`)

  let workerIdx = 0
  for (const spec of specs) {
    for (let i = 0; i < spec.count; i++) {
      const workerId = `w${String(workerIdx).padStart(2, '0')}`
      const subtask = subtasks[workerIdx] ?? subtasks[0] ?? ''
      workerIdx++

      const prompt = buildWorkerPrompt(subtask, contextPath, sessionId, workerId)

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
