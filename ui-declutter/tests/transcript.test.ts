import { expect, test } from 'claude-code/testing'

import {
  RETRIES,
  foundFor,
  isKept,
  lostIn,
  resultsFrom,
  retriable,
  transcriptCommand,
  unknownOf,
} from '../hooks/transcript'

test("the plugin's script picks the wanted ids' results out of the session's transcript under the config folder", () => {
  expect(transcriptCommand(['a', 'b'], '/cfg', 's1', '/plugin')).toEqual([
    'sh',
    '/plugin/scripts/transcript.sh',
    '["a","b"]',
    '/cfg',
    's1',
  ])
})

test("each line jq printed is one call's result, read as they come", () => {
  const out = '{"id":"a","output":{"type":"update"}}\n\n{"id":"b","output":null}\n'

  expect([...resultsFrom(out, false)]).toEqual([
    { id: 'a', output: { type: 'update' } },
    { id: 'b', output: null },
  ])
  expect([...resultsFrom('', false)]).toEqual([])
})

test('an output cut at its limit loses its last result, which may be half', () => {
  const out = '{"id":"a","output":{}}\n{"id":"b","output":{}}\n{"id":"c","outp'

  expect([...resultsFrom(out, true)].map(result => result.id)).toEqual(['a', 'b'])
  expect([...resultsFrom('{"id":"a","output":{}}\n', true)]).toEqual([])
})

test('the results before a line that is not JSON are still read', () => {
  const read: string[] = []

  expect(() => {
    for (const { id } of resultsFrom('{"id":"a","output":{}}\nnot json\n', false)) {
      read.push(id)
    }
  }).toThrow()
  expect(read).toEqual(['a'])
})

test('only the result of a call with an id, and an object, is kept', () => {
  expect(isKept('a', {})).toBe(true)
  expect(isKept(undefined, {})).toBe(false)
  expect(isKept('a', 'text')).toBe(false)
  expect(isKept('a', null)).toBe(false)
  expect(isKept('a', undefined)).toBe(false)
})

test('the ids not known yet are those with no result, one found nowhere being known', () => {
  const results = new Map<string, unknown>([
    ['a', {}],
    ['b', null],
  ])

  expect(unknownOf(['a', 'b', 'c', 'd'], results)).toEqual(['c', 'd'])
  expect(unknownOf(new Set(['c', 'a']), results)).toEqual(['c'])
})

test('an id found nowhere is read again until it has been in vain as often as allowed', () => {
  const misses = new Map([
    ['a', 0],
    ['b', RETRIES - 1],
    ['c', RETRIES],
    ['d', RETRIES + 1],
  ])

  expect(RETRIES).toBe(2)
  expect(retriable(['a', 'b', 'c', 'd', 'e'], misses)).toEqual(['a', 'b', 'e'])
})

test('the ids found nowhere are those whose result is none, not those unknown', () => {
  const results = new Map<string, unknown>([
    ['a', {}],
    ['b', null],
    ['c', undefined],
  ])

  expect(lostIn(['a', 'b', 'c', 'd'], results)).toEqual(['b'])
})

test("each id's result, none where unknown or found nowhere", () => {
  const results = new Map<string, { hunks: number } | null>([
    ['a', { hunks: 1 }],
    ['b', null],
  ])

  expect(foundFor(['b', 'a', 'z'], results)).toEqual([null, { hunks: 1 }, null])
})
