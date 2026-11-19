import { expect, test } from 'claude-code/testing'

import { DEFAULTS } from '../hooks/preferences'
import { FETCH_EVERY_MS, cycleMs, fetchWait } from '../hooks/timing'

test('the usage endpoint is read at most once a minute', () => {
  expect(FETCH_EVERY_MS).toBe(60_000)
})

test('a read asked for too soon waits until a minute after the last one', () => {
  expect(fetchWait(1_000_000, 1_000_000)).toBe(60_000)
  expect(fetchWait(1_020_000, 1_000_000)).toBe(40_000)
  expect(fetchWait(1_059_999, 1_000_000)).toBe(1)
})

test('a read asked for a minute or more after the last one, or the first, waits no time', () => {
  expect(fetchWait(1_060_000, 1_000_000)).toBe(0)
  expect(fetchWait(2_000_000, 1_000_000)).toBe(0)
  expect(fetchWait(1_000_000, -Infinity)).toBe(0)
})

test('the line cycles every `cycleSeconds` while it is set to', () => {
  expect(cycleMs({ ...DEFAULTS, cycle: true, cycleSeconds: 8 })).toBe(8000)
  expect(cycleMs({ ...DEFAULTS, cycle: true, cycleSeconds: 1 })).toBe(1000)
})

test('the line does not cycle by itself when it is not set to, or the seconds are 0', () => {
  expect(cycleMs({ ...DEFAULTS, cycle: false, cycleSeconds: 8 })).toBeUndefined()
  expect(cycleMs({ ...DEFAULTS, cycle: true, cycleSeconds: 0 })).toBeUndefined()
})
