/**
 * How the diffs, the commands or the skills are drawn: not at all, in their
 * span's line (one line a press unfolds), or as the engine draws them.
 */
export type Level = 'hidden' | 'summary' | 'full'

export type Timing = {
  startedAt?: number
  endedAt?: number
  /** The tool ran; `ranMs` is its own time, without the approval wait. */
  hasRun?: boolean
  ranMs?: number
  /** The permission check put the call to the person. */
  isAsked?: boolean
  /** Why the call was refused, when something refused it. */
  deny?: string
}

/**
 * What presses opened: `span:<id>` a span turned from how spans start (unfolded
 * where they start folded, folded where they start unfolded), by its first call's id;
 * `row:<id>` one call's input and result in it, `full:<id>` all of that
 * result; `file:<id>:<path>` the diff an edit, or a command, by its id, made to that file.
 */
export type Opened = readonly string[]

/** Bumped when the conversation gains a tool call or its result: the tool rows read it to redraw. */
export type Revision = number

/** The settings the pane sets, as they are saved for a project or for every project. */
export type Preferences = {
  isOn: boolean
  diffs: Level
  commands: Level
  skills: Level
  startsOpen: boolean
}

/**
 * Where the session's settings came from (its project's saved ones, the
 * global ones or the defaults), whether the session changed them since, and
 * whether its project keeps its own.
 */
export type Provenance = { source: 'project' | 'global' | 'defaults'; isChanged: boolean; hasProject: boolean }

declare module 'claude-code' {
  interface PluginState {
    'ui-declutter': {
      /** Off, every row is the engine's, as without the mod. */
      isOn: boolean
      diffs: Level
      commands: Level
      skills: Level
      /** A span in its line starts unfolded, its rows drawn, rather than folded. */
      startsOpen: boolean
      origin: Provenance
      timings: StateFamily<Timing>
      opened: Opened
      revision: Revision
    }
  }
}
