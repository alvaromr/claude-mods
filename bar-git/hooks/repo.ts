import type { Repo } from '../types'

// How long git may take to read the repository, a part at a time: a huge tree
// that takes longer shows less, not nothing.
export const READ_MS = 10_000

/** What a command that ran printed, and how it ended. */
type Output = { stdout: string; exitCode: number }

/** How a read of the repository of `cwd` runs, in the session's own folder where none is named. */
export const readOf = (cwd?: string) => ({ timeoutMs: READ_MS, ...(cwd === undefined ? {} : { cwd }) })

/** Whether `git status` ran and found a repository. */
export const isRead = (status: Output | undefined): status is Output => status !== undefined && status.exitCode === 0

/**
 * The repository from what the three reads printed: `git status`, the changed
 * lines one `added<TAB>removed` row per file, and the commits no remote has. A
 * part that could not be read leaves its count out: the lines as none (null),
 * the commits as 0.
 */
export const repoOf = (status: string, lines: Output | undefined, unpushed: { stdout: string } | undefined): Repo => {
  const field = (pattern: RegExp) => pattern.exec(status)?.[1]
  const head = field(/^# branch\.head (.+)$/m) ?? ''
  const rows = (lines?.stdout ?? '').split('\n').map(row => row.split('\t'))
  const sum = (column: number) => rows.reduce((total, row) => total + (Number(row[column]) || 0), 0)
  const isCounted = lines !== undefined && lines.exitCode === 0

  return {
    branch: head === '(detached)' ? (field(/^# branch\.oid (\w{7})/m) ?? head) : head,
    dirty: status.split('\n').filter(line => line !== '' && !line.startsWith('#')).length,
    added: isCounted ? sum(0) : null,
    removed: isCounted ? sum(1) : null,
    ahead: Number(unpushed?.stdout.trim()) || 0,
  }
}
