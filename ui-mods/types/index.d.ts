/**
 * A mod, by its `plugin@marketplace` id: an installed one as `claude plugin list` reports it,
 * with the description and the author its plugin.json gives, or one built into Claude Code
 * (`<name>@builtin`). `scope`: where it is installed (`user`, `project`, `local`), as the CLI says it,
 * for a plugin may be installed in more than one; `isLocked`: no switch turns it off.
 */
export type Mod = {
  id: string
  isEnabled: boolean
  description: string
  author?: string
  scope?: string
  isLocked?: true
}

declare module 'claude-code' {
  interface PluginState {
    'ui-mods': {
      mods: Mod[]
      /** The keys (id and scope) of the mods whose description is unfolded under their name. */
      shown: string[]
      /** The keys of the mods switched since the last reload, which the session does not run as shown yet. */
      pending: string[]
      error: string | null
    }
  }
}
