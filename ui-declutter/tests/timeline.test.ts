import { expect, test } from 'claude-code/testing'
import type { ToolGroupCall } from 'claude-code'

import { barRuns, beforesOf, clockOf, endTiming, isLive, rowsOf, timeOf, verdictTiming } from '../hooks/timeline'

const call = (id: string, flags: Partial<ToolGroupCall> = {}): ToolGroupCall => ({
  tool_use_id: id,
  tool: 'Bash',
  input: {},
  isRunning: false,
  isErrored: false,
  isInterrupted: false,
  ...flags,
})

test('a call that ran has its own time, in its place', () => {
  const [row] = rowsOf([call('a')], [{ startedAt: 1000, endedAt: 3000, ranMs: 500, hasRun: true }])

  expect(row).toEqual({ call: call('a'), at: 0, ms: 500, deny: undefined, startedAt: 1000, endedAt: 3000 })
})

test('without its own time a call took what passed from its start to its end', () => {
  expect(rowsOf([call('a')], [{ startedAt: 1000, endedAt: 3000 }])[0]?.ms).toBe(2000)
  expect(rowsOf([call('a')], [{ startedAt: 1000 }])[0]?.ms).toBeUndefined()
  expect(rowsOf([call('a')], [undefined])[0]?.ms).toBeUndefined()
})

test('a call that was refused took no time, whoever refused it', () => {
  const [asked, denied] = rowsOf(
    [call('a', { isErrored: true }), call('b', { isErrored: true })],
    [
      { isAsked: true, startedAt: 0, endedAt: 9000 },
      { deny: 'no rule allows it', ranMs: 5, startedAt: 0, endedAt: 1 },
    ],
  )

  expect(asked).toMatchObject({ deny: 'not approved', ms: 0 })
  expect(denied).toMatchObject({ deny: 'no rule allows it', ms: 0 })
})

test('a call put to the person and then run was not refused', () => {
  const [row] = rowsOf([call('a', { isErrored: true })], [{ isAsked: true, hasRun: true, ranMs: 40 }])

  expect(row).toMatchObject({ deny: undefined, ms: 40 })
})

test("an edit's time is its own, else what passed", () => {
  expect(timeOf({ startedAt: 10, endedAt: 50, ranMs: 7 })).toEqual({ startedAt: 10, endedAt: 50, ms: 7 })
  expect(timeOf({ startedAt: 10, endedAt: 50 }).ms).toBe(40)
  expect(timeOf(undefined)).toEqual({ startedAt: undefined, endedAt: undefined, ms: undefined })
})

test('something started and not ended keeps the clock running', () => {
  expect(isLive([{ startedAt: 1, endedAt: 2 }, {}])).toBe(false)
  expect(isLive([{ startedAt: 1, endedAt: 2 }, { startedAt: 3 }])).toBe(true)
})

test("the span's time runs from its first start to its last end, the waits between included", () => {
  const rows = rowsOf(
    [call('a'), call('b')],
    [
      { startedAt: 1000, endedAt: 2000, ranMs: 900 },
      { startedAt: 3000, endedAt: 4500, ranMs: 1000 },
    ],
  )

  expect(clockOf(rows, [{ startedAt: 500, endedAt: 800, ms: 300 }], 9999)).toEqual({
    isTimed: true,
    origin: 500,
    total: 4000,
  })
})

test('a span of edits with times is timed', () => {
  expect(clockOf([], [{ startedAt: 10, endedAt: 20, ms: 5 }], 0)).toEqual({ isTimed: true, origin: 10, total: 10 })
})

test('what is still running ends now', () => {
  const rows = rowsOf([call('a', { isRunning: true })], [{ startedAt: 1000 }])

  expect(clockOf(rows, [], 6000)).toMatchObject({ isTimed: true, origin: 1000, total: 5000 })
})

test('calls with no start tell only their own times, and calls with no time tell none', () => {
  expect(clockOf(rowsOf([call('a'), call('b')], [{ ranMs: 300 }, { ranMs: 200 }]), [], 0)).toMatchObject({
    isTimed: true,
    total: 500,
  })
  expect(clockOf(rowsOf([call('a')], [undefined]), [], 0)).toMatchObject({ isTimed: false, total: 0 })
})

