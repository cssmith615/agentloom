# agentloom

A workflow layer for Claude Code — persistence loops, parallel crews, and typed agent roles, built natively on what Claude Code already provides.

```bash
npm install -g @chuckssmith/agentloom
loom setup
```

---

## What this is

Claude Code is the execution engine. agentloom adds:

- **`$grind`** — persistence loop that keeps working until a task is verified complete
- **`$crew`** — parallel workers that decompose and execute simultaneously  
- **`$architect`** — deep analysis mode before major decisions
- **`loom crew`** — CLI to spawn and monitor a crew from your terminal

It does not replace Claude Code. It wraps it.

---

## Quick start

```bash
npm install -g @chuckssmith/agentloom
loom setup          # installs $grind, $crew, $architect skills + validates deps

# Spawn workers from your terminal:
loom crew "audit every API endpoint for security issues"
loom crew 2:explore+1:code-reviewer "review the payment flow"
loom crew --dry-run 3 "migrate the database schema"   # preview before launching

# Monitor:
loom watch           # live tail all worker logs
loom status          # session overview + stale worker detection
loom logs w00        # full output for one worker

# After workers finish:
loom collect         # synthesize results with Claude
loom reset --force   # clear state for next run

# Or use inside any Claude Code session:
# $grind "port the auth module to the new interface"
# $crew "analyze all three data pipeline stages in parallel"
```

---

## Skills

Install with `loom setup`. Use inside any Claude Code session:

| Skill | Trigger | What it does |
|---|---|---|
| `$grind` | `$grind "<task>"` | Persistence loop — plans, executes in parallel, verifies. Won't stop until a code-reviewer subagent returns PASS |
| `$crew` | `$crew "<task>"` | Decomposes task into independent streams, runs workers simultaneously, verifies result |
| `$architect` | `$architect "<task>"` | Deep analysis — maps the system, finds real problems, recommends approach before you write code |

---

## CLI reference

### Spawning workers

```
loom crew "<task>"                       2 general-purpose workers (default)
loom crew 3 "<task>"                     3 workers
loom crew 2:explore "<task>"             2 explore-type workers
loom crew 2:explore+1:code-reviewer "<task>"   typed crew
loom crew --dry-run 3 "<task>"           preview decomposed subtasks, no launch
```

### Monitoring

```
loom watch                   Live tail all worker logs with color-coded output
loom status                  Session overview, task counts, stale worker detection
loom logs                    Summary of all workers (status + last line)
loom logs <workerId>         Full log + result for one worker (e.g. loom logs w00)
```

### After workers finish

```
loom collect                 Read worker results + synthesize summary with Claude
loom collect --no-ai         Concatenate results without Claude synthesis
```

### Housekeeping

```
loom setup                   Install skills to ~/.claude/skills/, validate deps
loom reset --force           Wipe .claude-team/ state
```

---

## Worker types

Each type gets a role-specific system prompt that shapes its behavior:

| Type | Role | Modifies files? |
|---|---|---|
| `explore` | Maps code, documents structure and connections | No |
| `plan` | Reasons about approach, produces ordered action plan | No |
| `code-reviewer` | Audits for correctness, security, quality; assigns severity | No |
| `frontend-developer` | UI, components, styling, client-side logic | Yes |
| `general-purpose` | Does whatever the subtask requires (default) | Yes |

---

## State directory

Session state lives in `.claude-team/` (gitignored):

```
.claude-team/
  session.json          Active session metadata
  context/              Shared context snapshots (workers read + append)
  tasks/                Task queue — workers claim atomically via file rename
  workers/
    w00.log             Live stdout from worker 00
    w00-prompt.md       Prompt sent to worker 00
    w00-result.md       Result summary written by worker 00 on completion
  summary.md            Final synthesis from loom collect
```

---

## Requirements

- Node.js 20+
- Claude Code CLI (`claude`) — authenticated
- tmux (optional — used on Mac/Linux; falls back to background processes on Windows/WSL)

---

## License

MIT
