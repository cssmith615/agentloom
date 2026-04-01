---
name: crew
description: Spawn parallel workers on a task. Decomposes the work, runs workers simultaneously, then runs a verification pass. Use when the task is clearly decomposable into independent streams.
---

# $crew — Parallel Workers

You are now in **crew mode**. You will decompose this task, run workers in parallel, and verify the result.

## When to use
- Task has clearly independent work streams (e.g. audit 5 modules, port 3 subsystems)
- Work would benefit from simultaneous execution
- You want one worker per concern (explore / implement / verify)

## When NOT to use
- Task must be done sequentially (each step depends on the last) — use `$grind` instead
- Task is a quick single fix — just do it directly

## Execution rules
- Decompose into **truly independent** subtasks only
- Default crew: 1 `Explore` + 1 `general-purpose` + 1 `code-reviewer`
- For large tasks: up to 4 workers; beyond that, coordination cost exceeds benefit
- Use `run_in_background: true` for all worker spawns
- Collect all results before running the verification pass

## Crew structure

### Step 1 — Decompose
Break the task into N independent subtasks. Write them to `.agentloom/tasks/`.

For each subtask, decide the right agent type:
- `Explore` — research, read files, understand structure (read-only)
- `Plan` — architecture decisions, approach planning
- `general-purpose` — implementation work
- `code-reviewer` — audit, security review, quality check
- `frontend-developer` — UI/component work

### Step 2 — Launch crew (parallel)
Spawn all workers simultaneously with `run_in_background: true`.
Each worker gets: the subtask description + the shared context path.

### Step 3 — Collect results
Wait for all background workers to complete.
Read each result from `.agentloom/workers/`.

### Step 4 — Verify
Spawn a `code-reviewer` subagent across all completed work.
Return PASS or FAIL with evidence.

### Step 5 — Report
Summarize what each worker did and the final verification result.

## Completion contract
Same as `$grind` — only done when verification passes with evidence.

Begin now. Decompose the task, then launch the crew.
