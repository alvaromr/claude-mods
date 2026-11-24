import { expect, test } from 'claude-code/testing'

import { DEFAULTS } from '../hooks/preferences'
import { compactShare, runsOf, short, warningShown } from '../hooks/readout'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const MUTED = '#8a8a8a'
const NO_CACHE = { warm: null, miss: null, now: 0 }
const NO_SPEED = { last: null, tokens: 0, ms: 0 }

test('tokens are written in thousands and millions, rounded down', () => {
  expect([999, 1000, 436_291, 999_999, 1_000_000, 1_250_000].map(short)).toEqual([
    '999',
    '1k',
    '436k',
    '999k',
    '1.0M',
    '1.2M',
  ])
})

test('the window is a bar of ten cells in the tier color, with its share after it', () => {
  const runs = runsOf(DEFAULTS, { percent: 42, tokens: 84_000, window: 200_000 }, NO_CACHE, NO_SPEED)

  expect(runs).toEqual([
    [
      { color: MUTED, isBold: false, text: 'Context ▰▰▰▰' },
      { color: '#5f5f5f', text: '▱▱▱▱▱▱' },
      { color: MUTED, isBold: false, text: ' 42%' },
    ],
  ])
})

test('the tier turns amber from the mid share and bold red from the high one', () => {
  const at = (percent: number) => runsOf(DEFAULTS, { percent, window: 200_000 }, NO_CACHE, NO_SPEED)[0]?.[0]

  expect(at(49)).toEqual({ color: MUTED, isBold: false, text: 'Context ▰▰▰▰' })
  expect(at(50)).toEqual({ color: '#d78700', isBold: false, text: 'Context ▰▰▰▰▰' })
  expect(at(70)).toEqual({ color: '#d78700', isBold: false, text: 'Context ▰▰▰▰▰▰▰' })
  expect(at(71)).toEqual({ color: 'red', isBold: true, text: 'Context ▰▰▰▰▰▰▰' })
  expect(at(100)?.text).toBe('Context ▰▰▰▰▰▰▰▰▰▰')
  // A share over the window still fills ten cells and no more.
  expect(runsOf(DEFAULTS, { percent: 120, window: 200_000 }, NO_CACHE, NO_SPEED)[0]?.map(run => run.text)).toEqual([
    'Context ▰▰▰▰▰▰▰▰▰▰',
    '',
    ' 120%',
  ])
})

test('the window shows its tokens over its size, in the secondary color, when asked', () => {
  const runs = runsOf(
    { ...DEFAULTS, showBar: false, showPercent: false, showTokens: true },
    { percent: 18, tokens: 37_000, window: 200_000 },
    NO_CACHE,
    NO_SPEED,
  )

  expect(runs).toEqual([
    [
      { color: MUTED, isBold: false, text: 'Context' },
      { color: MUTED, text: ' (37k/200k)' },
    ],
  ])
})

test('a window whose tokens are not told shows none, though they are asked for', () => {
  const settings = { ...DEFAULTS, showBar: false, showPercent: false, showTokens: true }

  expect(runsOf(settings, { percent: 18, window: 200_000 }, NO_CACHE, NO_SPEED)).toEqual([
    [{ color: MUTED, isBold: false, text: 'Context' }],
  ])
})

test('a window with no fill yet, or hidden, leaves its part out', () => {
  expect(runsOf(DEFAULTS, { window: 200_000 }, NO_CACHE, NO_SPEED)).toEqual([])
  expect(runsOf(DEFAULTS, null, NO_CACHE, NO_SPEED)).toEqual([])
  expect(runsOf({ ...DEFAULTS, showContext: false }, { percent: 42, window: 200_000 }, NO_CACHE, NO_SPEED)).toEqual([])
})

test('the cache shows its time left with the tokens a next request would write again', () => {
  const cache = { warm: { at: 0, tokens: 261_000, ttl: '1h' as const }, miss: null, now: MINUTE }

  expect(runsOf(DEFAULTS, null, cache, NO_SPEED)).toEqual([[{ color: MUTED, text: 'Cache 59m (261k)' }]])
})

test('the cache time left reads in hours and minutes from an hour on', () => {
  const warm = { at: 0, tokens: null, ttl: '1h' as const }
  const left = (now: number) => runsOf(DEFAULTS, null, { warm, miss: null, now }, NO_SPEED)[0]?.[0]?.text

  expect(left(0)).toBe('Cache 1h0m')
  expect(left(7 * MINUTE)).toBe('Cache 53m')
})

test('a cache written ahead of the clock reads in days from a day on', () => {
  const left = (secondsAhead: number) =>
    runsOf(
      DEFAULTS,
      null,
      { warm: { at: secondsAhead * 1000 - HOUR, tokens: null, ttl: '1h' }, miss: null, now: 0 },
      NO_SPEED,
    )[0]?.[0]?.text

  expect(left(86_300)).toBe('Cache 23h58m')
  expect(left(86_400)).toBe('Cache 1d0h')
  expect(left(97_200)).toBe('Cache 1d3h')
})