test("a bar marks where a tool ran on the span's clock", () => {
  expect(
    barRuns([{ startedAt: 0, endedAt: 50, ms: 50 }], undefined, { cells: 10, origin: 0, total: 100, now: 100 }),
  ).toEqual([
    { mark: 'ran', length: 5 },
    { mark: 'idle', length: 5 },
  ])
})

test('the wait since the rows before it ended is dotted up to where the tool ran', () => {
  expect(
    barRuns([{ startedAt: 80, endedAt: 100, ms: 20 }], 50, { cells: 10, origin: 0, total: 100, now: 100 }),
  ).toEqual([
    { mark: 'idle', length: 5 },
    { mark: 'wait', length: 3 },
    { mark: 'ran', length: 2 },
  ])
})

test('a tool that ran for less than a cell still shows one, and one still running runs to now', () => {
  expect(
    barRuns([{ startedAt: 0, endedAt: 1, ms: 1 }], undefined, { cells: 4, origin: 0, total: 100, now: 100 })[0],
  ).toEqual({
    mark: 'ran',
    length: 1,
  })
  expect(barRuns([{ startedAt: 50 }], undefined, { cells: 10, origin: 0, total: 100, now: 100 })).toEqual([
    { mark: 'idle', length: 5 },
    { mark: 'ran', length: 5 },
  ])
})

test('a span with no time still has a track, and a bar never runs past its end', () => {
  expect(barRuns([{ startedAt: 0, endedAt: 0, ms: 0 }], undefined, { cells: 4, origin: 0, total: 0, now: 0 })).toEqual([
    { mark: 'ran', length: 1 },
    { mark: 'idle', length: 3 },
  ])
  expect(
    barRuns([{ startedAt: 99, endedAt: 100, ms: 1 }], undefined, { cells: 4, origin: 0, total: 100, now: 100 }),
  ).toEqual([
    { mark: 'idle', length: 3 },
    { mark: 'ran', length: 1 },
  ])
})

test('a call the check allows adds nothing to its timing', () => {
  expect(verdictTiming({ decision: 'allow' })).toBeUndefined()
  expect(verdictTiming({ decision: 'allow', reason: 'fine', rule: 'Bash(ls)' })).toBeUndefined()
})

test('a call the check puts to the person is noted as asked, whatever it says of why', () => {
  expect(verdictTiming({ decision: 'ask' })).toEqual({ isAsked: true })
  expect(verdictTiming({ decision: 'ask', reason: 'unsure', rule: 'Bash(rm)' })).toEqual({ isAsked: true })
})

test('a call the check refuses is noted with its reason, else its rule, else that nothing allowed it', () => {
  expect(verdictTiming({ decision: 'deny', reason: 'no way', rule: 'Bash(rm)' })).toEqual({ deny: 'no way' })
  expect(verdictTiming({ decision: 'deny', rule: 'Bash(rm)' })).toEqual({ deny: 'Bash(rm)' })
  expect(verdictTiming({ decision: 'deny' })).toEqual({ deny: 'not allowed' })
})

test('the end of a call is noted with when, and why if the tool itself refused it', () => {
  expect(endTiming(500, undefined)).toEqual({ endedAt: 500 })
  expect(endTiming(500, 'no rule allows it')).toEqual({ endedAt: 500, deny: 'no rule allows it' })
  expect('deny' in endTiming(500, undefined)).toBe(false)
})

test('each row waits from when the latest of the timed rows before it ended', () => {
  const owns = [
    [{ startedAt: 0, endedAt: 100 }],
    [{ startedAt: 120, endedAt: 130 }, undefined],
    [{ startedAt: 50, endedAt: 60 }],
    [{ startedAt: 200 }],
    [],
    [undefined, {}],
    [{ startedAt: 300, endedAt: 310 }],
  ]

  expect(beforesOf(owns, 999)).toEqual([undefined, 100, 130, 130, 999, 999, 999])
})

test('the first row has none to wait for, and a row with no start moves nothing', () => {
  expect(beforesOf([], 5)).toEqual([])
  expect(beforesOf([[{ ms: 3 }], [{ startedAt: 1, endedAt: 2 }]], 5)).toEqual([undefined, undefined])
})

test('a row with no start has an empty bar', () => {
  expect(barRuns([undefined, {}], 10, { cells: 6, origin: 0, total: 100, now: 100 })).toEqual([
    { mark: 'idle', length: 6 },
  ])
})
