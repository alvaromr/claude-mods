import type { Cold, Fill, Miss, Preferences, Speed, Warm } from '../types'
import { secondsLeft } from './prompt-cache'
import { TEXT } from './text'

/** A stretch of the row of one color. */
export type Run = { text: string; color: string; isBold?: boolean }

type Cache = { warm: Warm | null; miss: Miss | null; now: number }

const CELLS = 10

/** 436291 → 436k, 1250000 → 1.2M. */
export const short = (tokens: number) =>
  tokens >= 1_000_000
    ? `${(Math.floor(tokens / 100_000) / 10).toFixed(1)}M`
    : tokens >= 1000
      ? `${Math.floor(tokens / 1000)}k`
      : `${tokens}`

// 1d6h, 3h53m, 53m: how long `seconds` are.
const until = (seconds: number) => {
  const days = Math.floor(seconds / 86_400)
  const hours = Math.floor((seconds % 86_400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)

  return days > 0 ? `${days}d${hours}h` : hours > 0 ? `${hours}h${minutes}m` : `${minutes}m`
}

/**
 * The row's parts after the model and its effort, which are buttons of their
 * own: the context window as a bar and its share in the tier's color, the
 * prompt cache's time left and its last miss, the output speed and the
 * session's estimated cost in dollars, each part as the settings say, as runs of one color; parts with nothing to show are
 * left out.
 */
export const runsOf = (
  s: Preferences,
  window: Fill | null,
  cache: Cache,
  rate: Speed,
  cost: number | null = null,
): Run[][] => {
  const parts: Run[][] = []

  if (s.showContext && window?.percent !== undefined) {
    const pct = window.percent
    const tier = {
      color: pct >= s.highFrom ? s.highColor : pct >= s.midFrom ? s.midColor : s.lowColor,
      isBold: pct >= s.highFrom,
    }
    const filled = Math.min(Math.floor(pct / 10), CELLS)
    const runs: Run[] = [{ ...tier, text: s.contextLabel }]

    if (s.showBar) {
      runs.push({ ...tier, text: ` ${'▰'.repeat(filled)}` }, { color: s.emptyColor, text: '▱'.repeat(CELLS - filled) })
    }

    if (s.showPercent) {
      runs.push({ ...tier, text: ` ${pct}%` })
    }

    if (s.showTokens && window.tokens !== undefined) {
      runs.push({ color: s.mutedColor, text: ` (${short(window.tokens)}/${short(window.window)})` })
    }

    parts.push(runs)
  }

  // Nothing until a request of the main conversation has met the cache.
  const { warm: left, miss: missed, now } = cache
  const isMissShown = s.showMiss && missed !== null && now - missed.at < s.missShownMinutes * 60_000

  if (left !== null && (s.showCache || isMissShown)) {
    const remaining = secondsLeft(left, now)
    const runs: Run[] = []

    if (s.showCache) {
      runs.push(
        remaining > 0
          ? {
              color: remaining <= s.cacheSoonMinutes * 60 ? s.cacheWarnColor : s.cacheColor,
              text: `${s.cacheLabel} ${until(remaining)}`,
            }
          : { color: s.cacheWarnColor, text: TEXT.cacheCold(s.cacheLabel) },
      )

      if (s.showCacheTokens && left.tokens !== null) {
        runs.push({ color: s.mutedColor, text: ` (${short(left.tokens)})` })
      }
    }

    if (isMissShown) {
      runs.push(
        { color: s.cacheWarnColor, text: `${runs.length > 0 ? ' ' : ''}⚠ miss` },
        ...(missed.cause === null ? [] : [{ color: s.mutedColor, text: ` ${missed.cause}` }]),
      )
    }

    parts.push(runs)
  }

  if (s.showSpeed && rate.last !== null) {
    parts.push([
      { color: s.speedColor, text: `⚡ ${rate.last} tok/s` },
      ...(s.showAverage && rate.ms > 0
        ? [{ color: s.mutedColor, text: ` (ø ${Math.floor((rate.tokens * 1000) / rate.ms)})` }]
        : []),
    ])
  }

  if (s.showCost && cost !== null) {
    parts.push([{ color: s.mutedColor, text: `$${cost.toFixed(2)}` }])
  }

  // Neighbours of one look drawn as one Text, so the tree stays small.
  return parts.map(runs =>
    runs.reduce<Run[]>((joined, run) => {
      const last = joined.at(-1)

      return last !== undefined && last.color === run.color && last.isBold === run.isBold
        ? [...joined.slice(0, -1), { ...last, text: last.text + run.text }]
        : [...joined, run]
    }, []),
  )
}

/**
 * The cache that lapsed as the warning above the prompt tells of it, none while
 * the prompt is busy (a survey asked, a turn running) or the setting hides it.
 */
export const warningShown = (
  { hasSurvey, isWorking }: { hasSurvey: boolean; isWorking: boolean },
  found: Cold | null,
  s: Preferences,
) => (hasSurvey || isWorking || !s.showCacheWarning ? null : found)

/** The share of the window the compact button names, none while the button is not due. */
export const compactShare = (s: Preferences, window: Fill | null) =>
  s.showCompact && window?.percent !== undefined && window.percent >= s.compactFrom ? window.percent : null
