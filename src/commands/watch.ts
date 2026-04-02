import { readdir, stat, readFile } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'
import { STATE_DIR } from '../state/session.js'
import { loadConfig } from '../config.js'

const WORKERS_DIR = join(STATE_DIR, 'workers')
const POLL_MS = 800

const COLORS = ['\x1b[36m', '\x1b[33m', '\x1b[35m', '\x1b[32m', '\x1b[34m', '\x1b[31m']
const RESET = '\x1b[0m'
const DIM = '\x1b[2m'
const YELLOW = '\x1b[33m'

function isProcessAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true } catch { return false }
}

export async function watch(_args: string[]): Promise<void> {
  if (!existsSync(WORKERS_DIR)) {
    console.log('No active session. Run: loom crew "<task>"')
    return
  }

  const config = await loadConfig()
  const STALE_TIMEOUT_MS = config.staleMinutes * 60 * 1000

  console.log(`${DIM}Watching worker logs. Ctrl+C to stop.${RESET}\n`)

  const offsets: Record<string, number> = {}
  const lastGrowth: Record<string, number> = {}
  const seen = new Set<string>()

  while (true) {
    if (!existsSync(WORKERS_DIR)) break

    let files: string[]
    try {
      files = await readdir(WORKERS_DIR)
    } catch {
      break
    }
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

      // Guard stat — file may be deleted mid-poll (e.g. loom reset)
      let currentSize: number
      try {
        currentSize = (await stat(filePath)).size
      } catch {
        continue
      }

      const offset = offsets[workerId] ?? 0
      if (currentSize > offset) {
        const buf = await readFile(filePath).catch(() => null)
        if (buf) {
          lastGrowth[workerId] = Date.now()  // only update after confirming read succeeded
          const newContent = buf.slice(offset).toString('utf8')
          offsets[workerId] = currentSize
          for (const line of newContent.split('\n')) {
            if (line.trim()) process.stdout.write(`${color}[${workerId}]${RESET} ${line}\n`)
          }
        }
      }

      const resultPath = join(WORKERS_DIR, `${workerId}-result.md`)
      const doneKey = `${workerId}-done`
      if (existsSync(resultPath) && !seen.has(doneKey)) {
        seen.add(doneKey)
        console.log(`${color}[${workerId}]${RESET} ${DIM}✓ result written${RESET}`)
      }
    }

    // Exit when all known workers have results
    if (logFiles.length > 0) {
      const workersDone = logFiles.map(f => f.replace('.log', '')).filter(id =>
        existsSync(join(WORKERS_DIR, `${id}-result.md`))
      )

      if (workersDone.length === logFiles.length) {
        console.log(`\n${DIM}All workers done. Run: loom collect${RESET}`)
        break
      }

      // Stale detection: workers with no result, dead PID, and log silent for >15min
      const now = Date.now()
      const staleWorkers: string[] = []
      for (const logFile of logFiles) {
        const id = logFile.replace('.log', '')
        if (existsSync(join(WORKERS_DIR, `${id}-result.md`))) continue

        const pidPath = join(WORKERS_DIR, `${id}.pid`)
        let pidAlive = false
        if (existsSync(pidPath)) {
          const pid = parseInt(await readFile(pidPath, 'utf8').catch(() => ''), 10)
          if (!isNaN(pid)) pidAlive = isProcessAlive(pid)
        }

        const sinceGrowth = now - (lastGrowth[id] ?? now)
        if (!pidAlive && sinceGrowth > STALE_TIMEOUT_MS) {
          staleWorkers.push(id)
        }
      }

      if (staleWorkers.length > 0 && staleWorkers.length + workersDone.length === logFiles.length) {
        console.log(`\n${YELLOW}Workers stalled (dead PID, no output for ${config.staleMinutes}min): ${staleWorkers.join(', ')}${RESET}`)
        console.log(`${DIM}Run: loom logs <workerId>  to inspect. loom collect to gather what's available.${RESET}`)
        break
      }
    }

    await new Promise(resolve => setTimeout(resolve, POLL_MS))
  }
}
