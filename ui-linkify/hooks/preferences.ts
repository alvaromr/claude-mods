import type { Preferences, Provenance } from '../types'

// Everything on; no Jira until the person says where theirs live.
export const DEFAULTS: Preferences = {
  paths: true,
  jira: true,
  site: '',
  keys: '',
  title: true,
  images: true,
  draft: true,
  resend: true,
  columns: 80,
  rows: 20,
  commands: true,
}

// An address of a Jira site.
export const SITE = /^https?:\/\/[^\s()]+$/

// Project keys separated by commas.
export const KEYS = /^[A-Za-z][A-Za-z0-9_]*(?:\s*,\s*[A-Za-z][A-Za-z0-9_]*)*$/

/** Whether some part links or draws, as the pane's button shows. */
export const isActive = (s: Preferences) => s.paths || s.jira || s.images || s.draft || s.commands

/** Whether a text typed in a words field is refused: anything but nothing that does not fit `pattern`. */
export const isRefused = (text: string, pattern: RegExp) => text !== '' && !pattern.test(text)

/** The whole number a count field holds, none when it is not one within `min` to `max`. */
export const countOf = (text: string, min: number, max: number) => {
  const n = Number(text)

  return Number.isInteger(n) && n >= min && n <= max ? n : undefined
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
