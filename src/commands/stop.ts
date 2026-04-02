import { readFile, readdir } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'
import { STATE_DIR } from '../state/session.js'

const WORKERS_DIR = join(STATE_DIR, 'workers')

export async function stop(args: string[]): Promise<void> {
  if (!existsSync(WORKERS_DIR)) {
    console.log('No active session.')
    return
  }

  const targetId = args[0] // optional: stop a single worker

  const files = await readdir(WORKERS_DIR)
  const pidFiles = files
    .filter(f => f.endsWith('.pid'))
    .filter(f => !targetId || f === `${targetId}.pid`)
    .sort()

  if (pidFiles.length === 0) {
    console.log(targetId ? `No PID file found for ${targetId}.` : 'No worker PID files found.')
    return
  }

  let killed = 0
  let notFound = 0

  for (const pidFile of pidFiles) {
    const workerId = pidFile.replace('.pid', '')
    const pidPath = join(WORKERS_DIR, pidFile)

    const pid = parseInt(await readFile(pidPath, 'utf8').catch(() => ''), 10)
    if (!pid || isNaN(pid)) {
      console.log(`  [${workerId}] no valid PID`)
      continue
    }

    try {
      process.kill(pid, 'SIGTERM')
      killed++
      console.log(`  [${workerId}] killed (pid ${pid})`)
    } catch (err: unknown) {
      if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ESRCH') {
        notFound++
        console.log(`  [${workerId}] not running (pid ${pid} not found)`)
      } else {
        console.log(`  [${workerId}] error: ${err instanceof Error ? err.message : err}`)
      }
    }
  }

  console.log(`\n${killed} killed, ${notFound} already stopped.`)
  if (killed > 0) {
    if (process.platform === 'win32') {
      console.log('  note: SIGTERM on Windows is a force kill (TerminateProcess)')
    }
    console.log('State preserved. Run: loom reset --force  to clear it.')
  }
}
