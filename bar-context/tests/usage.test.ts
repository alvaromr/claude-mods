import { expect, test } from 'claude-code/testing'

import {
  effortStarted,
  fillAfter,
  fillAtStart,
  isTimed,
  modelAsked,
  modelNamed,
  nameOf,
  speedAfter,
} from '../hooks/usage'

for (const [id, name] of [
  ['claude-opus-5-5', 'Opus 5.5'],
  ['claude-opus-4-6[1m]', 'Opus 4.6'],
  ['claude-haiku-4-5-20251001', 'Haiku 4.5'],
  ['claude-sonnet-4-20250514', 'Sonnet 4'],
  ['claude-sonnet-4', 'Sonnet 4'],
] as const) {
  test(`the model id ${id} reads as ${name}`, () => {
    expect(nameOf(id)).toBe(name)
  })
}

for (const [id, name] of [
  ['Opus 5.5 1M context', 'Opus 5.5'],
  ['opus[1m]', 'opus'],
  ['Sonnet 4.6', 'Sonnet 4.6'],
  ['default', 'default'],
  ['my-claude-opus-5-5', 'my-claude-opus-5-5'],
] as const) {
  test(`a name already readable, ${id}, keeps its words and loses the window it names`, () => {
    expect(nameOf(id)).toBe(name)
  })
}

test('the session telling its model names it, and keeps the effort', () => {
  expect(modelNamed({ name: null, effort: 'high' }, 'claude-opus-5-5')).toEqual({ name: 'Opus 5.5', effort: 'high' })
})

test('the session telling no model leaves none, and keeps the effort', () => {
  expect(modelNamed({ name: 'Opus 5.5', effort: 'high' }, null)).toEqual({ name: null, effort: 'high' })
})

test('a request names the model and the effort it asked for, as text', () => {
  const before = { name: 'Sonnet 4', effort: 'low' }

  expect(modelAsked(before, 'claude-opus-5-5', 'max')).toEqual({ name: 'Opus 5.5', effort: 'max' })
  expect(modelAsked(before, 'claude-opus-5-5', 3)).toEqual({ name: 'Opus 5.5', effort: '3' })
})

test('a request that asked for no effort leaves none', () => {
  expect(modelAsked({ name: null, effort: 'low' }, 'claude-opus-5-5', undefined)).toEqual({
    name: 'Opus 5.5',
    effort: null,
  })
})

test('the effort at the start is the known one, else the saved one when it is a text, else none', () => {
  expect(effortStarted({ name: 'Opus 5.5', effort: 'high' }, 'low')).toEqual({ name: 'Opus 5.5', effort: 'high' })
  expect(effortStarted({ name: 'Opus 5.5', effort: null }, 'low')).toEqual({ name: 'Opus 5.5', effort: 'low' })
  expect(effortStarted({ name: null, effort: null }, 7)).toEqual({ name: null, effort: null })
  expect(effortStarted({ name: null, effort: null }, undefined)).toEqual({ name: null, effort: null })
})

test('a response says a speed only when it put out tokens in some time', () => {
  expect(isTimed(100, 1000)).toBe(true)
  expect(isTimed(0, 1000)).toBe(false)
  expect(isTimed(100, 0)).toBe(false)
  expect(isTimed(100, -5)).toBe(false)
})

test('a response sets the last speed and adds its tokens and time to the session sums', () => {
  expect(speedAfter({ last: null, tokens: 0, ms: 0 }, 160, 10_000)).toEqual({ last: 16, tokens: 160, ms: 10_000 })
  expect(speedAfter({ last: 16, tokens: 160, ms: 10_000 }, 500, 3000)).toEqual({ last: 166, tokens: 660, ms: 13_000 })
})

test('a measurement with no fill keeps the one told before, when it is to be kept', () => {
  const told = { percent: 40, tokens: 80_000, window: 200_000 }

  expect(fillAfter(told, { window: 200_000 }, true)).toBe(told)
  expect(fillAfter(told, { window: 200_000 }, false)).toEqual({ window: 200_000 })
})

test('a measurement with a fill replaces the one told before', () => {
  const measured = { percent: 12, tokens: 24_000, window: 200_000 }

  expect(fillAfter({ percent: 40, tokens: 80_000, window: 200_000 }, measured, true)).toEqual(measured)
})

test('a measurement with no fill is kept as it is where there was none to keep', () => {
  expect(fillAfter(null, { window: 200_000 }, true)).toEqual({ window: 200_000 })
  expect(fillAfter({ window: 100_000 }, { window: 200_000 }, true)).toEqual({ window: 200_000 })
})

test('a resumed conversation starts with the share its last response left in the window', () => {
  expect(fillAtStart(null, 50_000, 200_000)).toEqual({ tokens: 50_000, window: 200_000, percent: 25 })
  expect(fillAtStart(null, 66_666, 200_000)).toEqual({ tokens: 66_666, window: 200_000, percent: 33 })
})

test('a resumed share is rounded to the nearest percent', () => {
  expect(fillAtStart(null, 101_000, 200_000)?.percent).toBe(51)
})

test('a window never starts over full', () => {
  expect(fillAtStart(null, 250_000, 200_000)).toEqual({ tokens: 250_000, window: 200_000, percent: 100 })
})

test('a conversation that starts over keeps only the size of the window it had', () => {
  expect(fillAtStart({ percent: 40, tokens: 80_000, window: 200_000 }, undefined, 200_000)).toEqual({ window: 200_000 })
  expect(fillAtStart({ percent: 40, tokens: 80_000, window: 200_000 }, 50_000, undefined)).toEqual({ window: 200_000 })
  expect(fillAtStart(null, undefined, 200_000)).toBeNull()
})