test('the cache turns to the warning color for the last minutes and shows cold once it lapses', () => {
  const warm = { at: 0, tokens: null, ttl: '1h' as const }
  const left = (now: number) => runsOf(DEFAULTS, null, { warm, miss: null, now }, NO_SPEED)[0]?.[0]

  expect(left(HOUR - 301_000)).toEqual({ color: MUTED, text: 'Cache 5m' })
  expect(left(HOUR - 300_000)).toEqual({ color: 'red', text: 'Cache 5m' })
  expect(left(HOUR - 60_000)).toEqual({ color: 'red', text: 'Cache 1m' })
  expect(left(HOUR - 1000)).toEqual({ color: 'red', text: 'Cache 0m' })
  expect(left(HOUR - 999)).toEqual({ color: 'red', text: 'Cache fría' })
  expect(left(HOUR)).toEqual({ color: 'red', text: 'Cache fría' })
})

test('the warning color starts at the minutes set', () => {
  const warm = { at: 0, tokens: null, ttl: '1h' as const }
  const settings = { ...DEFAULTS, cacheSoonMinutes: 10 }
  const left = (now: number) => runsOf(settings, null, { warm, miss: null, now }, NO_SPEED)[0]?.[0]?.color

  expect(left(HOUR - 601_000)).toBe(MUTED)
  expect(left(HOUR - 600_000)).toBe('red')
})

test('the cache part is left out until a request has met the cache, or when hidden', () => {
  const warm = { at: 0, tokens: 10_000, ttl: '1h' as const }

  expect(runsOf(DEFAULTS, null, NO_CACHE, NO_SPEED)).toEqual([])
  expect(runsOf({ ...DEFAULTS, showCache: false }, null, { warm, miss: null, now: 0 }, NO_SPEED)).toEqual([])
})

test('the cache tokens are left out when hidden or unknown', () => {
  const warm = { at: 0, tokens: 10_000, ttl: '1h' as const }
  const cache = { warm, miss: null, now: MINUTE }

  expect(runsOf({ ...DEFAULTS, showCacheTokens: false }, null, cache, NO_SPEED)).toEqual([
    [{ color: MUTED, text: 'Cache 59m' }],
  ])
  expect(runsOf(DEFAULTS, null, { ...cache, warm: { ...warm, tokens: null } }, NO_SPEED)).toEqual([
    [{ color: MUTED, text: 'Cache 59m' }],
  ])
})

test('a recent miss shows after the cache with its cause', () => {
  const cache = {
    warm: { at: 0, tokens: 261_000, ttl: '1h' as const },
    miss: { at: 0, cause: 'ttl_expired_1h' },
    now: MINUTE,
  }

  expect(runsOf(DEFAULTS, null, cache, NO_SPEED)).toEqual([
    [
      { color: MUTED, text: 'Cache 59m (261k)' },
      { color: 'red', text: ' ⚠ miss' },
      { color: MUTED, text: ' ttl_expired_1h' },
    ],
  ])
})

test('a miss with no known cause shows alone, with no leading space, where the cache is hidden', () => {
  const cache = { warm: { at: 0, tokens: null, ttl: '1h' as const }, miss: { at: 0, cause: null }, now: MINUTE }

  expect(runsOf({ ...DEFAULTS, showCache: false }, null, cache, NO_SPEED)).toEqual([[{ color: 'red', text: '⚠ miss' }]])
})

test('a miss goes from the row after the minutes it is set to stay, or when hidden', () => {
  const warm = { at: 0, tokens: null, ttl: '1h' as const }
  const at = (now: number, settings = DEFAULTS) =>
    runsOf(settings, null, { warm, miss: { at: 0, cause: null }, now }, NO_SPEED)[0]?.map(run => run.text)

  expect(at(10 * MINUTE - 1)).toEqual(['Cache 50m', ' ⚠ miss'])
  expect(at(10 * MINUTE)).toEqual(['Cache 50m'])
  expect(at(MINUTE, { ...DEFAULTS, showMiss: false })).toEqual(['Cache 59m'])
  expect(at(MINUTE, { ...DEFAULTS, missShownMinutes: 1 })).toEqual(['Cache 59m'])
})

test('the speed shows the last response with the session average after it', () => {
  expect(runsOf(DEFAULTS, null, NO_CACHE, { last: 16, tokens: 1000, ms: 10_000 })).toEqual([
    [
      { color: '#d7af5f', text: '⚡ 16 tok/s' },
      { color: MUTED, text: ' (ø 100)' },
    ],
  ])
})

