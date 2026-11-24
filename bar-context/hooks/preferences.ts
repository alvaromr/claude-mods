import type { Preferences, Provenance } from '../types'
import { TEXT } from './text'

export const DEFAULTS: Preferences = {
  showModel: true,
  showEffort: true,
  showContext: true,
  showBar: true,
  showPercent: true,
  showTokens: false,
  showSpeed: true,
  showAverage: true,
  showCost: false,
  showCache: true,
  showCacheTokens: true,
  showMiss: true,
  showCacheWarning: true,
  showCompact: true,
  contextLabel: 'Context',
  cacheLabel: 'Cache',
  compactLabel: TEXT.compactDefault,
  modelColor: '#8787d7',
  effortColor: '#8787d7',
  lowColor: '#8a8a8a',
  midColor: '#d78700',
  highColor: 'red',
  emptyColor: '#5f5f5f',
  speedColor: '#d7af5f',
  cacheColor: '#8a8a8a',
  cacheWarnColor: 'red',
  // A red of its own, stronger than the theme's error color.
  compactColor: '#cc0000',
  mutedColor: '#8a8a8a',
  warningColor: 'error',
  midFrom: 50,
  highFrom: 71,
  cacheSoonMinutes: 5,
  compactFrom: 65,
  missShownMinutes: 10,
  cacheTtl: 'auto',
}

export type Flag = { [K in keyof Preferences]: Preferences[K] extends boolean ? K : never }[keyof Preferences]
export type Count = { [K in keyof Preferences]: Preferences[K] extends number ? K : never }[keyof Preferences]
export type Words = { [K in keyof Preferences]: Preferences[K] extends string ? K : never }[keyof Preferences]

// The pane's fields, in the order drawn, each with what it may hold. Input
// draws its own colon after the label.
export const PARTS: [Flag, string][] = [
  ['showModel', TEXT.showModel],
  ['showEffort', 'Effort'],
  ['showContext', TEXT.showContext],
  ['showBar', TEXT.showBar],
  ['showPercent', TEXT.showPercent],
  ['showTokens', TEXT.showTokens],
  ['showSpeed', TEXT.showSpeed],
  ['showAverage', TEXT.showAverage],
  ['showCost', TEXT.showCost],
  ['showCache', TEXT.showCache],
  ['showCacheTokens', TEXT.showCacheTokens],
  ['showMiss', TEXT.showMiss],
  ['showCacheWarning', TEXT.showCacheWarning],
  ['showCompact', TEXT.showCompact],
]
export const LABELS: [Words, string][] = [
  ['contextLabel', TEXT.contextLabel],
  ['cacheLabel', TEXT.cacheLabel],
  ['compactLabel', TEXT.compactLabel],
]
export const COLORS: [Words, string][] = [
  ['modelColor', TEXT.modelColor],
  ['effortColor', 'Effort'],
  ['lowColor', TEXT.lowColor],
  ['midColor', TEXT.midColor],
  ['highColor', TEXT.highColor],
  ['emptyColor', TEXT.emptyColor],
  ['speedColor', TEXT.speedColor],
  ['cacheColor', TEXT.cacheColor],
  ['cacheWarnColor', TEXT.cacheWarnColor],
  ['mutedColor', TEXT.mutedColor],
  ['warningColor', TEXT.warningColor],
  ['compactColor', TEXT.compactColor],
]
export const COUNTS: [Count, string, number, number][] = [
  ['midFrom', TEXT.midFrom, 0, 100],
  ['highFrom', TEXT.highFrom, 0, 100],
  ['cacheSoonMinutes', TEXT.cacheSoonMinutes, 0, 60],
  ['missShownMinutes', TEXT.missShownMinutes, 0, 1440],
  ['compactFrom', TEXT.compactFrom, 0, 100],
]
export const TTLS = [
  { value: 'auto', label: TEXT.ttlAuto },
  { value: '5m', label: TEXT.ttl5m },
  { value: '1h', label: TEXT.ttl1h },
]

// A hex color, a color's name or a theme key (warning, claude…), as Text paints them.
const COLOR = /^(?:#(?:[0-9a-f]{3}){1,2}|[a-z][a-z0-9]*)$/i

/** What is wrong with a label typed in the pane; nothing for one that will do. */
export const labelProblem = (text: string) => (text.length === 0 || text.length > 24 ? TEXT.badLength : undefined)

/** What is wrong with a color typed in the pane; nothing for one that will do. */
export const colorProblem = (text: string) => (COLOR.test(text) ? undefined : TEXT.notAColor(text))

/** The whole number a count field holds, none when it is not plain digits within `min` to `max`. */
export const countOf = (text: string, min: number, max: number) => {
  // Plain digits only: Number alone takes an empty text as 0, and 0x10 or 1e2 as numbers.
  const n = /^\d+$/.test(text.trim()) ? Number(text) : NaN

  return n >= min && n <= max ? n : undefined
}

/** The saved settings over the defaults, a field the save lacks or holds of another type taking its default. */
export const loaded = (saved: unknown): Preferences => {
  const given = (typeof saved === 'object' && saved !== null ? saved : {}) as Record<string, unknown>

  return Object.fromEntries(
    Object.entries(DEFAULTS).map(([key, value]) => [key, typeof given[key] === typeof value ? given[key] : value]),
  ) as Preferences
}

/** Where a session's settings came from, given what the project and the global store held. */
export const provenanceOf = (project: unknown, global: unknown): Provenance => ({
  source: project !== undefined ? 'project' : global !== undefined ? 'global' : 'defaults',
  isChanged: false,
  hasProject: project !== undefined,
})

/** The store's key for a project's settings, by its root folder; none where the session tells no root. */
export const projectKeyOf = (root: string | null) => (root === null ? undefined : `settings:${root}`)

/** What a text typed in a field says: its words trimmed, and what is wrong with them, `refusal` saying. */
export const entered = (value: string, refusal: (text: string) => string | undefined) => {
  const text = value.trim()

  return { text, refused: refusal(text) }
}

/** Where the settings came from once they are saved `where`: unchanged since, and the project's own if saved there. */
export const savedAs = (now: Provenance, where: 'project' | 'global'): Provenance => ({
  source: where,
  isChanged: false,
  hasProject: now.hasProject || where === 'project',
})

/** Whether any field of `now` differs from `saved`. */
export const differs = (now: Preferences, saved: Preferences) =>
  (Object.keys(DEFAULTS) as (keyof Preferences)[]).some(field => now[field] !== saved[field])
