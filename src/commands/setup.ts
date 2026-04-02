import { mkdir, copyFile, readdir } from 'fs/promises'
import { join, dirname } from 'path'
import { homedir } from 'os'
import { existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SKILLS_SRC = join(__dirname, '../../skills')
const SKILLS_DEST = join(homedir(), '.claude', 'skills')

export async function setup(): Promise<void> {
  console.log('agentloom setup\n')

  // 1. Validate claude CLI exists
  try {
    execSync('claude --version', { stdio: 'ignore' })
    console.log('✓ claude CLI found')
  } catch {
    console.error('✗ claude CLI not found — install Claude Code first')
    process.exit(1)
  }

  // 2. Install skills
  await mkdir(SKILLS_DEST, { recursive: true })
  let skills: string[]
  try {
    skills = await readdir(SKILLS_SRC)
  } catch {
    console.error('✗ Could not find skills directory — package may be misconfigured')
    process.exit(1)
  }
  for (const skill of skills.filter(f => f.endsWith('.md'))) {
    const dest = join(SKILLS_DEST, skill)
    await copyFile(join(SKILLS_SRC, skill), dest)
    console.log(`✓ skill installed: ${skill}`)
  }

  // 3. Check tmux (optional)
  try {
    execSync('tmux -V', { stdio: 'ignore' })
    console.log('✓ tmux found — crew mode will use split panes')
  } catch {
    console.log('~ tmux not found — crew mode will use background processes')
  }

  console.log('\nSetup complete.')
  console.log('\nGet started:')
  console.log('  loom crew "your task here"')
  console.log('  or use $grind / $crew inside a Claude Code session')
}
