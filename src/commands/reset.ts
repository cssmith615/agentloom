import { rm } from 'fs/promises'
import { existsSync } from 'fs'
import { STATE_DIR } from '../state/session.js'

export async function reset(args: string[]): Promise<void> {
  if (!existsSync(STATE_DIR)) {
    console.log('Nothing to reset.')
    return
  }

  const force = args.includes('--force') || args.includes('-f')

  if (!force) {
    console.log(`This will delete all session state in ${STATE_DIR}/`)
    console.log('Run with --force to confirm: loom reset --force')
    return
  }

  await rm(STATE_DIR, { recursive: true, force: true })
  console.log(`✓ Session state cleared (${STATE_DIR}/)`)
}
