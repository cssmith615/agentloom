import { readFile, writeFile } from 'fs/promises'
import { existsSync } from 'fs'

export const LOOMRC = '.loomrc'

export const MAX_WORKERS = 20

export type LoomConfig = {
  workers?: number           // default worker count (default: 2)
  agentType?: string         // default agent type (default: general-purpose)
  claimTtlMinutes?: number   // minutes before a claimed task is re-queued (default: 30)
  staleMinutes?: number      // minutes of pid-dead + log silence before "STALE" (default: 10)
  dangerouslySkipPermissions?: boolean  // pass --dangerously-skip-permissions to workers (default: true)
}

const DEFAULTS: Required<LoomConfig> = {
  workers: 2,
  agentType: 'general-purpose',
  claimTtlMinutes: 30,
  staleMinutes: 10,
  // Default true: background workers must skip permission prompts to run non-interactively.
  // Set to false in .loomrc to require interactive approval (workers will pause on each action).
  dangerouslySkipPermissions: true,
}

function validateConfig(raw: Record<string, unknown>): Partial<LoomConfig> {
  const out: Partial<LoomConfig> = {}

  if ('workers' in raw) {
    const v = raw['workers']
    if (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= MAX_WORKERS) {
      out.workers = v
    } else {
      process.stderr.write(`[agentloom] Warning: invalid workers value (${JSON.stringify(v)}) — using default\n`)
    }
  }
  if ('agentType' in raw) {
    const v = raw['agentType']
    if (typeof v === 'string' && v.length > 0) {
      out.agentType = v
    } else {
      process.stderr.write(`[agentloom] Warning: invalid agentType value (${JSON.stringify(v)}) — using default\n`)
    }
  }
  if ('claimTtlMinutes' in raw) {
    const v = raw['claimTtlMinutes']
    if (typeof v === 'number' && v > 0) {
      out.claimTtlMinutes = v
    } else {
      process.stderr.write(`[agentloom] Warning: invalid claimTtlMinutes value (${JSON.stringify(v)}) — using default\n`)
    }
  }
  if ('staleMinutes' in raw) {
    const v = raw['staleMinutes']
    if (typeof v === 'number' && v > 0) {
      out.staleMinutes = v
    } else {
      process.stderr.write(`[agentloom] Warning: invalid staleMinutes value (${JSON.stringify(v)}) — using default\n`)
    }
  }
  if ('dangerouslySkipPermissions' in raw) {
    const v = raw['dangerouslySkipPermissions']
    if (typeof v === 'boolean') {
      out.dangerouslySkipPermissions = v
    } else {
      process.stderr.write(`[agentloom] Warning: invalid dangerouslySkipPermissions value (${JSON.stringify(v)}) — using default\n`)
    }
  }

  return out
}

export async function loadConfig(): Promise<Required<LoomConfig>> {
  if (!existsSync(LOOMRC)) return { ...DEFAULTS }
  try {
    const raw = await readFile(LOOMRC, 'utf8')
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return { ...DEFAULTS }
    return { ...DEFAULTS, ...validateConfig(parsed as Record<string, unknown>) }
  } catch {
    process.stderr.write(`[agentloom] Warning: could not parse ${LOOMRC} — using defaults\n`)
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
    dangerouslySkipPermissions: true,
  }

  await writeFile(LOOMRC, JSON.stringify(config, null, 2) + '\n')
  console.log(`Created ${LOOMRC}`)
  console.log(`\nOptions:`)
  console.log(`  workers                     Default number of workers, max ${MAX_WORKERS} (default: 2)`)
  console.log(`  agentType                   Default agent type (default: general-purpose)`)
  console.log(`  claimTtlMinutes             Minutes before crashed worker's task is re-queued (default: 30)`)
  console.log(`  staleMinutes                Minutes before dead-pid worker is flagged STALE (default: 10)`)
  console.log(`  dangerouslySkipPermissions  Workers skip permission prompts (default: true)`)
}
