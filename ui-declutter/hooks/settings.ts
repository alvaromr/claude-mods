import type { Level, Preferences, Provenance } from '../types'
import { TEXT } from './text'

// The levels the pane offers, the diffs, the commands and the skills alike,
// from least to most drawn.
export const LEVELS = [
  { value: 'hidden', label: TEXT.levels.hidden },
  { value: 'summary', label: TEXT.levels.summary },
  { value: 'full', label: TEXT.levels.full },
] as const satisfies readonly { value: Level; label: string }[]

export const DEFAULTS: Preferences = {
  isOn: true,
  diffs: 'summary',
  commands: 'summary',
  skills: 'summary',
  startsOpen: false,
}

/** The saved settings over the defaults, a field the save lacks or holds of another kind taking its default. */
export const loaded = (saved: unknown): Preferences => {
  const given = (typeof saved === 'object' && saved !== null ? saved : {}) as Record<string, unknown>
  const level = (key: 'diffs' | 'commands' | 'skills') =>
    LEVELS.find(({ value }) => value === given[key])?.value ?? DEFAULTS[key]

  return {
    isOn: typeof given.isOn === 'boolean' ? given.isOn : DEFAULTS.isOn,
    diffs: level('diffs'),
    commands: level('commands'),
    skills: level('skills'),
    startsOpen: typeof given.startsOpen === 'boolean' ? given.startsOpen : DEFAULTS.startsOpen,
  }
}

/** Where a session's settings came from, as it starts: its project's saved ones, else the global ones, else the defaults. */
export const provenanceOf = (project: unknown, global: unknown): Provenance => ({
  source: project !== undefined ? 'project' : global !== undefined ? 'global' : 'defaults',
  isChanged: false,
  hasProject: project !== undefined,
})

/** The store's key for the session's project, by its root folder; none where the session tells no root. */
export const projectKeyOf = (root: string | null) => (root === null ? undefined : `settings:${root}`)

/** Where the settings came from once saved `where`: no longer changed, and the project's own known if that is where they went. */
export const savedAs = (was: Provenance, where: 'project' | 'global'): Provenance => ({
  source: where,
  isChanged: false,
  hasProject: was.hasProject || where === 'project',
})

/** Whether the session's settings differ from the saved ones. */
export const isUnsaved = (now: Preferences, saved: Preferences) =>
  (Object.keys(DEFAULTS) as (keyof Preferences)[]).some(field => now[field] !== saved[field])
