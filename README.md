# agentloom

A workflow layer for Claude Code. Better routing, reusable roles, and multi-agent crew coordination — built natively on what Claude Code already provides.

```bash
npm install -g agentloom
loom setup
```

---

## What this is

Claude Code is the execution engine. agentloom adds:
- **`$grind`** — persistence loop that keeps working until a task is verified complete
- **`$crew`** — parallel workers that decompose and execute simultaneously
- **`$architect`** — deep analysis mode before major decisions
- **`loom crew`** — CLI to spawn a crew of workers from your terminal

It does not replace Claude Code. It wraps it.

---

## Quick start

```bash
npm install -g agentloom
loom setup          # installs skills, validates deps

# From your terminal:
loom crew "audit every API endpoint for security issues"
loom crew 2:explore+1:code-reviewer "review the payment flow"

# Or from inside a Claude Code session:
# $grind "port the auth module to the new interface"
# $crew "analyze all three data pipeline stages in parallel"
```

---

## Skills

Install with `loom setup`. Then use inside any Claude Code session:

| Skill | What it does |
|---|---|
| `$grind` | Persistence loop with mandatory verification gate |
| `$crew` | Parallel workers — decomposes task, runs simultaneously, verifies |
| `$architect` | Deep analysis — maps system, finds real problems, recommends approach |

---

## CLI

```
loom crew [N] "<task>"                  Spawn N general-purpose workers
loom crew 3 "<task>"                    Spawn 3 workers
loom crew 2:explore "<task>"            Spawn 2 Explore-type workers
loom crew 2:explore+1:code-reviewer     Spawn typed crew
loom status                             Show active session
loom setup                              Install skills + validate
```

### Worker types

Matches Claude Code's built-in subagent types:

| Type | Best for |
|---|---|
| `explore` | Read-only research, codebase mapping |
| `plan` | Architecture decisions, approach planning |
| `code-reviewer` | Audits, security reviews, quality checks |
| `frontend-developer` | UI and component work |
| `general-purpose` | General implementation (default) |

---

## State directory

```
.agentloom/
  tasks/          Task queue — workers claim atomically
  workers/        Worker status and results
  context/        Shared context snapshots
  session.json    Active session metadata
```

---

## Requirements

- Node.js 20+
- Claude Code CLI (`claude`)
- tmux (optional — used for crew mode on Mac/Linux; falls back to background processes on WSL/Windows)

---

## License

MIT
