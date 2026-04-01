import { execSync, spawn, spawnSync } from 'child_process'
import { writeFile, mkdir, open } from 'fs/promises'
import { join } from 'path'
import {
  parseWorkerSpec,
  initSession,
  writeContextSnapshot,
  decomposeTasks,
} from '../team/orchestrator.js'
import { STATE_DIR } from '../state/session.js'

const hasTmux = (): boolean => {
  try { execSync('tmux -V', { stdio: 'ignore' }); return true } catch { return false }
}

const isWSL = (): boolean =>
  process.platform === 'linux' && !!process.env.WSL_DISTRO_NAME

// Roles that must NOT receive --dangerously-skip-permissions
const READ_ONLY_ROLES = new Set(['explore', 'plan', 'code-reviewer'])

const AGENT_ROLE: Record<string, string> = {
  'explore': `Your role is EXPLORER. You are read-only — do not modify, create, or delete any files.
- Map out the relevant code, files, and structure
- Document what exists, how it connects, and what's notable
- Your output feeds the other workers — be thorough and specific`,

  'plan': `Your role is PLANNER. You are read-only — do not modify, create, or delete any files.
- Reason about the best approach to the subtask
- Identify risks, dependencies, and open questions
- Produce a concrete, ordered action plan other workers can execute`,

  'code-reviewer': `Your role is CODE REVIEWER. You are read-only — do not modify, create, or delete any files.
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

  const useTmux = hasTmux() && !isWSL() && process.stdout.isTTY
  console.log(`Mode:    ${useTmux ? 'tmux' : 'background processes'}\n`)

  const session = await initSession(task, totalWorkers)
  const contextPath = await writeContextSnapshot(slug, task)
  const tasks = await decomposeTasks(task, specs)

  console.log(`Session: ${session.id}`)
  console.log(`Tasks:   ${tasks.length} created`)
  console.log(`Context: ${contextPath}\n`)

  if (useTmux) {
    await launchTmux(session.id, specs, tasks, contextPath)
  } else {
    await launchBackground(session.id, specs, tasks, contextPath)
  }

  console.log(`\nWorkers launched. Monitor with:`)
  console.log(`  loom status`)
  console.log(`  loom watch`)
  console.log(`  loom stop    (kill all workers)`)
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
      const pidFile = join(STATE_DIR, 'workers', `${workerId}.pid`)

      await writeFile(join(STATE_DIR, 'workers', `${workerId}-prompt.md`), prompt)

      // Build args declaratively — no positional splicing
      const claudeArgs = [
        '--print',
        ...(!READ_ONLY_ROLES.has(agentType) ? ['--dangerously-skip-permissions'] : []),
        '-p',
        prompt,
      ]

      const log = await open(logFile, 'w')
      const child = spawn('claude', claudeArgs, {
        detached: true,
        stdio: ['ignore', log.fd, log.fd],
        env: { ...process.env, AGENTLOOM_WORKER_ID: workerId, AGENTLOOM_SESSION: sessionId },
      })

      child.on('error', async (err) => {
        await writeFile(
          join(STATE_DIR, 'workers', `${workerId}-result.md`),
          `# Launch Error\n\nFailed to start worker: ${err.message}\n`
        ).catch(() => { /* best effort */ })
        log.close().catch(() => { /* best effort */ })
      })

      child.on('close', () => { log.close().catch(() => { /* best effort */ }) })

      if (child.pid != null) {
        await writeFile(pidFile, String(child.pid))
      }

      child.unref()
      console.log(`  ✓ Worker ${workerId} (${agentType})${READ_ONLY_ROLES.has(agentType) ? ' [read-only]' : ''} launched [pid ${child.pid ?? '?'}] → ${logFile}`)
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

  // Check for session name collision
  const existing = spawnSync('tmux', ['has-session', '-t', tmuxSession], { stdio: 'ignore' })
  if (existing.status === 0) {
    console.error(`tmux session "${tmuxSession}" already exists. Run: tmux kill-session -t ${tmuxSession}`)
    process.exit(1)
  }

  try {
    execSync(`tmux new-session -d -s ${tmuxSession} -x 220 -y 50`)
  } catch (err) {
    console.error(`Failed to create tmux session: ${err instanceof Error ? err.message : err}`)
    process.exit(1)
  }

  await mkdir(join(STATE_DIR, 'workers'), { recursive: true })

  let workerIdx = 0
  for (const spec of specs) {
    for (let i = 0; i < spec.count; i++) {
      const workerId = `w${String(workerIdx).padStart(2, '0')}`
      const subtask = tasks[workerIdx]?.description ?? tasks[0]?.description ?? ''
      const agentType = tasks[workerIdx]?.agentType ?? spec.agentType
      workerIdx++

      const prompt = buildWorkerPrompt(subtask, contextPath, sessionId, workerId, agentType)
      const promptFile = join(STATE_DIR, 'workers', `${workerId}-prompt.md`)
      const scriptFile = join(STATE_DIR, 'workers', `${workerId}-run.mjs`)

      await writeFile(promptFile, prompt)

      // Node.js runner — JSON.stringify safely encodes all values, no shell expansion possible
      await writeFile(scriptFile, [
        `import { readFileSync } from 'fs'`,
        `import { spawnSync } from 'child_process'`,
        `process.env.AGENTLOOM_WORKER_ID = ${JSON.stringify(workerId)}`,
        `process.env.AGENTLOOM_SESSION = ${JSON.stringify(sessionId)}`,
        `const prompt = readFileSync(${JSON.stringify(promptFile)}, 'utf8')`,
        `const args = ['--print', ${!READ_ONLY_ROLES.has(agentType) ? `'--dangerously-skip-permissions', ` : ``}'${'-p'}', prompt]`,
        `const r = spawnSync('claude', args, { stdio: 'inherit' })`,
        `console.log('[worker done]')`,
        `process.exit(r.status ?? 0)`,
      ].join('\n'))

      if (workerIdx > 1) {
        try {
          execSync(`tmux split-window -h -t ${tmuxSession}`)
          execSync(`tmux select-layout -t ${tmuxSession} tiled`)
        } catch {
          // Non-fatal — continue with remaining workers even if layout fails
        }
      }

      // Use spawnSync (no shell) so the scriptFile path is passed as a literal argument.
      // Escape single quotes in the path for the shell inside the tmux pane.
      const shellSafePath = scriptFile.replace(/'/g, "'\\''")
      const sendResult = spawnSync('tmux', ['send-keys', '-t', tmuxSession, `node '${shellSafePath}'`, 'Enter'], { stdio: 'ignore' })
      if (sendResult.status !== 0) {
        console.error(`  ✗ Worker ${workerId}: failed to send tmux keys`)
        continue
      }

      console.log(`  ✓ Worker ${workerId} (${agentType})${READ_ONLY_ROLES.has(agentType) ? ' [read-only]' : ''} launched in tmux pane`)
    }
  }

  // Attach only in interactive terminals
  if (process.stdout.isTTY) {
    spawnSync('tmux', ['attach-session', '-t', tmuxSession], { stdio: 'inherit' })
  } else {
    console.log(`\nTmux session: ${tmuxSession}`)
    console.log(`Attach with: tmux attach-session -t ${tmuxSession}`)
  }
}
