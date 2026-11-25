import type { Preferences, Provenance } from '../types'
import { TEXT } from './text'

export const DEFAULTS: Preferences = {
  showSession: true,
  showWeek: true,
  showModels: true,
  showBar: true,
  showCursor: true,
  showPercent: true,
  showPace: true,
  showReset: true,
  showRatio: true,
  sessionLabel: 'Session',
  weekLabel: 'Week',
  cycle: false,
  cycleSeconds: 8,
  lowColor: '#8a8a8a',
  midColor: '#d78700',
  highColor: 'red',
  emptyColor: '#5f5f5f',
  mutedColor: '#8a8a8a',
  midFrom: 50,
  highFrom: 71,
  paceMidFrom: 95,
  paceHighFrom: 120,
  paceFast: 125,
}

export type Flag = { [K in keyof Preferences]: Preferences[K] extends boolean ? K : never }[keyof Preferences]
export type Count = { [K in keyof Preferences]: Preferences[K] extends number ? K : never }[keyof Preferences]
export type Words = { [K in keyof Preferences]: Preferences[K] extends string ? K : never }[keyof Preferences]

// The pane's fields, in the order drawn, each with what it may hold.
export const WINDOWS: [Flag, string][] = [
  ['showSession', TEXT.showSession],
  ['showWeek', TEXT.showWeek],
  ['showModels', TEXT.showModels],
]
export const PARTS: [Flag, string][] = [
  ['showBar', TEXT.showBar],
  ['showCursor', TEXT.showCursor],
  ['showPercent', TEXT.showPercent],
  ['showPace', TEXT.showPace],
  ['showReset', TEXT.showReset],
  ['showRatio', TEXT.showRatio],
]
// Input draws its own colon after the label.
export const LABELS: [Words, string][] = [
  ['sessionLabel', TEXT.sessionLabel],
  ['weekLabel', TEXT.weekLabel],
]
export const COLORS: [Words, string][] = [
  ['lowColor', TEXT.lowColor],
  ['midColor', TEXT.midColor],
  ['highColor', TEXT.highColor],
  ['emptyColor', TEXT.emptyColor],
  ['mutedColor', TEXT.mutedColor],
]
// The cycle's seconds go with the cycle's switch, apart from the thresholds.
export const CYCLE_SECONDS: [Count, string, number, number] = ['cycleSeconds', TEXT.cycleSeconds, 0, 3600]
export const COUNTS: [Count, string, number, number][] = [
  CYCLE_SECONDS,
  ['midFrom', TEXT.midFrom, 0, 100],
  ['highFrom', TEXT.highFrom, 0, 100],
  ['paceMidFrom', TEXT.paceMidFrom, 0, 1000],
  ['paceHighFrom', TEXT.paceHighFrom, 0, 1000],
  ['paceFast', TEXT.paceFast, 100, 1000],
]
// What a field does, drawn dim under it.
export const NOTES: Partial<Record<Count, string>> = {
  paceFast: TEXT.paceFastNote,
}

// A hex color, a color's name or a theme key (warning, claude…), as Text paints them.
const COLOR = /^(?:#(?:[0-9a-f]{3}){1,2}|[a-z][a-z0-9]*)$/i

// What is wrong with a label or a color typed in the pane; nothing for one that will do.
export const asLabel = (text: string) => (text.length === 0 || text.length > 24 ? TEXT.wordLength : undefined)
export const asColor = (text: string) => (COLOR.test(text) ? undefined : TEXT.notAColor(text))

/** What a text typed in a field says: its words trimmed, and what is wrong with them, `refusal` saying. */
export const entered = (value: string, refusal: (text: string) => string | undefined) => {
  const text = value.trim()

  return { text, refused: refusal(text) }
}

/** The whole number a count field holds, none when it is not plain digits within `min` to `max`. */
export const countOf = (value: string, min: number, max: number) => {
  // Plain digits only: Number alone takes an empty text as 0, and 0x10 or 1e2 as numbers.
  const n = /^\d+$/.test(value.trim()) ? Number(value) : NaN

  return n >= min && n <= max ? n : undefined
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
