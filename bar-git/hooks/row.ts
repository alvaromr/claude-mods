import type { Preferences, Repo } from '../types'

/**
 * What the row draws, from the repository and the settings: none where the row
 * is not drawn (no repository, the desktop app, which tells the branch and its
 * changes and commits them itself, or a surface that is no terminal with no
 * button to show).
 */
export const rowOf = (found: Repo | null, s: Preferences, surface: string) => {
  const isTerminal = surface === 'terminal'
  const isDirty = (found?.dirty ?? 0) > 0
  const isPending = isDirty || (found?.ahead ?? 0) > 0
  const hasCommit = isDirty && s.showCommit
  const hasIntegrate = isPending && s.showIntegrate

  if (found === null || surface === 'desktop' || (!isTerminal && !hasCommit && !hasIntegrate)) {
    return null
  }

  // The files and their lines go together: `2 ficheros +14 -3`.
  // The lines are left out where they could not be counted, not shown as none.
  const hasLines = s.showLines && found.added !== null

  return {
    isTerminal,
    hasCommit,
    hasIntegrate,
    hasLines,
    hasChanges: isTerminal && isDirty && (s.showFiles || hasLines),
    hasAhead: isTerminal && found.ahead > 0 && s.showAhead,
    hasHead: isTerminal && (s.showIcon || s.showBranch),
  }
}

/**
 * The slash command a button's text is, with its arguments (`/commit -m x`:
 * `commit`, `-m x`); none for a text that is a prompt.
 */
export const asCommand = (text: string) => {
  const [, command, args = ''] = /^\/(\S+)\s*([\s\S]*)$/.exec(text) ?? []

  return command === undefined ? undefined : { command, args }
}
