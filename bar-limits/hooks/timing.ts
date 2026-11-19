import type { Preferences } from '../types'

export const FETCH_EVERY_MS = 60_000

/**
 * The milliseconds to wait before the usage endpoint may be read again, from
 * when it was last read; none (0) once the wait is over, or when it never was.
 */
export const fetchWait = (now: number, fetchedAt: number) => Math.max(0, fetchedAt + FETCH_EVERY_MS - now)

/** The milliseconds between one window and the next while the line cycles; none while it does not. */
export const cycleMs = ({ cycle, cycleSeconds }: Preferences) =>
  cycle && cycleSeconds > 0 ? cycleSeconds * 1000 : undefined
