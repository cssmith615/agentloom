import { readFile, readdir } from 'fs/promises'
import { join, basename } from 'path'
import { existsSync } from 'fs'
import { STATE_DIR } from '../state/session.js'

const WORKERS_DIR = join(STATE_DIR, 'workers')

export async function logs(args: string[]): Promise<void> {
  if (!existsSync(WORKERS_DIR)) {
    console.log('No worker logs found. Run: loom crew "<task>"')
    return
  }

  // Sanitize workerId to prevent path traversal
  const rawId = args[0]
  const workerId = rawId ? basename(rawId) : undefined

  if (workerId) {
    // Show log for a specific worker
    const logFile = join(WORKERS_DIR, `${workerId}.log`)
    const resultFile = join(WORKERS_DIR, `${workerId}-result.md`)

    if (existsSync(logFile)) {
      console.log(`\n── ${workerId} log ──────────────────────────────`)
      console.log(await readFile(logFile, 'utf8'))
    }
    if (existsSync(resultFile)) {
      console.log(`\n── ${workerId} result ─────────────────────────`)
      console.log(await readFile(resultFile, 'utf8'))
    }
    if (!existsSync(logFile) && !existsSync(resultFile)) {
      console.log(`No logs found for worker: ${workerId}`)
    }
    return
  }

  // List all workers with status summary
  const files = await readdir(WORKERS_DIR)
  const logFiles = files.filter(f => f.endsWith('.log')).sort()

  if (logFiles.length === 0) {
    console.log('No worker logs yet.')
    return
  }

  for (const logFile of logFiles) {
    const id = logFile.replace('.log', '')
    const content = await readFile(join(WORKERS_DIR, logFile), 'utf8')
    const lines = content.trim().split('\n')
    const hasResult = existsSync(join(WORKERS_DIR, `${id}-result.md`))
    const status = hasResult ? 'done' : lines.length > 0 ? 'running/stopped' : 'empty'
    const lastLine = lines.filter(l => l.trim()).at(-1)?.slice(0, 80) ?? ''

    console.log(`\n[${id}] ${status}`)
    if (lastLine) console.log(`  ${lastLine}`)
    if (hasResult) {
      const result = await readFile(join(WORKERS_DIR, `${id}-result.md`), 'utf8')
      const firstLine = result.trim().split('\n')[0] ?? ''
      console.log(`  result: ${firstLine}`)
    }
  }

  console.log(`\nFull log: loom logs <workerId>`)
}
