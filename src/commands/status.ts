import { readSession, readTasks, readWorkers } from '../state/session.js'
import { existsSync } from 'fs'
import { STATE_DIR } from '../state/session.js'

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
  const workers = await readWorkers()

  const pending = tasks.filter(t => t.status === 'pending').length
  const claimed = tasks.filter(t => t.status === 'claimed').length
  const done = tasks.filter(t => t.status === 'done').length
  const failed = tasks.filter(t => t.status === 'failed').length

  console.log(`\nSession: ${session.id}`)
  console.log(`Status:  ${session.status}`)
  console.log(`Task:    ${session.description}`)
  console.log(`Started: ${session.createdAt}`)
  console.log(`\nTasks:   ${pending} pending  ${claimed} active  ${done} done  ${failed} failed`)
  console.log(`Workers: ${workers.length} (${session.workerCount} total)`)

  if (workers.length > 0) {
    console.log('\nWorker status:')
    for (const w of workers) {
      const task = w.currentTaskId ? tasks.find(t => t.id === w.currentTaskId) : null
      const desc = task ? `  → ${task.description.slice(0, 60)}` : ''
      console.log(`  [${w.id}] ${w.status}${desc}`)
    }
  }
}
