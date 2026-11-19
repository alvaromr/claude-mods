import type { AlertFrame, Kind, Look, Preferences, PromptFrame, Provenance } from '../types'
import { TEXT } from './text'

/** The alerts in the pane's order: what must be seen first. */
export const KINDS: Kind[] = ['IMPORTANT', 'CAUTION', 'WARNING', 'TIP', 'NOTE', 'QUOTE']
export const ALERT_FRAMES: readonly AlertFrame[] = ['box', 'lines', 'title']
export const PROMPT_FRAMES: readonly PromptFrame[] = ['normal', 'box', 'lines']

// GitHub's own colours, by the theme's names: blue, green, purple, yellow,
// red; a quote without a marker, gray.
const COLORS: Record<Kind, string> = {
  NOTE: 'suggestion',
  TIP: 'success',
  IMPORTANT: 'merged',
  WARNING: 'warning',
  CAUTION: 'error',
  QUOTE: 'subtle',
}

export const DEFAULTS: Preferences = {
  on: true,
  looks: Object.fromEntries(
    KINDS.map(kind => [kind, { on: true, color: COLORS[kind], frame: 'box', title: TEXT.titles[kind] }]),
  ) as Record<Kind, Look>,
  headings: { on: true, color: 'suggestion' },
  prompts: { frame: 'lines', color: 'permission', dashed: false },
}

// The longest title an alert may have, as the pane says.
const LONGEST_TITLE = 30

const object = (value: unknown) => (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>

// A saved field as its default's type has it, else the default.
const flag = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback)
const word = (value: unknown, fallback: string) => (typeof value === 'string' ? value : fallback)
const oneOf = <T extends string>(options: readonly T[], value: unknown, fallback: T) =>
  options.find(option => option === value) ?? fallback

/**
 * The saved settings over the defaults: a field the save lacks, or holds of
 * another type or out of its options, takes its default. A session's state
 * from an older version of the mod goes through here too.
 */
export const loaded = (saved: unknown): Preferences => {
  const given = object(saved)
  const looks = object(given.looks)
  const headings = object(given.headings)
  const prompts = object(given.prompts)

  return {
    on: flag(given.on, DEFAULTS.on),
    looks: Object.fromEntries(
      KINDS.map(kind => {
        const look = object(looks[kind])
        const fallback = DEFAULTS.looks[kind]

        return [
          kind,
          {
            on: flag(look.on, fallback.on),
            color: word(look.color, fallback.color),
            frame: oneOf(ALERT_FRAMES, look.frame, fallback.frame),
            title: word(look.title, fallback.title),
          },
        ]
      }),
    ) as Record<Kind, Look>,
    headings: { on: flag(headings.on, DEFAULTS.headings.on), color: word(headings.color, DEFAULTS.headings.color) },
    prompts: {
      frame: oneOf(PROMPT_FRAMES, prompts.frame, DEFAULTS.prompts.frame),
      color: word(prompts.color, DEFAULTS.prompts.color),
      dashed: flag(prompts.dashed, DEFAULTS.prompts.dashed),
    },
  }
}

/** Where a session's settings came from, given what the project and the global store held. */
export const provenanceOf = (project: unknown, global: unknown): Provenance => ({
  source: project !== undefined ? 'project' : global !== undefined ? 'global' : 'defaults',
  isChanged: false,
  hasProject: project !== undefined,
})

/** The store's key for a project's settings, by its root folder; none where the session tells no root. */
export const projectKeyOf = (root: string | null) => (root === null ? undefined : `settings:${root}`)

/** Whether the settings `now` differ from the ones `saved`. */
export const differs = (now: Preferences, saved: Preferences) => JSON.stringify(now) !== JSON.stringify(saved)

/** Where the settings came from once they are saved `where`: unchanged since, and the project's own if saved there. */
export const savedAs = (now: Provenance, where: 'project' | 'global'): Provenance => ({
  source: where,
  isChanged: false,
  hasProject: now.hasProject || where === 'project',
})

/** Whether the project keeps settings of its own that the session did not start from. */
export const hasUnusedProject = ({ hasProject, source }: Provenance) => hasProject && source !== 'project'

/** The settings with one alert's look changed by `patch`. */
export const withLook = (now: Preferences, kind: Kind, patch: Partial<Look>): Preferences => ({
  ...now,
  looks: { ...now.looks, [kind]: { ...now.looks[kind], ...patch } },
})

/** A colour as the pane names it: in the person's words, else as the theme or the code has it. */
export const colorName = (color: string) => TEXT.colors[color] ?? TEXT.softColors[color] ?? color

/** What a title typed in the pane says: its words trimmed, and whether they are too long for an alert's title. */
export const titleOf = (text: string) => {
  const title = text.trim()

  return { title, isTooLong: title.length > LONGEST_TITLE }
}
