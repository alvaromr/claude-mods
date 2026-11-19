import type { Place, Preferences } from '../types'

/** Where a shell `cd` took the session, and the folder the session itself reported when the move was told. */
export type Moved = { to: string; reported: string | null }

// As linkify writes a file link: each part percent-encoded, parentheses too.
export const fileUrl = (path: string) =>
  'file://' +
  path
    .split('/')
    .map(part => encodeURIComponent(part).replace(/\(/g, '%28').replace(/\)/g, '%29'))
    .join('/')

/**
 * The folder a move took the session to while the session has not moved since:
 * it still reports the folder it did at the move, or none. Undefined once it has
 * moved, or where there was no move.
 */
export const stillMoved = (moved: Moved | undefined, now: string | null) =>
  moved !== undefined && (now === null || now === moved.reported) ? moved.to : undefined

/** The folder the row shows, none where the session tells none, with the home folder the environment tells. */
export const placeOf = (cwd: string | null, home: string | null | undefined): Place | null =>
  cwd === null ? null : { cwd, home: home ?? null }

/**
 * The folder's path as the row writes it, the home folder as `~` where the
 * settings say, split into the folders above and the folder's own name (the
 * root is its own name).
 */
export const pathOf = (found: Place, s: Preferences) => {
  const isHome =
    s.showTilde && found.home !== null && (found.cwd === found.home || found.cwd.startsWith(`${found.home}/`))
  const path = isHome && found.home !== null ? `~${found.cwd.slice(found.home.length)}` : found.cwd
  const name = path.slice(path.lastIndexOf('/') + 1) || path

  return { name, parents: path.slice(0, path.length - name.length) }
}
