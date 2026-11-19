export type Repo = {
  /** The branch checked out, or the commit's short id while detached. */
  branch: string
  /** Files with changes not yet committed, untracked ones included, each one by one. */
  dirty: number
  /**
   * Lines the working tree adds to HEAD (to an empty tree before the first
   * commit), an untracked text file's lines among them; null where they could
   * not be counted.
   */
  added: number | null
  /** Lines the working tree removes from HEAD; null where they could not be counted. */
  removed: number | null
  /** Commits of the branch no remote has yet; 0 in a repository without a remote. */
  ahead: number
}

/**
 * What the row shows and how, every field set from the settings pane and kept
 * across sessions.
 */
export type Preferences = {
  showIcon: boolean
  showBranch: boolean
  /** `· 2 ficheros`, the files with changes. */
  showFiles: boolean
  /** `+14 -3`, the lines added and removed. */
  showLines: boolean
  /** `· 2 sin subir`, the commits no remote has. */
  showAhead: boolean
  showCommit: boolean
  showIntegrate: boolean
  icon: string
  commitLabel: string
  integrateLabel: string
  /** What the commit button sends as the person's prompt. */
  commitPrompt: string
  /** What the integrate button sends as the person's prompt. */
  integratePrompt: string
  iconColor: string
  branchColor: string
  addedColor: string
  removedColor: string
  mutedColor: string
}

/**
 * Where the session's settings came from (its project's saved ones, the
 * global ones or the defaults), whether the session changed them since, and
 * whether its project keeps its own.
 */
export type Provenance = { source: 'project' | 'global' | 'defaults'; isChanged: boolean; hasProject: boolean }

declare module 'claude-code' {
  interface PluginState {
    'bar-git': { repo: Repo | null; settings: Preferences; origin: Provenance }
  }
}
