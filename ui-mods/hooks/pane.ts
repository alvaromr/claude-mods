import type { Mod } from '../types'
import type { Group } from './list'
import { keyOf } from './mods'
import { TEXT } from './text'

/** The checkbox drawn on and off: no surface draws a native one, so a full square on and an empty one off, on every one. */
export const BOXES: [string, string] = ['■', '□']

/**
 * The ground of the row under the pointer: a faint wash of gray in the desktop
 * app; the terminal, with no alpha, takes a solid one.
 */
export const hoverBgOf = (surface: string) => (surface === 'desktop' ? '#8080801f' : '#3a3f4b')

/** How many of the mods are active. */
export const activeOf = (listed: readonly Mod[]) => listed.filter(mod => mod.isEnabled).length

/**
 * The mods as the rows draw them: one list per marketplace, under its name,
 * and in it one per author, so each row carries the mod's alone. A plugin
 * installed in more than one scope says which each row is. `pending`: the keys
 * switched and not applied yet; `unfolded`: the keys whose description is shown.
 */
export const groupsOf = (listed: readonly Mod[], pending: readonly string[], unfolded: readonly string[]): Group[] => {
  const marketOf = (mod: Mod) => mod.id.split('@')[1] ?? ''
  const authorOf = (mod: Mod) => mod.author ?? TEXT.noAuthor
  const nameOf = (mod: Mod) => {
    const name = mod.id.split('@')[0] ?? mod.id

    return mod.scope !== undefined && listed.some(one => one !== mod && one.id === mod.id)
      ? TEXT.inScope(name, TEXT.scopes[mod.scope] ?? mod.scope)
      : name
  }

  return [...new Set(listed.map(marketOf))].map(market => {
    const own = listed.filter(mod => marketOf(mod) === market)

    return {
      market,
      authors: [...new Set(own.map(authorOf))].map(author => ({
        author,
        rows: own
          .filter(mod => authorOf(mod) === author)
          .map(mod => ({
            id: keyOf(mod),
            name: nameOf(mod),
            isEnabled: mod.isEnabled,
            isLocked: mod.isLocked === true,
            isPending: pending.includes(keyOf(mod)),
            isOpen: unfolded.includes(keyOf(mod)),
            description: mod.description,
          })),
      })),
    }
  })
}
