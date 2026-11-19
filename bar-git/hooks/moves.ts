// Where a shell `cd` took the session, kept while the session itself still
// reports the folder it did when the move was told: Claude Code tells the
// move, and whether `$.session.cwd()` follows it is not promised.
export type Move = { to: string; reported: string | null } | undefined
export type MoveEvent =
  { kind: 'started' } | { kind: 'moved'; to: string; reported: string | null } | { kind: 'read'; now: string | null }

// The move's only owner: a new session forgets it, a move replaces it, and a
// read of the session's folder keeps it while that folder is still the one
// reported at the move (or cannot be read), and forgets it once it follows.
export const nextMove = (move: Move, event: MoveEvent): Move => {
  switch (event.kind) {
    case 'started':
      return undefined
    case 'moved':
      return { to: event.to, reported: event.reported }
    case 'read':
      return event.now === null || event.now === move?.reported ? move : undefined
  }
}
