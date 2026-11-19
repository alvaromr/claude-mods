/** The five GitHub alerts, as the marker writes them, and a quote without a marker. */
export type Kind = 'NOTE' | 'TIP' | 'IMPORTANT' | 'WARNING' | 'CAUTION' | 'QUOTE'

/** How an alert is framed: a rounded box, a line above and one below, or its title alone over the text. */
export type AlertFrame = 'box' | 'lines' | 'title'

/** How the person's own prompts are framed: as Claude Code draws them, in a box, or between two lines. */
export type PromptFrame = 'normal' | 'box' | 'lines'

/** How one alert is drawn. */
export type Look = {
  /** Drawn by the mod; off, it is drawn as Claude Code draws a quote. */
  on: boolean
  /** A theme colour's name. */
  color: string
  frame: AlertFrame
  /** The title shown in place of the marker; empty, none. */
  title: string
}

/** What the mod does, every field set from its pane. */
export type Preferences = {
  /** The whole mod: off, Claude Code draws everything as usual and the model is not taught the alerts. */
  on: boolean
  looks: Record<Kind, Look>
  /** The headings (`#` to `######`), bold in a colour of the theme's. */
  headings: { on: boolean; color: string }
  prompts: {
    frame: PromptFrame
    /** A theme colour's name, or a fixed `#rrggbb`. */
    color: string
    /** The box's border or the lines dashed (`╌`, `╎`) rather than solid. */
    dashed: boolean
  }
}

/**
 * Where the session's settings came from (its project's saved ones, the
 * global ones or the defaults), whether the session changed them since, and
 * whether its project keeps its own.
 */
export type Provenance = { source: 'project' | 'global' | 'defaults'; isChanged: boolean; hasProject: boolean }

declare module 'claude-code' {
  interface PluginState {
    'ui-colorify': {
      settings: Preferences
      origin: Provenance
    }
  }
}
