import { rm, readdir, readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { spawnSync } from 'child_process'
import { STATE_DIR, readSession } from '../state/session.js'

const WORKERS_DIR = join(STATE_DIR, 'workers')

export async function reset(args: string[]): Promise<void> {
  if (!existsSync(STATE_DIR)) {
    console.log('Nothing to reset.')
    return
  }

  const force = args.includes('--force') || args.includes('-f')

  if (!force) {
    console.log(`This will kill running workers and delete all session state in ${STATE_DIR}/`)
    console.log('Run with --force to confirm: loom reset --force')
    return
  }

  // Kill any live PID-based workers before deleting their PID files
  if (existsSync(WORKERS_DIR)) {
    try {
      const files = await readdir(WORKERS_DIR)
      const pidFiles = files.filter(f => f.endsWith('.pid'))
      for (const pidFile of pidFiles) {
        const pid = parseInt(await readFile(join(WORKERS_DIR, pidFile), 'utf8').catch(() => ''), 10)
        if (!isNaN(pid)) {
          try {
            process.kill(pid, 'SIGTERM')
            const workerId = pidFile.replace('.pid', '')
            console.log(`  killed worker ${workerId} (pid ${pid})`)
          } catch {
            // Process already dead — ignore
          }
        }
      }
    } catch {
      // Workers dir unreadable — proceed with delete anyway
    }
  }

  // Kill any active tmux session for this loom session
  try {
    const session = await readSession()
    if (session) {
      const tmuxName = `loom-${session.id}`
      const r = spawnSync('tmux', ['kill-session', '-t', tmuxName], { stdio: 'ignore' })
      if (r.status === 0) {
        console.log(`  killed tmux session ${tmuxName}`)
      }
    }
  } catch {
    // No session file or tmux not available — ignore
  }

  await rm(STATE_DIR, { recursive: true, force: true })
  console.log(`✓ Session state cleared (${STATE_DIR}/)`)
}
