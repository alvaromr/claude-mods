/**
 * One limit window as last read: the 5-hour session, the week, or a model's
 * week by its name; its share used, 0 to 100, and when it resets, ISO 8601.
 */
export type Limit = { kind: 'five_hour' | 'seven_day' | 'model'; name?: string; percentUsed: number; resetsAt?: string }

/**
 * What the line shows and how, every field set from the settings pane and kept
 * across sessions.
 */
export type Preferences = {
  showSession: boolean
  showWeek: boolean
  /** The weekly limits of one model each (Fable), read from the account's usage endpoint. */
  showModels: boolean
  showBar: boolean
  /** The time elapsed of the window, as a cursor in the bar. */
  showCursor: boolean
  showPercent: boolean
  /** `↑ agota en …` or `↓ sobra N%`, by how fast the window is spent. */
  showPace: boolean
  /** `(3h53m)`, the time until the window resets. */
  showReset: boolean
  sessionLabel: string
  weekLabel: string
  /** One window at a time, the next on a click and every `cycleSeconds` (0: on a click alone). */
  cycle: boolean
  cycleSeconds: number
  lowColor: string
  midColor: string
  highColor: string
  emptyColor: string
  paceColor: string
  mutedColor: string
  /** The share used from which the window takes `midColor`, then `highColor`. */
  midFrom: number
  highFrom: number
  /** Share used over share of the window elapsed, ×100: at or above, it runs out early; at or below, it is left over. */
  paceFast: number
  paceSlack: number
}

/**
 * Where the session's settings came from (its project's saved ones, the
 * global ones or the defaults), whether the session changed them since, and
 * whether its project keeps its own.
 */
export type Provenance = { source: 'project' | 'global' | 'defaults'; isChanged: boolean; hasProject: boolean }

declare module 'claude-code' {
  interface PluginState {
    'bar-limits': {
      origin: Provenance
      /** The session's and the week's windows, as the last response reported them. */
      limits: Limit[]
      /** The weekly limit of each model that has one. */
      models: Limit[]
      settings: Preferences
      /** Which window the line shows while it cycles, counted up without end. */
      view: number
    }
  }
}
