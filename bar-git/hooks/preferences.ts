import type { Preferences, Provenance } from '../types'
import { TEXT } from './text'

// The buttons only say what to do: how a commit or an integration is done here
// stays with the project's own skills and CLAUDE.md.
export const DEFAULTS: Preferences = {
  showIcon: true,
  showBranch: true,
  showFiles: true,
  showLines: true,
  showAhead: true,
  showCommit: true,
  showIntegrate: true,
  icon: '⎇',
  commitLabel: TEXT.defaultCommitLabel,
  integrateLabel: TEXT.defaultIntegrateLabel,
  commitPrompt: TEXT.defaultCommitPrompt,
  integratePrompt: TEXT.defaultIntegratePrompt,
  iconColor: 'red',
  branchColor: '#8a8a8a',
  addedColor: 'success',
  removedColor: 'error',
  mutedColor: '#8a8a8a',
}

export type Flag = { [K in keyof Preferences]: Preferences[K] extends boolean ? K : never }[keyof Preferences]
export type Words = { [K in keyof Preferences]: Preferences[K] extends string ? K : never }[keyof Preferences]

// The pane's fields, in the order drawn, each with what it may hold. Input
// draws its own colon after the label.
export const PARTS: [Flag, string][] = [
  ['showIcon', TEXT.showIcon],
  ['showBranch', TEXT.showBranch],
  ['showFiles', TEXT.showFiles],
  ['showLines', TEXT.showLines],
  ['showAhead', TEXT.showAhead],
  ['showCommit', TEXT.showCommit],
  ['showIntegrate', TEXT.showIntegrate],
]
// Each text field with its label and the most characters it takes; the icon
// may be left empty.
export const TEXTS: [Words, string, number, number][] = [
  ['icon', TEXT.iconField, 0, 4],
  ['commitLabel', TEXT.commitField, 1, 24],
  ['commitPrompt', TEXT.promptField, 1, 500],
  ['integrateLabel', TEXT.integrateField, 1, 24],
  ['integratePrompt', TEXT.promptField, 1, 500],
]
export const COLORS: [Words, string][] = [
  ['iconColor', TEXT.iconColor],
  ['branchColor', TEXT.branchColor],
  ['addedColor', TEXT.addedColor],
  ['removedColor', TEXT.removedColor],
  ['mutedColor', TEXT.mutedColor],
]

// A hex color, a color's name or a theme key (warning, claude…), as Text paints them.
const COLOR = /^(?:#(?:[0-9a-f]{3}){1,2}|[a-z][a-z0-9]*)$/i

/** Whether a text typed in the pane is a color Text can paint. */
export const isColor = (text: string) => COLOR.test(text)

/** Whether a text typed in the pane is `min` to `max` characters long. */
export const isLength = (text: string, min: number, max: number) => text.length >= min && text.length <= max

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
