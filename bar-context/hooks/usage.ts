import type { Fill, Model, Speed } from '../types'

/**
 * claude-opus-5-5 → Opus 5.5, as claude-opus-5-5[1m] does; a name already
 * readable keeps it, without the window it names (Opus 5.5 1M context, opus[1m]).
 */
export const nameOf = (id: string) => {
  const [, family = '', major, minor] = /^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:[-[]|$)/.exec(id) ?? []

  return major === undefined
    ? id.replace(/\[1m\]$| \d+[KkMm] [Cc]ontext$/, '')
    : `${family.charAt(0).toUpperCase()}${family.slice(1)} ${major}${minor === undefined ? '' : `.${minor}`}`
}

/** The model once the session tells its id, none when it tells none. */
export const modelNamed = (current: Model, id: string | null): Model => ({
  ...current,
  name: id === null ? null : nameOf(id),
})

/** The model and the effort a request names: no effort asked for leaves none. */
export const modelAsked = (current: Model, id: string, effort: string | number | undefined): Model => ({
  ...current,
  name: nameOf(id),
  effort: effort === undefined ? null : String(effort),
})

/** The effort at the start: the one already known, else Claude Code's saved one when it is a text. */
export const effortStarted = (current: Model, saved: unknown): Model => ({
  ...current,
  effort: current.effort ?? (typeof saved === 'string' ? saved : null),
})

/** Whether a response's output over the time it took says a speed. */
export const isTimed = (outputTokens: number, ms: number) => outputTokens > 0 && ms > 0

/** The speed once a response of `outputTokens` tokens, `ms` milliseconds long, is counted in. */
export const speedAfter = (sum: Speed, outputTokens: number, ms: number): Speed => ({
  last: Math.floor((outputTokens * 1000) / ms),
  tokens: sum.tokens + outputTokens,
  ms: sum.ms + ms,
})

/**
 * The window after a measurement. One with no fill keeps the one told before,
 * when `isKept`, until a response reports another.
 */
export const fillAfter = (current: Fill | null, measured: Fill, isKept: boolean): Fill =>
  isKept && measured.percent === undefined && current?.percent !== undefined
    ? current
    : { percent: measured.percent, tokens: measured.tokens, window: measured.window }

/**
 * The window as a conversation starts: the fill the resumed conversation's last
 * response left (`tokens`), until a response of this session reports it; none
 * for one that starts, or starts over, which keeps only the size it had.
 */
export const fillAtStart = (current: Fill | null, tokens: number | undefined, window: number | undefined) =>
  tokens !== undefined && window !== undefined
    ? { tokens, window, percent: Math.min(100, Math.round((tokens * 100) / window)) }
    : current === null
      ? null
      : { window: current.window }
