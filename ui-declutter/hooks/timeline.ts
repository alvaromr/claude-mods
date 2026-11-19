import type { ToolGroupCall } from 'claude-code'

import type { Timing } from '../types'

/** When a tool ran, on the clock, and how long it was its own. */
export type Time = { startedAt?: number; endedAt?: number; ms?: number }
/** A call a span's line holds, its place among them, its time, and why it was refused if it was. */
export type Row = Time & { call: ToolGroupCall; at: number; deny: string | undefined }

// How long a call took from its start to its end, the approval it waited for included.
const waitedOf = (timing: Timing | undefined) =>
  timing?.startedAt === undefined || timing.endedAt === undefined ? undefined : timing.endedAt - timing.startedAt

/** What the permission check's verdict on a call adds to its timing: nothing if allowed, that the person was asked, or why it was refused. */
export const verdictTiming = (verdict: { decision: string; reason?: string; rule?: string }): Timing | undefined =>
  verdict.decision === 'allow'
    ? undefined
    : verdict.decision === 'ask'
      ? { isAsked: true }
      : { deny: verdict.reason ?? verdict.rule ?? 'not allowed' }

/** What a call's end adds to its timing: when, and why it was refused if the tool itself refused it. */
export const endTiming = (endedAt: number, deny: string | undefined): Timing => ({
  endedAt,
  ...(deny === undefined ? {} : { deny }),
})

/**
 * For each row of a span, in order, when the timed rows before it ended, `now`
 * for one still running: where its dotted wait starts. None for the first.
 * `owns`: each row's own times.
 */
export const beforesOf = (owns: readonly (readonly (Time | undefined)[])[], now: number) => {
  let ended: number | undefined

  return owns.map(own => {
    const before = ended

    for (const time of own) {
      if (time?.startedAt !== undefined) {
        ended = Math.max(ended ?? -Infinity, time.endedAt ?? now)
      }
    }

    return before
  })
}

/** The calls with their timings, in order: each one's time, and its refusal. */
export const rowsOf = (calls: readonly ToolGroupCall[], timings: readonly (Timing | undefined)[]): Row[] =>
  calls.map((call, at) => {
    const timing = timings[at]
    const isRefused = call.isErrored && timing?.isAsked && !timing.hasRun
    const deny = timing?.deny ?? (isRefused ? 'not approved' : undefined)

    // A refused call never ran: what it waited was the approval, not the tool.
    return {
      call,
      at,
      ms: deny === undefined ? (timing?.ranMs ?? waitedOf(timing)) : 0,
      deny,
      startedAt: timing?.startedAt,
      endedAt: timing?.endedAt,
    }
  })

/** An edit's time, as a call's: its own, without the approval it waited for. */
export const timeOf = (timing: Timing | undefined): Time => ({
  startedAt: timing?.startedAt,
  endedAt: timing?.endedAt,
  ms: timing?.ranMs ?? waitedOf(timing),
})

/** Whether something started and has not ended: the span's clock then runs to now. */
export const isLive = (times: readonly Time[]) =>
  times.some(time => time.startedAt !== undefined && time.endedAt === undefined)

/**
 * The span's time on the clock, from its first call or edit to the last one's
 * end, the model writing them between included; one still running ends `now`.
 * Untimed (a resumed session's old calls), it has no time to tell.
 */
export const clockOf = (rows: readonly Row[], edits: readonly Time[], now: number) => {
  const times = [...rows, ...edits]
  const starts = times.flatMap(time => (time.startedAt === undefined ? [] : [time.startedAt]))
  const origin = Math.min(...starts)
  const ends = times.flatMap(time => (time.startedAt === undefined ? [] : [time.endedAt ?? now]))

  return {
    isTimed: rows.some(row => row.ms !== undefined || row.call.isRunning) || edits.some(time => time.ms !== undefined),
    origin,
    total: starts.length === 0 ? rows.reduce((sum, row) => sum + (row.ms ?? 0), 0) : Math.max(...ends) - origin,
  }
}

/**
 * A row's bar in `cells` cells, as runs of marks: each of its tools' times on
 * the span's clock, `ran`, the wait since the rows `before` it ended, `wait`,
 * the rest `idle`.
 */
export const barRuns = (
  times: readonly (Time | undefined)[],
  before: number | undefined,
  clock: { cells: number; origin: number; total: number; now: number },
) => {
  const { cells, origin, total, now } = clock
  const track = Math.max(total, 1)
  const cellOf = (time: number) => Math.round(((time - origin) / track) * cells)
  const marks: ('idle' | 'wait' | 'ran')[] = Array.from({ length: cells }, () => 'idle')
  let first: number | undefined

  for (const time of times) {
    if (time?.startedAt !== undefined) {
      const end = time.endedAt ?? now
      const ran = end - (time.ms ?? end - time.startedAt)
      const size = Math.max(1, cellOf(end) - cellOf(ran))
      const lead = Math.min(cellOf(ran), cells - size)
      marks.fill('ran', lead, lead + size)
      first ??= lead
    }
  }

  if (first !== undefined && before !== undefined) {
    marks.fill('wait', Math.min(cellOf(before), first), first)
  }

  const runs: { mark: (typeof marks)[number]; length: number }[] = []

  for (const mark of marks) {
    const last = runs.at(-1)

    if (last?.mark === mark) {
      last.length += 1
    } else {
      runs.push({ mark, length: 1 })
    }
  }

  return runs
}
