import type { Mod } from '../types'
import { keyOf } from './mods'

/** The keys with `key` added, or taken out if it is there: a mod switched twice is back to what the session runs. */
export const flipped = (keys: string[], key: string) =>
  keys.includes(key) ? keys.filter(one => one !== key) : [...keys, key]

/** The mods with the one at `key` drawn switched to `isEnabled`, and no other row touched. */
export const withSwitch = (list: Mod[], key: string, isEnabled: boolean) =>
  list.map(one => (keyOf(one) === key ? { ...one, isEnabled } : one))

/** The switches still pending once a reload failed: the ones it took off, and the ones pressed meanwhile, each once. */
export const restored = (unapplied: string[], now: string[]) => [...new Set([...unapplied, ...now])]

/** The unfolded keys with `key` added, or taken out if it is there. */
export const folded = (ids: string[], key: string) =>
  ids.includes(key) ? ids.filter(one => one !== key) : [...ids, key]

/** What a press on the rows says (`data` of the `ui.message`): the key of the switch pressed and the one of the row to unfold. */
export const pressOf = (data: unknown) => {
  const { toggle, fold } = (data ?? {}) as { toggle?: unknown; fold?: unknown }

  return { toggle, fold: typeof fold === 'string' ? fold : undefined }
}

/** The mod at `key` when its switch can be pressed: a locked one has none. */
export const switchable = (list: Mod[], key: unknown) => {
  const mod = list.find(one => keyOf(one) === key)

  return mod !== undefined && mod.isLocked !== true ? mod : undefined
}
