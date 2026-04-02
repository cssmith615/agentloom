import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'

export const LOOMRC = '.loomrc'

export type LoomConfig = {
  workers?: number           // default worker count (default: 2)
  agentType?: string         // default agent type (default: general-purpose)
  claimTtlMinutes?: number   // minutes before a claimed task is re-queued (default: 30)
  staleMinutes?: number      // minutes of pid-dead + log silence before "STALE" (default: 10)
  dangerouslySkipPermissions?: boolean  // override: always pass flag regardless of role
}

const DEFAULTS: Required<LoomConfig> = {
  workers: 2,
  agentType: 'general-purpose',
  claimTtlMinutes: 30,
  staleMinutes: 10,
  dangerouslySkipPermissions: false,
}

export async function loadConfig(): Promise<Required<LoomConfig>> {
  if (!existsSync(LOOMRC)) return { ...DEFAULTS }
  try {
    const raw = await readFile(LOOMRC, 'utf8')
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return { ...DEFAULTS }
    return { ...DEFAULTS, ...(parsed as Partial<LoomConfig>) }
  } catch {
    console.error(`[agentloom] Warning: could not parse ${LOOMRC} — using defaults`)
    return { ...DEFAULTS }
  }
}

export async function initConfig(): Promise<void> {
  if (existsSync(LOOMRC)) {
    console.log(`${LOOMRC} already exists.`)
    return
  }

  const config: LoomConfig = {
    workers: 2,
    agentType: 'general-purpose',
    claimTtlMinutes: 30,
    staleMinutes: 10,
  }

  await writeFile(LOOMRC, JSON.stringify(config, null, 2) + '\n')
  console.log(`Created ${LOOMRC}`)
  console.log(`\nOptions:`)
  console.log(`  workers              Default number of workers (default: 2)`)
  console.log(`  agentType            Default agent type (default: general-purpose)`)
  console.log(`  claimTtlMinutes      Minutes before crashed worker's task is re-queued (default: 30)`)
  console.log(`  staleMinutes         Minutes before dead-pid worker is flagged STALE (default: 10)`)
}
