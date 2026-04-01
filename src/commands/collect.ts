import { readFile, readdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'
import { spawnSync } from 'child_process'
import { STATE_DIR, readSession, readTasks } from '../state/session.js'

const WORKERS_DIR = join(STATE_DIR, 'workers')

export async function collect(args: string[]): Promise<void> {
  if (!existsSync(WORKERS_DIR)) {
    console.log('No session found. Run: loom crew "<task>"')
    return
  }

  const session = await readSession()
  const tasks = await readTasks()

  const files = await readdir(WORKERS_DIR)
  const resultFiles = files.filter(f => f.endsWith('-result.md')).sort()

  if (resultFiles.length === 0) {
    console.log('No worker results yet. Check status with: loom status')
    console.log('Workers still running? Check: loom logs')
    return
  }

  console.log(`\nCollecting results from ${resultFiles.length} worker(s)...\n`)

  const results: Array<{ workerId: string; content: string }> = []
  for (const f of resultFiles) {
    const workerId = f.replace('-result.md', '')
    const content = await readFile(join(WORKERS_DIR, f), 'utf8')
    results.push({ workerId, content })
    console.log(`  ✓ ${workerId}`)
  }

  const taskDesc = session?.description ?? 'unknown task'
  const summaryPath = join(STATE_DIR, 'summary.md')

  // Build raw summary
  const raw = results.map(r => `## ${r.workerId}\n\n${r.content.trim()}`).join('\n\n---\n\n')

  // Optionally synthesize with Claude
  const synthesize = !args.includes('--no-ai')
  let synthesis = ''

  if (synthesize) {
    console.log('\nSynthesizing with Claude...')
    const prompt = `You are summarizing the results of a multi-agent crew that worked on this task:

"${taskDesc}"

Here are the individual worker results:

${raw}

Write a concise synthesis (under 300 words) that:
1. States what was accomplished overall
2. Highlights the key findings or changes from each worker
3. Calls out any blockers, conflicts, or follow-up work needed

Be direct and specific. No filler.`

    const result = spawnSync('claude', ['--print', '-p', prompt], {
      encoding: 'utf8',
      timeout: 60_000,
    })

    if (result.status === 0 && result.stdout.trim()) {
      synthesis = result.stdout.trim()
    }
  }

  const summaryContent = [
    `# Crew Summary`,
    ``,
    `**Task:** ${taskDesc}`,
    `**Workers:** ${resultFiles.length}`,
    `**Collected:** ${new Date().toISOString()}`,
    ``,
    synthesis ? `## Synthesis\n\n${synthesis}` : '',
    synthesis ? `\n---\n` : '',
    `## Individual Results`,
    ``,
    raw,
  ].filter(l => l !== undefined).join('\n')

  await writeFile(summaryPath, summaryContent)

  console.log(`\nSummary written to: ${summaryPath}`)
  if (synthesis) {
    console.log('\n── Synthesis ─────────────────────────────────')
    console.log(synthesis)
  }
}
