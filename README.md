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
- **`loom crew`** — CLI to spawn, monitor, and collect results from a crew

It does not replace Claude Code. It wraps it.

---

## Quick start

```bash
npm install -g @chuckssmith/agentloom
loom setup          # installs $grind, $crew, $architect skills + validates deps
loom init           # create .loomrc config in current project (optional)

# Spawn workers:
loom crew "audit every API endpoint for security issues"
loom crew 3 "refactor the auth module"
loom crew 2:explore+1:code-reviewer "review the payment flow"

# Useful flags:
loom crew --dry-run 3 "migrate the schema"   # preview decomposed subtasks first
loom crew --watch "audit the codebase"       # launch + immediately tail logs
loom crew --serial 3 "build the pipeline"    # run workers sequentially

# Monitor:
loom watch           # live color-coded tail of all worker logs
loom status          # session overview + per-worker liveness (PID-aware)

# After workers finish:
loom collect         # synthesize results with Claude into summary.md
loom reset --force   # clear state for next run

# Or use inside any Claude Code session:
# $grind "port the auth module to the new interface"
# $crew "analyze all three data pipeline stages in parallel"
```

---

## Skills

Install with `loom setup`. Use inside any Claude Code session:

| Skill | What it does |
|---|---|
| `$grind` | Persistence loop — plans, executes in parallel, verifies. Won't stop until a code-reviewer returns PASS |
| `$crew` | Decomposes task into independent streams, runs workers simultaneously, verifies result |
| `$architect` | Deep analysis — maps the system, finds real problems, recommends approach |

---

## CLI reference

### Setup

```
loom init            Create .loomrc in current directory (see Configuration below)
loom setup           Install skills to ~/.claude/skills/, validate claude + tmux
```

### Spawning workers

```
loom crew "<task>"                           Use defaults from .loomrc (or 2 general-purpose)
loom crew 3 "<task>"                         3 workers
loom crew 2:explore "<task>"                 2 explore-type workers
loom crew 2:explore+1:code-reviewer "<task>" Typed crew

Flags (combinable):
  --dry-run    Preview AI-decomposed subtasks without launching
  --watch      Launch then immediately tail all worker logs
  --serial     Run workers sequentially — each worker reads prior results from context file
```

### Monitoring

```
loom watch                   Live color-coded tail (auto-exits when all workers done)
loom status                  Session overview, task counts, per-worker liveness
loom logs                    Summary: all workers, status, last log line
loom logs <workerId>         Full log + result for one worker (e.g. loom logs w00)
```

### After workers finish

```
loom collect                 Read worker results + synthesize with Claude into .claude-team/summary.md
loom collect --no-ai         Concatenate results without Claude synthesis
```

### Housekeeping

```
loom stop                    Kill all background workers (SIGTERM)
loom stop <workerId>         Kill one worker
loom reset --force           Wipe .claude-team/ state (kills workers + tmux session)
```

**One session at a time:** `loom crew` blocks if a session is already active. Run `loom reset --force` to clear it.

---

## Worker types

Each type gets a role-specific system prompt. Read-only roles do **not** receive `--dangerously-skip-permissions`.

| Type | Role | Modifies files? |
|---|---|---|
| `explore` | Maps code, documents structure and connections | No |
| `plan` | Reasons about approach, produces ordered action plan | No |
| `code-reviewer` | Audits for correctness, security, quality; assigns severity | No |
| `frontend-developer` | UI, components, styling, client-side logic | Yes |
| `general-purpose` | Does whatever the subtask requires (default) | Yes |

---

## Configuration

Run `loom init` to create a `.loomrc` in your project directory:

```json
{
  "workers": 2,
  "agentType": "general-purpose",
  "claimTtlMinutes": 30,
  "staleMinutes": 10,
  "dangerouslySkipPermissions": true
}
```

| Key | Default | Description |
|---|---|---|
| `workers` | 2 | Default worker count when none specified (max 20) |
| `agentType` | `general-purpose` | Default agent type when none specified |
| `claimTtlMinutes` | 30 | Minutes before a crashed worker's claimed task is re-queued |
| `staleMinutes` | 10 | Minutes of dead-pid + log silence before worker is flagged STALE |
| `dangerouslySkipPermissions` | `true` | Pass `--dangerously-skip-permissions` to workers. Required for non-interactive background operation. Set `false` to require interactive approval on each tool use (workers will pause). |

**Note:** When `.loomrc` is loaded from disk, agentloom prints a notice so you're always aware when a project-supplied config is active. A warning is also printed when `dangerouslySkipPermissions: true`.

**Security note:** Be cautious with `.loomrc` files from untrusted repositories — a committed config can set `workers` and `dangerouslySkipPermissions` silently.

---

## State directory

Session state lives in `.claude-team/` (gitignored):

```
.claude-team/
  session.json              Active session metadata
  context/                  Shared context snapshots (workers read + append)
  tasks/                    Task queue — workers claim atomically via file rename
                            Stale claimed tasks (>claimTtlMinutes) auto re-queued
  workers/
    w00.log                 Live stdout from worker 00
    w00.pid                 PID of worker 00 process
    w00-prompt.md           Prompt sent to worker 00
    w00-result.md           Result summary written by worker 00 on completion
    w00-run.mjs             Node.js runner script (tmux mode)
  summary.md                Final synthesis from loom collect
```

---

## Requirements

- Node.js 20+
- Claude Code CLI (`claude`) — authenticated
- tmux (optional — used on Mac/Linux interactive terminals; background processes used on Windows/WSL/CI)

---

## License

MIT
