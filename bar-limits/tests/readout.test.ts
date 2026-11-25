import { expect, test } from 'claude-code/testing'

import { DEFAULTS } from '../hooks/preferences'
import { cycled, runsOf, shownOf, until } from '../hooks/readout'
import type { Limit } from '../types'

// 22-10-2026 08:07 UTC: the session's window has run 1h07m of its 5h, the week 5d17h07m of its 7d.
const NOW = Date.parse('2026-10-22T08:07:00Z')
const LOW = '#8a8a8a'
const EMPTY = '#5f5f5f'

const session = (over: Partial<Limit> = {}): Limit => ({
  kind: 'five_hour',
  percentUsed: 2,
  resetsAt: '2026-10-22T12:00:00Z',
  ...over,
})
const plain = (runs: { text: string }[]) => runs.map(run => run.text).join('')

test('a window is its label, a bar with the time elapsed as a cursor, its share, its pace beside its arrow and the time to reset', () => {
  expect(runsOf(session(), DEFAULTS, NOW)).toEqual([
    { color: LOW, isBold: false, text: 'Session ' },
    { color: EMPTY, text: '▱▱' },
    { color: LOW, isBold: false, text: '◇' },
    { color: EMPTY, text: '▱▱▱▱▱▱▱' },
    // The pace, in the tier's color, is one run with the share.
    { color: LOW, isBold: false, text: ' 2% ↓9%' },
    { color: LOW, text: ' (3h53m)' },
  ])
})

test('the week and a model take their own label and window', () => {
  const week = session({ kind: 'seven_day', percentUsed: 19.4, resetsAt: '2026-10-23T15:00:00Z' })

  expect(plain(runsOf(week, DEFAULTS, NOW))).toBe('Week ▰▱▱▱▱▱▱▱◇▱ 19% ↓23% (1d6h)')
  expect(plain(runsOf({ ...week, kind: 'model', name: 'Fable' }, DEFAULTS, NOW))).toBe(
    'Fable ▰▱▱▱▱▱▱▱◇▱ 19% ↓23% (1d6h)',
  )
  expect(runsOf({ ...week, kind: 'model' }, DEFAULTS, NOW)[0]?.text).toBe(' ▰')
})

test('the labels are the settings', () => {
  const s = { ...DEFAULTS, sessionLabel: 'S', weekLabel: 'W' }

  expect(runsOf(session(), s, NOW)[0]?.text).toBe('S ')
  expect(runsOf(session({ kind: 'seven_day' }), s, NOW)[0]?.text).toBe('W ')
})

test('the tier turns amber from the mid share and bold red from the high one', () => {
  const first = (percentUsed: number) => runsOf(session({ percentUsed }), DEFAULTS, NOW)[0]

  expect(first(49)).toMatchObject({ color: LOW, isBold: false })
  expect(first(50)).toMatchObject({ color: '#d78700', isBold: false })
  expect(first(50.9)).toMatchObject({ color: '#d78700', isBold: false })
  expect(first(70)).toMatchObject({ color: '#d78700', isBold: false })
  expect(first(71)).toMatchObject({ color: 'red', isBold: true })
  expect(first(100)).toMatchObject({ color: 'red', isBold: true })
})

test('the bar fills a cell for each tenth used, no more than ten', () => {
  const s = { ...DEFAULTS, showCursor: false }
  const bar = (percentUsed: number) => plain(runsOf(session({ percentUsed }), s, NOW)).slice(8, 18)

  expect(bar(2)).toBe('▱▱▱▱▱▱▱▱▱▱')
  expect(bar(19)).toBe('▰▱▱▱▱▱▱▱▱▱')
  expect(bar(35)).toBe('▰▰▰▱▱▱▱▱▱▱')
  expect(bar(100)).toBe('▰▰▰▰▰▰▰▰▰▰')
  expect(bar(130)).toBe('▰▰▰▰▰▰▰▰▰▰')
})

test('a window spent faster than its pace says when it runs out, and has its cursor a solid diamond', () => {
  const runs = runsOf(session({ percentUsed: 30 }), DEFAULTS, NOW)

  expect(plain(runs)).toBe('Session ▰▰◆▱▱▱▱▱▱▱ 30% ↑136% agota en 2h36m (3h53m)')
  expect(runs).toContainEqual({ color: 'red', isBold: true, text: ' ↑136%' })
  // Without its percent, the arrow alone.
  expect(runsOf(session({ percentUsed: 30 }), { ...DEFAULTS, showRatio: false }, NOW)).toContainEqual({
    color: 'red',
    isBold: true,
    text: ' ↑',
  })
})

