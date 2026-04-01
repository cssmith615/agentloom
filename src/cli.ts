#!/usr/bin/env node
import { setup } from './commands/setup.js'
import { crew } from './commands/crew.js'
import { status } from './commands/status.js'

const [,, command, ...args] = process.argv

const usage = `
agentloom (loom) — workflow layer for Claude Code

Usage:
  loom setup                       Install skills and initialize state dir
  loom crew [N] "<task>"           Spawn N parallel workers on a task
  loom crew 2:explore "<task>"     Spawn typed workers (explore/plan/code-reviewer)
  loom status                      Show active crew session

Modes (use $grind or $crew inside a Claude Code session):
  $grind   Persistence loop — keeps working until verified complete
  $crew    Parallel workers — decompose and execute simultaneously

Examples:
  loom setup
  loom crew "refactor the auth module"
  loom crew 3 "audit every API endpoint for security issues"
  loom crew 2:explore+1:code-reviewer "review the payment flow"
`

switch (command) {
  case 'setup':
    await setup()
    break
  case 'crew':
    await crew(args)
    break
  case 'status':
    await status()
    break
  default:
    console.log(usage)
    process.exit(command ? 1 : 0)
}
