// Brings a chat Orca runs to the front, by its workspace and the id Orca gives it: Orca's CLI switches
// to a terminal alone, so this asks Orca's runtime itself, through the client Orca's own CLI uses, to
// activate the chat's tab as Orca's own window does. The pet runs it in Orca's Node
// (ELECTRON_RUN_AS_NODE) as `orca-reveal.mjs <Orca's CLI folder> <worktree id> <chat id>`; it ends in
// failure, saying why, when Orca does not take it, as for a tab Orca has not.
import { createRequire } from 'node:module'
import process from 'node:process'

const [cli, worktreeId, chatId] = process.argv.slice(2)
const require = createRequire(import.meta.url)
const { RuntimeClient } = require(`${cli}/runtime/client.js`)
const { getDefaultUserDataPath } = require(`${cli}/runtime/profile/metadata.js`)

// with no pairing code nor environment, the client asks this machine's Orca
const client = new RuntimeClient(getDefaultUserDataPath(), undefined, null, null)
await client.call('session.tabs.activate', {
  worktree: `id:${worktreeId}`,
  tabId: `agent-session:${chatId}`,
  navigation: 'host',
  intent: 'user',
})
// the client may keep its connection open, which would keep the process alive
process.exit(0)
