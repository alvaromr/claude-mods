import type { Mod } from '../types'
import { TEXT } from './text'

/** A plugin as `claude plugin list --json` reports it. */
export type Installed = { id: string; enabled: boolean; installPath: string; scope?: string }

/** What a plugin is told apart by: installed in two scopes, it is two switches. */
export const keyOf = ({ id, scope }: Mod) => (scope === undefined ? id : `${id}:${scope}`)

/** The scopes `claude plugin enable|disable` takes; a session's own (`--plugin-dir`) has none to name. */
export const SCOPES = ['user', 'project', 'local']

/**
 * The mods built into Claude Code, as the table "Mods built into Claude Code"
 * at https://code.claude.com/docs/en/plugins/mods/overview lists them: `claude
 * plugin list` leaves them out, and settings switch them as `<name>@builtin`.
 * Each is on until its switch says otherwise, but `cc-plugin-you-should-know`;
 * `cc-plugin-sec-default` has no switch, its order being the organization's.
 */
const BUILTINS: readonly { name: keyof typeof TEXT.builtins; isOnByDefault: boolean; isLocked?: true }[] = [
  { name: 'cc-plugin-agents-md', isOnByDefault: true },
  { name: 'cc-plugin-diff', isOnByDefault: true },
  { name: 'cc-plugin-plugin-authoring', isOnByDefault: true },
  { name: 'cc-plugin-sec-default', isOnByDefault: true, isLocked: true },
  { name: 'cc-plugin-telemetry', isOnByDefault: true },
  { name: 'cc-plugin-you-should-know', isOnByDefault: false },
]

/** The built-in mods, each on or off as the `enabledPlugins` settings (`switches`) say, else by default. */
export const builtinMods = (switches: unknown): Mod[] => {
  const isOn = (id: string) =>
    typeof switches === 'object' && switches !== null ? (switches as Record<string, unknown>)[id] : undefined

  return BUILTINS.map(({ name, isOnByDefault, isLocked }) => {
    const id = `${name}@builtin`
    const set = isOn(id)

    return {
      id,
      isEnabled: isLocked === true || (typeof set === 'boolean' ? set : isOnByDefault),
      description: TEXT.builtins[name],
      author: TEXT.builtinAuthor,
      ...(isLocked === true ? { isLocked } : {}),
    }
  })
}

/** Whether a plugin is a mod: its hooks.json names a hooks module; plain hook commands, skills or MCP servers alone are not. */
export const isMod = (hooks: Record<string, unknown> | undefined) => Array.isArray(hooks?.modules)

/** The mod an installed plugin is, from what its plugin.json (`manifest`) says of it. */
export const modOf = ({ id, enabled, scope }: Installed, manifest: Record<string, unknown> | undefined): Mod => {
  const { description, author } = manifest ?? {}
  // An author is a name, or an object that carries one.
  const by = typeof author === 'string' ? author : (author as { name?: unknown } | undefined)?.name

  return {
    id,
    isEnabled: enabled,
    description: typeof description === 'string' ? description : TEXT.noDescription,
    ...(typeof by === 'string' && by !== '' ? { author: by } : {}),
    ...(scope === undefined ? {} : { scope }),
  }
}

/** The mods the pane lists: the installed ones by id and scope, then the built-in ones, which are Claude Code's own. */
export const listedMods = (installed: readonly Mod[], switches: unknown): Mod[] => {
  const sorted = [...installed].sort((a, b) => a.id.localeCompare(b.id) || (a.scope ?? '').localeCompare(b.scope ?? ''))

  return [...sorted, ...builtinMods(switches)]
}