test('the pace takes the color of its own tier: low below 95%, mid from it, high and bold from 120%', () => {
  // 22% of the session's time has run.
  const arrow = (percentUsed: number, s: object = {}) =>
    runsOf(session({ percentUsed }), { ...DEFAULTS, ...s }, NOW).find(run => /[↑↓]/.test(run.text))

  // Of one look with a low share, it is drawn with it.
  expect(arrow(20)).toEqual({ color: LOW, isBold: false, text: ' 20% ↓90%' })
  expect(arrow(21)).toEqual({ color: '#d78700', isBold: false, text: ' ↓95%' })
  expect(arrow(26)).toEqual({ color: '#d78700', isBold: false, text: ' ↑118%' })
  expect(arrow(27)).toEqual({ color: 'red', isBold: true, text: ' ↑122%' })
  // At 08:07, a quarter of a window that resets at 11:52 has run: 30% used is a pace of 120%, just high.
  const quarter = (percentUsed: number) =>
    runsOf(session({ percentUsed, resetsAt: '2026-10-22T11:52:00Z' }), DEFAULTS, NOW).find(run => /[↑↓]/.test(run.text))

  expect(quarter(29)).toEqual({ color: '#d78700', isBold: false, text: ' ↑116%' })
  expect(quarter(30)).toEqual({ color: 'red', isBold: true, text: ' ↑120%' })
  // The thresholds are the settings.
  expect(arrow(21, { paceMidFrom: 96 })).toMatchObject({ color: LOW })
  expect(arrow(26, { paceHighFrom: 118 })).toMatchObject({ color: 'red', isBold: true })
})

test('the pace is judged fast at its threshold and past it, and its arrow points up from the fair pace', () => {
  const pace = (s: object, percentUsed: number) => plain(runsOf(session({ percentUsed }), { ...DEFAULTS, ...s }, NOW))

  // 30% used over 22% of the time is a pace of 136%.
  expect(pace({ paceFast: 136 }, 30)).toContain('↑136% agota')
  expect(pace({ paceFast: 137 }, 30)).not.toContain('agota')
  // 21% and 22% used over 22% of the time: just under the fair pace, and at it.
  expect(pace({}, 21)).toContain('↓95% (')
  expect(pace({}, 22)).toContain('↑100% (')
  // Fast with no percent shown: the arrow points up all the same.
  expect(pace({ paceFast: 100, showRatio: false }, 22)).toContain('↑ agota')
})

test('a window with nothing used, or with too little of its time elapsed, has no pace to judge, but its pace drawn', () => {
  // 07:03: 3 minutes of the 5 hours, 1% of the time; 07:06: 2%.
  const early = (now: string) => plain(runsOf(session({ percentUsed: 40 }), DEFAULTS, Date.parse(now)))
  const none = (s: object) => plain(runsOf(session({ percentUsed: 0 }), { ...DEFAULTS, ...s }, NOW))

  expect(none({})).toBe('Session ▱▱◇▱▱▱▱▱▱▱ 0% ↓0% (3h53m)')
  expect(none({ showRatio: false })).not.toMatch(/[↑↓]/)
  expect(early('2026-10-22T07:03:00Z')).not.toContain('agota')
  expect(early('2026-10-22T07:03:00Z')).toContain('↑4000% (')
  expect(early('2026-10-22T07:06:00Z')).toContain('agota')
})

test('the pace in percent is the share used against the share of the window elapsed, between the arrows too', () => {
  // 22% of the session's time has run.
  const ratio = (percentUsed: number) => /[↑↓](\d+)%/.exec(plain(runsOf(session({ percentUsed }), DEFAULTS, NOW)))?.[1]

  expect(ratio(11)).toBe('50')
  // Not fast: the arrow and the pace alone.
  expect(plain(runsOf(session({ percentUsed: 20 }), DEFAULTS, NOW))).toBe('Session ▰▰◇▱▱▱▱▱▱▱ 20% ↓90% (3h53m)')
  expect(ratio(44)).toBe('200')
})

test('a window that has not begun has its cursor at the first cell', () => {
  const next = session({ resetsAt: '2026-10-22T15:00:00Z' })

  expect(plain(runsOf(next, DEFAULTS, NOW))).toBe('Session ◇▱▱▱▱▱▱▱▱▱ 2% (6h53m)')
})

test('a window past its reset counts as unused, with no time to judge', () => {
  const reset = (resetsAt: string) => plain(runsOf(session({ percentUsed: 60, resetsAt }), DEFAULTS, NOW))

  expect(reset('2026-10-22T07:00:00Z')).toBe('Session ▱▱▱▱▱▱▱▱▱▱ 0%')
  expect(reset(new Date(NOW).toISOString())).toBe('Session ▱▱▱▱▱▱▱▱▱▱ 0%')
})

