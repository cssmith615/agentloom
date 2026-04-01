import { readSession, readTasks, STATE_DIR } from '../state/session.js'
import { existsSync, statSync } from 'fs'
import { join } from 'path'
import { readdir, readFile } from 'fs/promises'

const STALE_THRESHOLD_MS = 10 * 60 * 1000 // 10 min with no log growth AND no live PID = stale

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

export async function status(): Promise<void> {
  if (!existsSync(STATE_DIR)) {
    console.log('No active session. Run: loom crew "<task>"')
    return
  }

  const session = await readSession()
  if (!session) {
    console.log('No session found.')
    return
  }

  const tasks = await readTasks()

  const pending = tasks.filter(t => t.status === 'pending').length
  const claimed = tasks.filter(t => t.status === 'claimed').length
  const done = tasks.filter(t => t.status === 'done').length
  const failed = tasks.filter(t => t.status === 'failed').length

  console.log(`\nSession: ${session.id}`)
  console.log(`Status:  ${session.status}`)
  console.log(`Task:    ${session.description}`)
  console.log(`Started: ${session.createdAt}`)
  console.log(`\nTasks:   ${pending} pending  ${claimed} active  ${done} done  ${failed} failed`)

  // Worker status from log files
  const workersDir = join(STATE_DIR, 'workers')
  if (!existsSync(workersDir)) return

  const files = await readdir(workersDir)
  const logFiles = files.filter(f => f.endsWith('.log')).sort()

  if (logFiles.length === 0) return

  console.log(`\nWorkers: ${logFiles.length}`)
  const now = Date.now()

  for (const logFile of logFiles) {
    const workerId = logFile.replace('.log', '')
    const logPath = join(workersDir, logFile)
    const resultPath = join(workersDir, `${workerId}-result.md`)
    const hasResult = existsSync(resultPath)

    if (hasResult) {
      console.log(`  [${workerId}] done ✓`)
      continue
    }

    // Check PID liveness first — a quiet log doesn't mean a dead worker
    const pidPath = join(workersDir, `${workerId}.pid`)
    let pidAlive = false
    if (existsSync(pidPath)) {
      const pid = parseInt(await readFile(pidPath, 'utf8').catch(() => ''), 10)
      if (!isNaN(pid)) pidAlive = isProcessAlive(pid)
    }

    const logStat = statSync(logPath)
    const msSinceWrite = now - logStat.mtimeMs
    const logSize = logStat.size

    if (logSize === 0 && pidAlive) {
      console.log(`  [${workerId}] starting... (pid alive)`)
    } else if (logSize === 0) {
      console.log(`  [${workerId}] starting...`)
    } else if (pidAlive) {
      const secs = Math.round(msSinceWrite / 1000)
      console.log(`  [${workerId}] running  (pid alive, last log ${secs}s ago)`)
    } else if (msSinceWrite > STALE_THRESHOLD_MS) {
      const mins = Math.round(msSinceWrite / 60000)
      console.log(`  [${workerId}] STALE — pid dead, no log activity for ${mins}m`)
    } else {
      const secs = Math.round(msSinceWrite / 1000)
      console.log(`  [${workerId}] stopped? — pid dead, last log ${secs}s ago`)
    }
  }

  const allDone = logFiles.every(f =>
    existsSync(join(workersDir, f.replace('.log', '-result.md')))
  )
  if (allDone && logFiles.length > 0) {
    console.log(`\nAll workers done. Run: loom collect`)
  }
}
