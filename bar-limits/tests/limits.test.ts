import { expect, test } from 'claude-code/testing'

import { modelsOf, windowsOf } from '../hooks/limits'

const SESSION = { kind: 'five_hour', percentUsed: 2, resetsAt: '2026-10-22T12:00:00Z' } as const
const WEEK = { kind: 'seven_day', percentUsed: 19.4, resetsAt: '2026-10-23T15:00:00Z' } as const

test('the session and the week are the windows the engine measured', () => {
  expect(windowsOf([WEEK, SESSION])).toEqual([SESSION, WEEK])
})

test('a window the engine has not measured is left out', () => {
  expect(windowsOf([WEEK])).toEqual([WEEK])
  expect(windowsOf([SESSION])).toEqual([SESSION])
  expect(windowsOf([])).toEqual([])
})

test('a window keeps only its kind, share and reset', () => {
  const measured = { ...SESSION, extra: 'x' } as unknown as typeof SESSION

  expect(windowsOf([measured])).toEqual([SESSION])
})

const scoped = (over: object = {}) => ({
  kind: 'weekly_scoped',
  percent: 7,
  resets_at: '2026-10-23T15:00:00+00:00',
  scope: { model: { display_name: 'Fable' } },
  ...over,
})

test("each model's weekly limit in the endpoint's answer is one limit", () => {
  expect(
    modelsOf(
      JSON.stringify({ limits: [scoped(), scoped({ percent: 0, scope: { model: { display_name: 'Opus' } } })] }),
    ),
  ).toEqual([
    { kind: 'model', name: 'Fable', percentUsed: 7, resetsAt: '2026-10-23T15:00:00+00:00' },
    { kind: 'model', name: 'Opus', percentUsed: 0, resetsAt: '2026-10-23T15:00:00+00:00' },
  ])
})

test('a limit that is not a model weekly one, has no model name or no share is left out', () => {
  const body = {
    limits: [
      scoped({ kind: 'session', scope: null }),
      scoped({ scope: { model: {} } }),
      scoped({ scope: { model: { display_name: 5 } } }),
      scoped({ scope: undefined }),
      scoped({ percent: '7' }),
      scoped({ percent: undefined }),
      scoped(),
    ],
  }

  expect(modelsOf(JSON.stringify(body)).map(({ name }) => name)).toEqual(['Fable'])
})

test('a reset that is empty or not a text leaves none', () => {
  const resets = (resets_at: unknown) => modelsOf(JSON.stringify({ limits: [scoped({ resets_at })] }))[0]?.resetsAt

  expect([resets(''), resets(5), resets(null), resets(undefined)]).toEqual([undefined, undefined, undefined, undefined])
})

test('an answer with no limits gives none', () => {
  expect(modelsOf('{}')).toEqual([])
  expect(modelsOf('{"limits":[]}')).toEqual([])
})