test('the speed leaves out the average when hidden or with no time behind it, and itself when there is none', () => {
  const rate = { last: 16, tokens: 1000, ms: 10_000 }

  expect(runsOf({ ...DEFAULTS, showAverage: false }, null, NO_CACHE, rate)).toEqual([
    [{ color: '#d7af5f', text: '⚡ 16 tok/s' }],
  ])
  expect(runsOf(DEFAULTS, null, NO_CACHE, { ...rate, ms: 0 })).toEqual([[{ color: '#d7af5f', text: '⚡ 16 tok/s' }]])
  expect(runsOf({ ...DEFAULTS, showSpeed: false }, null, NO_CACHE, rate)).toEqual([])
  expect(runsOf(DEFAULTS, null, NO_CACHE, NO_SPEED)).toEqual([])
})

test('the cost shows the dollars to the cent in the muted color, only when asked for', () => {
  const costly = { ...DEFAULTS, showCost: true }

  expect(runsOf(costly, null, NO_CACHE, NO_SPEED, 0.42)).toEqual([[{ color: MUTED, text: '$0.42' }]])
  expect(runsOf(costly, null, NO_CACHE, NO_SPEED, 0)).toEqual([[{ color: MUTED, text: '$0.00' }]])
  expect(runsOf(costly, null, NO_CACHE, NO_SPEED, 1234.5)).toEqual([[{ color: MUTED, text: '$1234.50' }]])
  expect(runsOf(costly, null, NO_CACHE, NO_SPEED, 0.005)).toEqual([[{ color: MUTED, text: '$0.01' }]])
  expect(runsOf(DEFAULTS, null, NO_CACHE, NO_SPEED, 0.42)).toEqual([])
})

test('the cost is in the color set for the secondary text, and is left out where the engine tells none', () => {
  const costly = { ...DEFAULTS, showCost: true, mutedColor: '#00ff00' }

  expect(runsOf(costly, null, NO_CACHE, NO_SPEED, 2)).toEqual([[{ color: '#00ff00', text: '$2.00' }]])
  expect(runsOf(costly, null, NO_CACHE, NO_SPEED, null)).toEqual([])
  expect(runsOf(costly, null, NO_CACHE, NO_SPEED)).toEqual([])
})

test('the parts come in the order window, cache, speed, cost, each a row of its own', () => {
  const runs = runsOf(
    { ...DEFAULTS, showCost: true },
    { percent: 90, window: 200_000 },
    { warm: { at: 0, tokens: null, ttl: '1h' }, miss: null, now: MINUTE },
    { last: 5, tokens: 5, ms: 1000 },
    3,
  )

  expect(runs.map(([first]) => first?.text.split(' ')[0])).toEqual(['Context', 'Cache', '⚡', '$3.00'])
})

test('the labels are the ones set', () => {
  const runs = runsOf(
    { ...DEFAULTS, contextLabel: 'Ctx', cacheLabel: 'Prompt', showBar: false, showPercent: false },
    { percent: 10, window: 100 },
    { warm: { at: 0, tokens: null, ttl: '1h' }, miss: null, now: MINUTE },
    NO_SPEED,
  )

  expect(runs.map(([first]) => first?.text)).toEqual(['Ctx', 'Prompt 59m'])
})

test('the warning shows the cache that lapsed while the prompt is idle and the setting is on', () => {
  const found = { tokens: 261_000 }

  expect(warningShown({ hasSurvey: false, isWorking: false }, found, DEFAULTS)).toBe(found)
})

test('the warning shows nothing while a survey is asked, a turn runs or the setting hides it', () => {
  const found = { tokens: 261_000 }

  expect(warningShown({ hasSurvey: true, isWorking: false }, found, DEFAULTS)).toBeNull()
  expect(warningShown({ hasSurvey: false, isWorking: true }, found, DEFAULTS)).toBeNull()
  expect(
    warningShown({ hasSurvey: false, isWorking: false }, found, { ...DEFAULTS, showCacheWarning: false }),
  ).toBeNull()
})

test('the warning shows nothing while the cache lives', () => {
  expect(warningShown({ hasSurvey: false, isWorking: false }, null, DEFAULTS)).toBeNull()
})

test('the compact button names the share of the window once it reaches the share set', () => {
  const at = (percent: number | undefined, settings = DEFAULTS) => compactShare(settings, { percent, window: 200_000 })

  expect(at(64)).toBeNull()
  expect(at(65)).toBe(65)
  expect(at(100)).toBe(100)
  expect(at(undefined)).toBeNull()
  expect(at(90, { ...DEFAULTS, showCompact: false })).toBeNull()
  expect(at(70, { ...DEFAULTS, compactFrom: 80 })).toBeNull()
  expect(compactShare(DEFAULTS, null)).toBeNull()
})
