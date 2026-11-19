/** A ticket's key, `ABC-22133`. */
export type Ticket = string

/** What the mod does, every field set from its pane and kept across sessions. */
export type Preferences = {
  /** The paths an assistant message names, as links that open them. */
  paths: boolean
  /** The Jira tickets an assistant message or a prompt names, as links to them. */
  jira: boolean
  /** The Jira site, as in https://example.atlassian.net. */
  site: string
  /** The project keys whose tickets are taken, separated by commas. */
  keys: string
  /** The session titled after the ticket worked on. */
  title: boolean
  /** The images pasted into a prompt, drawn under its row in the terminal. */
  images: boolean
  /** The images pasted into the box, drawn above it till it is sent. */
  draft: boolean
  /** Under each image, a button that sends it again when the terminal drops it. */
  resend: boolean
  /** The largest an image is drawn, in columns and rows. */
  columns: number
  rows: number
  /** The commands an assistant message proposes for bash mode, boxed with a ▶ that runs them. */
  commands: boolean
}

/** A stretch of a prompt's text, `[start, end)`, drawn as a link to `href`. */
export type Span = { start: number; end: number; href: string }

/**
 * A proposed command's run and what it has printed: going, or ended with its
 * exit code, null when something stopped it (■, a signal).
 */
export type Run =
  | { status: 'running'; stdout: string; stderr: string }
  | { status: 'done'; exitCode: number | null; stdout: string; stderr: string }

/**
 * Where the session's settings came from (its project's saved ones, the
 * global ones or the defaults), whether the session changed them since, and
 * whether its project keeps its own.
 */
export type Provenance = { source: 'project' | 'global' | 'defaults'; isChanged: boolean; hasProject: boolean }

declare module 'claude-code' {
  interface PluginState {
    // ticket: the one the person last said they work on; null until they do.
    // given: the title this mod last gave the session; null while it gave none.
    // runs: each proposed command run, by its message's id and line.
    'ui-linkify': {
      settings: Preferences
      origin: Provenance
      ticket: Ticket | null
      given: Ticket | null
      runs: Record<string, Run>
    }
  }
}
