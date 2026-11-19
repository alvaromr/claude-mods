import type { Preferences, Provenance } from '../types'
import { TEXT } from './text'

// As the status line drew it: the parents gray, the project's folder bold cyan.
export const DEFAULTS: Preferences = {
  showParents: true,
  showTilde: true,
  parentColor: '#8a8a8a',
  nameColor: 'cyan',
}

export type Flag = { [K in keyof Preferences]: Preferences[K] extends boolean ? K : never }[keyof Preferences]
export type Words = { [K in keyof Preferences]: Preferences[K] extends string ? K : never }[keyof Preferences]

// The pane's fields, in the order drawn. Input draws its own colon after the label.
export const PARTS: [Flag, string][] = [
  ['showParents', TEXT.showParents],
  ['showTilde', TEXT.showTilde],
]
export const COLORS: [Words, string][] = [
  ['parentColor', TEXT.parentColor],
  ['nameColor', TEXT.nameColor],
]

// A hex color, a color's name or a theme key (warning, claude…), as Text paints them.
const COLOR = /^(?:#(?:[0-9a-f]{3}){1,2}|[a-z][a-z0-9]*)$/i

/** Whether a text typed in the pane is a color Text can paint. */
export const isColor = (text: string) => COLOR.test(text)

/** What a text typed in a field says: its words trimmed, and whether the field refuses them as `isValid` judges. */
export const entered = (value: string, isValid: (text: string) => boolean) => {
  const text = value.trim()

  return { text, isRefused: !isValid(text) }
}

/** The saved settings over the defaults, a field the save lacks or holds of another type taking its default. */
export const loaded = (saved: unknown): Preferences => {
  const given = (typeof saved === 'object' && saved !== null ? saved : {}) as Record<string, unknown>

  return Object.fromEntries(
    Object.entries(DEFAULTS).map(([key, value]) => [key, typeof given[key] === typeof value ? given[key] : value]),
  ) as Preferences
}

/** The store's key for a project's settings, by its root folder; none where the session tells no root. */
export const projectKeyOf = (root: string | null) => (root === null ? undefined : `settings:${root}`)

/** Where a session's settings came from, given what the project and the global store held. */
export const provenanceOf = (project: unknown, global: unknown): Provenance => ({
  source: project !== undefined ? 'project' : global !== undefined ? 'global' : 'defaults',
  isChanged: false,
  hasProject: project !== undefined,
})

/** Where the settings came from once they are saved `where`: unchanged since, and the project's own if saved there. */
export const savedAs = (now: Provenance, where: 'project' | 'global'): Provenance => ({
  source: where,
  isChanged: false,
  hasProject: now.hasProject || where === 'project',
})

/** Whether any field of `now` differs from `saved`. */
export const differs = (now: Preferences, saved: Preferences) =>
  (Object.keys(DEFAULTS) as (keyof Preferences)[]).some(field => now[field] !== saved[field])
