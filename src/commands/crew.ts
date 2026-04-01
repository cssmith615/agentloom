import { execSync, spawn } from 'child_process'
import { writeFile, mkdir, open } from 'fs/promises'
import { join } from 'path'
import {
  parseWorkerSpec,
  initSession,
  writeContextSnapshot,
  decomposeTasks,
} from '../team/orchestrator.js'
import { readSession, STATE_DIR } from '../state/session.js'

const hasTmux = (): boolean => {
  try { execSync('tmux -V', { stdio: 'ignore' }); return true } catch { return false }
}

const isWSL = (): boolean =>
  process.platform === 'linux' && !!process.env.WSL_DISTRO_NAME

// Role-specific instructions injected into each worker prompt
const AGENT_ROLE: Record<string, string> = {
  'explore': `Your role is EXPLORER. You are read-only. Do not modify any files.
- Map out the relevant code, files, and structure
- Document what exists, how it connects, and what's notable
- Your output feeds the other workers — be thorough and specific`,

  'plan': `Your role is PLANNER. You are read-only. Do not modify any files.
- Reason about the best approach to the subtask
- Identify risks, dependencies, and open questions
- Produce a concrete, ordered action plan other workers can execute`,

  'code-reviewer': `Your role is CODE REVIEWER. You are read-only. Do not modify any files.
- Audit the relevant code for correctness, security, and quality
- Flag specific lines, patterns, or logic that are problematic
- Assign severity (critical / high / medium / low) to each finding`,

  'frontend-developer': `Your role is FRONTEND DEVELOPER.
- Focus on UI, components, styling, and client-side logic
- Follow existing conventions in the codebase
- Write clean, accessible code`,

  'general-purpose': `Your role is GENERAL PURPOSE WORKER.
- Do whatever the subtask requires — research, implementation, or both
- Use all tools available to you`,
}

function buildWorkerPrompt(
  subtask: string,
  contextPath: string,
  sessionId: string,
  workerId: string,
  agentType: string,
): string {
  const resultFile = join(STATE_DIR, 'workers', `${workerId}-result.md`)
  const roleInstructions = AGENT_ROLE[agentType] ?? AGENT_ROLE['general-purpose']

  return `You are worker ${workerId} in an agentloom crew session (${sessionId}).

${roleInstructions}

## Your assigned subtask

"${subtask}"

## Protocol

1. Read the shared context: ${contextPath}
2. Do the work thoroughly using all tools available to you
3. Append key findings to the context file so other workers can see them
4. When done, write a result summary to: ${resultFile}
   Format: brief markdown — what you did, what you found, any blockers

## Rules
- Stay focused on your assigned subtask and role
- Do not stop until your subtask is complete or you have hit a genuine blocker

Begin now.`
}

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
    await launchTmux(session.id, specs, tasks, contextPath)
  } else {
    await launchBackground(session.id, specs, tasks, contextPath)
  }

  console.log(`\nWorkers launched. Monitor with:`)
  console.log(`  loom status`)
  console.log(`  loom logs`)
  console.log(`  loom crew --watch   (live tail)`)
  console.log(`State dir: ${STATE_DIR}/`)
}

async function launchBackground(
  sessionId: string,
  specs: Array<{ count: number; agentType: string }>,
  tasks: Array<{ description: string; agentType?: string }>,
  contextPath: string,
): Promise<void> {
  await mkdir(join(STATE_DIR, 'workers'), { recursive: true })

  let workerIdx = 0
  for (const spec of specs) {
    for (let i = 0; i < spec.count; i++) {
      const workerId = `w${String(workerIdx).padStart(2, '0')}`
      const subtask = tasks[workerIdx]?.description ?? tasks[0]?.description ?? ''
      const agentType = tasks[workerIdx]?.agentType ?? spec.agentType
      workerIdx++

      const prompt = buildWorkerPrompt(subtask, contextPath, sessionId, workerId, agentType)
      const logFile = join(STATE_DIR, 'workers', `${workerId}.log`)

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
      console.log(`  ✓ Worker ${workerId} (${agentType}) launched [pid ${child.pid}] → ${logFile}`)
    }
  }
}

async function launchTmux(
  sessionId: string,
  specs: Array<{ count: number; agentType: string }>,
  tasks: Array<{ description: string; agentType?: string }>,
  contextPath: string,
): Promise<void> {
  const tmuxSession = `loom-${sessionId}`
  execSync(`tmux new-session -d -s ${tmuxSession} -x 220 -y 50`)

  let workerIdx = 0
  for (const spec of specs) {
    for (let i = 0; i < spec.count; i++) {
      const workerId = `w${String(workerIdx).padStart(2, '0')}`
      const subtask = tasks[workerIdx]?.description ?? tasks[0]?.description ?? ''
      const agentType = tasks[workerIdx]?.agentType ?? spec.agentType
      workerIdx++

      const prompt = buildWorkerPrompt(subtask, contextPath, sessionId, workerId, agentType)

      if (workerIdx > 1) {
        execSync(`tmux split-window -h -t ${tmuxSession}`)
        execSync(`tmux select-layout -t ${tmuxSession} tiled`)
      }

      const cmd = `AGENTLOOM_WORKER_ID=${workerId} AGENTLOOM_SESSION=${sessionId} claude --print --dangerously-skip-permissions -p '${prompt.replace(/'/g, "'\"'\"'")}'; echo '[worker done]'; read`
      execSync(`tmux send-keys -t ${tmuxSession} "${cmd}" Enter`)
      console.log(`  ✓ Worker ${workerId} (${agentType}) launched in tmux pane`)
    }
  }

  execSync(`tmux attach-session -t ${tmuxSession}`)
}
