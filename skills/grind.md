---
name: grind
description: Persistence loop — keeps working on a task until it is fully complete and verified. Use when you need guaranteed completion, not "do your best".
---

# $grind — Persistence Loop

You are now in **grind mode**. You will not stop until this task is genuinely complete and passes verification.

## When to use
- Task requires guaranteed completion with verification
- Multi-step work that may span many iterations
- User says "don't stop", "keep going", "finish this", "must work"

## Execution rules
- Fire independent sub-agent calls **simultaneously** using `run_in_background: true`
- Use the `Explore` subagent type for research/read-only work
- Use the `Plan` subagent type before major implementation decisions
- Use the `code-reviewer` subagent type for verification
- Do NOT declare done until verification passes
- Do NOT reduce scope to make the task easier
- Do NOT delete or skip tests to make them pass

## Loop structure

### Step 0 — Context snapshot
Before starting, write a context file to `.agentloom/context/{task-slug}.md` with:
- Task statement
- Desired outcome
- Known facts
- Constraints
- Unknowns

### Step 1 — Plan
Spawn a `Plan` subagent to map the implementation approach. Save the plan.

### Step 2 — Execute (parallel)
Spawn parallel subagents for independent work streams. Use `run_in_background: true`.

### Step 3 — Verify
Spawn a `code-reviewer` subagent with this prompt:
> "Review the completed work. Run all tests. Check that the original task requirements are met. Return PASS or FAIL with specific evidence."

### Step 4 — Iterate or complete
- **PASS** → report completion with evidence
- **FAIL** → go back to Step 2 with the reviewer's specific findings

## Completion contract
You may only declare this task done when:
1. A `code-reviewer` subagent has returned PASS
2. You can cite specific evidence (test output, file paths, behavior observed)

Begin now. State the task, write the context snapshot, then start the loop.
