#!/usr/bin/env node
import { setup } from './commands/setup.js'
import { crew } from './commands/crew.js'
import { status } from './commands/status.js'
import { logs } from './commands/logs.js'
import { collect } from './commands/collect.js'
import { reset } from './commands/reset.js'
import { watch } from './commands/watch.js'
import { stop } from './commands/stop.js'

const [,, command, ...args] = process.argv

const usage = `
agentloom (loom) — workflow layer for Claude Code

Usage:
  loom setup                            Install skills and initialize state dir
  loom crew [N] "<task>"                Spawn N parallel workers on a task
  loom crew 2:explore "<task>"          Spawn typed workers (explore/plan/code-reviewer)
  loom crew --dry-run [N] "<task>"      Preview decomposed subtasks without launching
  loom watch                            Live tail all worker logs (Ctrl+C to stop)
  loom stop                             Kill all background workers (SIGTERM)
  loom stop <workerId>                  Kill one worker
  loom status                           Show active crew session + stale worker detection
  loom logs                             Show worker output summary
  loom logs <workerId>                  Show full log for a specific worker
  loom collect                          Synthesize worker results into a summary
  loom collect --no-ai                  Collect results without Claude synthesis
  loom reset --force                    Clear all session state

Agent types (use with crew):
  explore          Read-only research and mapping
  plan             Architecture and approach planning
  code-reviewer    Audit for correctness, security, quality
  frontend-developer  UI and component work
  general-purpose  Default — does whatever the subtask requires

Modes (use $grind or $crew inside a Claude Code session):
  $grind   Persistence loop — keeps working until verified complete
  $crew    Parallel workers — decompose and execute simultaneously

Examples:
  loom setup
  loom crew "refactor the auth module"
  loom crew 3 "audit every API endpoint for security issues"
  loom crew 2:explore+1:code-reviewer "review the payment flow"
  loom crew --dry-run 3 "migrate the database schema"
  loom watch
  loom collect
`

switch (command) {
  case 'setup':
    await setup()
    break
  case 'crew':
    await crew(args)
    break
  case 'watch':
    await watch(args)
    break
  case 'status':
    await status()
    break
  case 'logs':
    await logs(args)
    break
  case 'collect':
    await collect(args)
    break
  case 'stop':
    await stop(args)
    break
  case 'reset':
    await reset(args)
    break
  default:
    console.log(usage)
    process.exit(command ? 1 : 0)
}
