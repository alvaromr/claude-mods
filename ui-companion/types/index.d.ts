/** `off`: not commenting; `minimized`: commenting with its pane put away. */
export type View = 'off' | 'open' | 'minimized'

/** `auto` leaves the effort to the model's own default. */
export type Effort = 'auto' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'

/**
 * `vigilante`: writes only what the person needs and the conversation lacks;
 * `resumen`: keeps the whole conversation summed up in four lines;
 * `asesor`: ideas, risks and improvements after each turn;
 * `troll`: mocks whatever the assistant did, to no use;
 * `pendientes`: keeps the next steps, a line to each.
 */
export type Mode = 'vigilante' | 'resumen' | 'asesor' | 'troll' | 'pendientes'

/**
 * `mode`: the mode that wrote it, whose notes alone it is shown and read with;
 * `sent`: the points of it (each list item, or the whole text when it has no
 * list) the person has put in the assistant's conversation, one at a time.
 */
export type Note = { n: number; text: string; mode: Mode; sent?: string[] }

/**
 * A text a mode keeps up to date in place of adding notes; `covered`: how
 * many messages of the transcript it already takes in; `sent`: as a note's.
 */
export type Digest = { text: string; covered: number; sent?: string[] }
/**
 * What a mode wrote, as shown above the prompt: `title`, its note's number or
 * the text's name; `n`, its note's number, absent for a kept text.
 */
export type Alert = { mode: Mode; title: string; text: string; n?: number }

/** When what a mode writes shows above the prompt: never, while the pane is put away, or always. */
export type AlertWhen = 'never' | 'minimized' | 'always'

/** A mode's own switch, when what it writes shows above the prompt, and the model and effort it asks. */
export type Setup = { isOn: boolean; alert: AlertWhen; model: string; effort: Effort }

/** The settings the pane sets, as they are saved for a project or for every project. */
export type Preferences = {
  isOn: boolean
  startsOpen: boolean
  setups: Record<Mode, Setup>
  prompts: Partial<Record<Mode, string>>
}

/**
 * Where the session's settings came from (its project's saved ones, the
 * global ones or the defaults), whether the session changed them since, and
 * whether its project keeps its own.
 */
export type Provenance = { source: 'project' | 'global' | 'defaults'; isChanged: boolean; hasProject: boolean }

declare module 'claude-code' {
  interface PluginState {
    'ui-companion': {
      view: View
      /** The pane's own switch: off, the pane stays up and no turn is read. */
      isOn: boolean
      /**
       * The advisor starts minimized, commenting with the pane away, as a new
       * session starts, its conversation empty. Named for when it opened the
       * pane, as saved settings still carry it.
       */
      startsOpen: boolean
      /** The mode whose notes, or kept text, the pane shows. */
      mode: Mode
      /** Each mode's own switch (the modes on all comment after each turn), alert, model and effort. */
      setups: Record<Mode, Setup>
      notes: Note[]
      /** The text of each mode that keeps one, absent until it is first made. */
      digests: Partial<Record<Mode, Digest>>
      isThinking: boolean
      /** What last went wrong with each mode, as the pane says it; its next success clears it. */
      errors: Partial<Record<Mode, string>>
      /** The system prompt the person wrote for a mode, in place of its own. */
      prompts: Partial<Record<Mode, string>>
      origin: Provenance
      /** The pane shows each mode's prompt to edit, in place of the notes. */
      isEditingPrompts: boolean
      /** The last each mode wrote, above the prompt, as its setup says, until seen or dismissed. */
      alerts: Partial<Record<Mode, Alert>>
    }
  }
}