test('a window with no reset, or one that is no date, shows its share alone', () => {
  const none = session({ percentUsed: 60, resetsAt: undefined })

  expect(plain(runsOf(none, DEFAULTS, NOW))).toBe('Session ▰▰▰▰▰▰▱▱▱▱ 60%')
  expect(plain(runsOf({ ...none, resetsAt: 'soon' }, DEFAULTS, NOW))).toBe('Session ▰▰▰▰▰▰▱▱▱▱ 60%')
})

test('a reset with fractions of a second is read as the second', () => {
  const runs = runsOf(session({ resetsAt: '2026-10-22T12:00:00.142083+00:00' }), DEFAULTS, NOW)

  expect(plain(runs)).toBe(plain(runsOf(session(), DEFAULTS, NOW)))
})

test('each part can be hidden by its setting', () => {
  const shown = (s: object) => plain(runsOf(session(), { ...DEFAULTS, ...s }, NOW))

  expect(shown({ showBar: false })).toBe('Session 2% ↓9% (3h53m)')
  expect(shown({ showCursor: false })).toBe('Session ▱▱▱▱▱▱▱▱▱▱ 2% ↓9% (3h53m)')
  expect(shown({ showPercent: false })).toBe('Session ▱▱◇▱▱▱▱▱▱▱ ↓9% (3h53m)')
  expect(shown({ showReset: false })).toBe('Session ▱▱◇▱▱▱▱▱▱▱ 2% ↓9%')
  expect(shown({ showRatio: false })).toBe('Session ▱▱◇▱▱▱▱▱▱▱ 2% (3h53m)')

  const fast = (s: object) => plain(runsOf(session({ percentUsed: 30 }), { ...DEFAULTS, ...s }, NOW))

  expect(fast({ showPace: false })).toBe('Session ▰▰◆▱▱▱▱▱▱▱ 30% ↑136% (3h53m)')
  expect(fast({ showRatio: false })).toBe('Session ▰▰◆▱▱▱▱▱▱▱ 30% ↑ agota en 2h36m (3h53m)')
  expect(fast({ showPace: false, showRatio: false })).toBe('Session ▰▰◆▱▱▱▱▱▱▱ 30% (3h53m)')
})

test('neighbours of one look are one run, and a bold one is not of the same look as one that is not', () => {
  const s = { ...DEFAULTS, highColor: LOW, showBar: false, showPace: false, showRatio: false }

  expect(runsOf(session({ percentUsed: 80 }), s, NOW)).toEqual([
    { color: LOW, isBold: true, text: 'Session 80%' },
    { color: LOW, text: ' (3h53m)' },
  ])
})

test('the time until a moment is told in days and hours, hours and minutes, or minutes', () => {
  expect(until(111_180)).toBe('1d6h')
  expect(until(86_400)).toBe('1d0h')
  expect(until(13_980)).toBe('3h53m')
  expect(until(3600)).toBe('1h0m')
  expect(until(3180)).toBe('53m')
  expect(until(59)).toBe('0m')
})

test('a time that has come, or is past, is now', () => {
  expect(until(0)).toBe('now')
  expect(until(-30)).toBe('now')
  expect(until(1)).toBe('0m')
})

const WEEK: Limit = { kind: 'seven_day', percentUsed: 1 }
const FIVE: Limit = { kind: 'five_hour', percentUsed: 1 }
const FABLE: Limit = { kind: 'model', name: 'Fable', percentUsed: 1 }

test('the windows shown are the session, the week and the models, as the settings say', () => {
  expect(shownOf([FIVE, WEEK], [FABLE], DEFAULTS)).toEqual([FIVE, WEEK, FABLE])
  expect(shownOf([FIVE, WEEK], [FABLE], { ...DEFAULTS, showSession: false })).toEqual([WEEK, FABLE])
  expect(shownOf([FIVE, WEEK], [FABLE], { ...DEFAULTS, showWeek: false })).toEqual([FIVE, FABLE])
  expect(shownOf([FIVE, WEEK], [FABLE], { ...DEFAULTS, showModels: false })).toEqual([FIVE, WEEK])
  expect(shownOf([], [], DEFAULTS)).toEqual([])
})

test('the line cycles round the windows shown, from the first, without end', () => {
  const s = { ...DEFAULTS, cycle: true }
  const shown = [FIVE, WEEK, FABLE]

  expect([0, 1, 2, 3, 4, 7].map(at => cycled(shown, s, at))).toEqual([FIVE, WEEK, FABLE, FIVE, WEEK, WEEK])
})

test('the line shows none by itself when it is not cycling, or has no window', () => {
  expect(cycled([FIVE, WEEK], DEFAULTS, 1)).toBeUndefined()
  expect(cycled([], { ...DEFAULTS, cycle: true }, 1)).toBeUndefined()
})
