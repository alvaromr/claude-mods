/** The session's folder, and the home folder it may lie under. */
export type Place = { cwd: string; home: string | null }

/**
 * What the row shows and how, every field set from the settings pane and kept
 * across sessions.
 */
export type Preferences = {
  /** The folders above the project's, dim. */
  showParents: boolean
  /** The home folder written `~`. */
  showTilde: boolean
  parentColor: string
  nameColor: string
}

/**
 * Where the session's settings came from (its project's saved ones, the
 * global ones or the defaults), whether the session changed them since, and
 * whether its project keeps its own.
 */
export type Provenance = { source: 'project' | 'global' | 'defaults'; isChanged: boolean; hasProject: boolean }

declare module 'claude-code' {
  interface PluginState {
    'bar-path': { place: Place | null; settings: Preferences; origin: Provenance }
  }
}
