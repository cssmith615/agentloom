import { initConfig } from '../config.js'

export async function init(_args: string[]): Promise<void> {
  await initConfig()
}
