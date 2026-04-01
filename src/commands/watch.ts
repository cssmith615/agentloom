import { readdir, stat, readFile } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'
import { STATE_DIR } from '../state/session.js'

const WORKERS_DIR = join(STATE_DIR, 'workers')
const POLL_MS = 800

// A rotating set of ANSI colors for worker prefixes
const COLORS = ['\x1b[36m', '\x1b[33m', '\x1b[35m', '\x1b[32m', '\x1b[34m', '\x1b[31m']
const RESET = '\x1b[0m'
const DIM = '\x1b[2m'

export async function watch(_args: string[]): Promise<void> {
  if (!existsSync(WORKERS_DIR)) {
    console.log('No active session. Run: loom crew "<task>"')
    process.exit(1)
  }

  console.log(`${DIM}Watching worker logs. Ctrl+C to stop.${RESET}\n`)

  // Track how many bytes we've read from each log file
  const offsets: Record<string, number> = {}
  const seen = new Set<string>()

  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (!existsSync(WORKERS_DIR)) break

    const files = await readdir(WORKERS_DIR)
    const logFiles = files.filter(f => f.endsWith('.log')).sort()

    for (const logFile of logFiles) {
      const workerId = logFile.replace('.log', '')
      const color = COLORS[parseInt(workerId.replace('w', ''), 10) % COLORS.length] ?? COLORS[0]
      const filePath = join(WORKERS_DIR, logFile)

      if (!seen.has(workerId)) {
        seen.add(workerId)
        const resultExists = existsSync(join(WORKERS_DIR, `${workerId}-result.md`))
        console.log(`${color}[${workerId}]${RESET} ${DIM}started${resultExists ? ' (already done)' : ''}${RESET}`)
      }

      const currentSize = (await stat(filePath)).size
      const offset = offsets[workerId] ?? 0

      if (currentSize > offset) {
        const buf = await readFile(filePath)
        const newContent = buf.slice(offset).toString('utf8')
        offsets[workerId] = currentSize

        const lines = newContent.split('\n')
        for (const line of lines) {
          if (line.trim()) {
            process.stdout.write(`${color}[${workerId}]${RESET} ${line}\n`)
          }
        }
      }

      // Check if worker just finished (result file appeared)
      const resultPath = join(WORKERS_DIR, `${workerId}-result.md`)
      const doneKey = `${workerId}-done`
      if (existsSync(resultPath) && !seen.has(doneKey)) {
        seen.add(doneKey)
        console.log(`${color}[${workerId}]${RESET} ${DIM}✓ result written${RESET}`)
      }
    }

    // Exit when all known workers have results
    if (logFiles.length > 0) {
      const allDone = logFiles.every(f => {
        const id = f.replace('.log', '')
        return existsSync(join(WORKERS_DIR, `${id}-result.md`))
      })
      if (allDone) {
        console.log(`\n${DIM}All workers done. Run: loom collect${RESET}`)
        break
      }
    }

    await new Promise(resolve => setTimeout(resolve, POLL_MS))
  }
}
