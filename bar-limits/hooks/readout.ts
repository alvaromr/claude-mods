import type { Limit, Preferences } from '../types'
import { TEXT } from './text'

const CELLS = 10
// The share of the window that must have elapsed before its pace is judged.
const PACE_MIN_ELAPSED = 2
const WINDOW_SECONDS: Record<Limit['kind'], number> = { five_hour: 18_000, seven_day: 604_800, model: 604_800 }

/** A stretch of the line of one color. */
export type Run = { text: string; color: string; isBold?: boolean }

/** 1d6h, 3h53m, 53m: how long until `seconds` from now. */
export const until = (seconds: number) => {
  if (seconds <= 0) {
    return 'now'
  }

  const days = Math.floor(seconds / 86_400)
  const hours = Math.floor((seconds % 86_400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)

  return days > 0 ? `${days}d${hours}h` : hours > 0 ? `${hours}h${minutes}m` : `${minutes}m`
}

/**
 * A window as runs of one color: its label, the bar with the elapsed time as a
 * cursor, the share used, its pace and the time to reset, each part as the
 * settings say. Bar and share take the tier's color; past its reset, before a
 * response reports the new one, the window counts as unused.
 */
export const runsOf = (limit: Limit, s: Preferences, now: number): Run[] => {
  const window = WINDOW_SECONDS[limit.kind]
  const parsed = limit.resetsAt === undefined ? NaN : Date.parse(limit.resetsAt.replace(/\.\d+/, ''))
  const resetsAt = Number.isNaN(parsed) || parsed <= now ? undefined : Math.floor(parsed / 1000)
  const pct = Number.isNaN(parsed) || parsed > now ? Math.floor(limit.percentUsed) : 0
  const seconds = Math.floor(now / 1000)
  const color = pct >= s.highFrom ? s.highColor : pct >= s.midFrom ? s.midColor : s.lowColor
  const tier = { color, isBold: pct >= s.highFrom }
  const label =
    limit.kind === 'five_hour' ? s.sessionLabel : limit.kind === 'seven_day' ? s.weekLabel : (limit.name ?? '')
  const elapsed = resetsAt === undefined ? undefined : Math.min(Math.max(seconds - (resetsAt - window), 0), window)
  const timePct = elapsed === undefined ? undefined : Math.floor((elapsed * 100) / window)
  const ratio =
    timePct !== undefined && timePct >= PACE_MIN_ELAPSED && pct > 0 ? Math.floor((pct * 100) / timePct) : undefined
  const isFast = ratio !== undefined && ratio >= s.paceFast
  const runs: Run[] = [{ ...tier, text: label }]

  if (s.showBar) {
    const filled = Math.min(Math.floor(pct / 10), CELLS)
    const cursor = s.showCursor && timePct !== undefined ? Math.min(Math.floor(timePct / 10), CELLS - 1) : -1
    runs.push({ ...tier, text: ' ' })

    for (let i = 0; i < CELLS; i++) {
      runs.push(
        i === cursor
          ? { ...tier, text: isFast ? '◆' : '◇' }
          : i < filled
            ? { ...tier, text: '▰' }
            : { color: s.emptyColor, text: '▱' },
      )
    }
  }

  if (s.showPercent) {
    runs.push({ ...tier, text: ` ${pct}%` })
  }

  if (s.showPace && elapsed !== undefined && ratio !== undefined) {
    if (isFast) {
      runs.push(
        { color: s.paceColor, text: ' ↑' },
        { color: s.mutedColor, text: TEXT.runsOut(until((elapsed * 100) / pct - elapsed)) },
      )
    } else if (ratio <= s.paceSlack) {
      runs.push({ color: s.paceColor, text: ' ↓' }, { color: s.mutedColor, text: TEXT.slack(100 - ratio) })
    }
  }

  if (s.showReset && resetsAt !== undefined) {
    runs.push({ color: s.mutedColor, text: ` (${until(resetsAt - seconds)})` })
  }

  // Neighbours of one look drawn as one Text, so the tree stays small.
  return runs.reduce<Run[]>((joined, run) => {
    const last = joined.at(-1)

    if (last !== undefined && last.color === run.color && last.isBold === run.isBold) {
      return [...joined.slice(0, -1), { ...last, text: last.text + run.text }]
    }

    return [...joined, run]
  }, [])
}

/** The windows the settings show, the session's and the week's first. */
export const shownOf = (engine: Limit[], perModel: Limit[], s: Preferences) => [
  ...engine.filter(limit => (limit.kind === 'five_hour' ? s.showSession : s.showWeek)),
  ...(s.showModels ? perModel : []),
]

/** The window the line shows while it cycles: the `at`-th, counted up without end, round the windows shown. */
export const cycled = (shown: Limit[], s: Preferences, at: number) =>
  s.cycle && shown.length > 0 ? shown[at % shown.length] : undefined
