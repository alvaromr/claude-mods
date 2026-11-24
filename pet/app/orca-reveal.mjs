// Brings a chat Orca runs to the front, by its workspace and the id Orca gives it: Orca's CLI switches
// to a terminal alone, so this asks Orca's runtime itself, through the client Orca's own CLI uses, to
// activate the chat's tab as Orca's own window does. Orca's window takes a chat's tab only in the
// workspace it shows, and leaves one in any other as it was, so the chat's workspace is shown first: a
// repo's by Orca's runtime, a bot's folder by the bot's link, which opens the bot's chat in it; a folder
// no bot has Orca shows only from its sidebar. The pet runs it in Orca's Node (ELECTRON_RUN_AS_NODE) as
// `orca-reveal.mjs <Orca's CLI folder> <worktree id> <chat id> [<bot id>]`; it ends in failure, saying
// why on a line, when Orca does not take it, as for a tab Orca has not.
import { execFile } from 'node:child_process'
import { createRequire } from 'node:module'
import process from 'node:process'
import { setTimeout } from 'node:timers/promises'
import { promisify } from 'node:util'

const [cli, worktreeId, chatId, botId] = process.argv.slice(2)
const require = createRequire(import.meta.url)
const { RuntimeClient } = require(`${cli}/runtime/client.js`)
const { getDefaultUserDataPath } = require(`${cli}/runtime/profile/metadata.js`)

// with no pairing code nor environment, the client asks this machine's Orca
const client = new RuntimeClient(getDefaultUserDataPath(), undefined, null, null)
const isShown = async () =>
  (await client.call('worktree.ps', {})).result.worktrees.some(
    worktree => worktree.worktreeId === worktreeId && worktree.isActive === true,
  )

try {
  if (!(await isShown())) {
    if (!worktreeId.startsWith('folder:')) {
      await client.call('worktree.activate', { worktree: `id:${worktreeId}`, navigation: 'host' })
    } else if (botId) {
      await promisify(execFile)('open', [`orca://bot/${botId}`])
    } else {
      throw new Error(`Orca shows the folder workspace ${worktreeId} only from its sidebar`)
    }
    // Orca's window takes a moment to show it
    for (let waited = 0; !(await isShown()); waited += 100) {
      if (waited >= 3000) throw new Error(`Orca did not show the workspace ${worktreeId}`)
      await setTimeout(100)
    }
  }
  await client.call('session.tabs.activate', {
    worktree: `id:${worktreeId}`,
    tabId: `agent-session:${chatId}`,
    navigation: 'host',
    intent: 'user',
  })
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
}
// the client may keep its connection open, which would keep the process alive
process.exit(0)
