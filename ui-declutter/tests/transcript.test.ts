import { expect, test } from 'claude-code/testing'

import {
  CHUNK,
  RETRIES,
  foundFor,
  isKept,
  lostIn,
  resultsIn,
  resultsOfRow,
  retriable,
  unknownOf,
} from '../hooks/transcript'

const row = (id: string, result: unknown, extra: object = {}) =>
  JSON.stringify({
    type: 'user',
    message: { content: [{ type: 'tool_result', tool_use_id: id, content: 'ok' }] },
    toolUseResult: result,
    ...extra,
  })

test('a user row gives the result of each wanted id it answers, the whole result', () => {
  const result = { type: 'update', filePath: '/a.ts', structuredPatch: [{ oldStart: 1 }], extra: 1 }
  const two = JSON.stringify({
    type: 'user',
    message: {
      content: [
        { type: 'tool_result', tool_use_id: 'u1' },
        { type: 'text', text: 'hi' },
        { type: 'tool_result', tool_use_id: 'u2' },
        { type: 'tool_result', tool_use_id: 'u3' },
      ],
    },
    toolUseResult: result,
  })

  expect(resultsOfRow(row('u1', result), new Set(['u1']))).toEqual([{ id: 'u1', output: result }])
  expect(resultsOfRow(two, new Set(['u2', 'u1']))).toEqual([
    { id: 'u1', output: result },
    { id: 'u2', output: result },
  ])
})

test('a row that holds no wanted id, or no result, gives nothing', () => {
  const wanted = new Set(['u1'])

  expect(resultsOfRow(row('u2', {}), wanted)).toEqual([])
  expect(resultsOfRow(row('u1', {}, { toolUseResult: undefined }), wanted)).toEqual([])
  expect(resultsOfRow('', wanted)).toEqual([])
})

test("a row that is no user's, or whose result is no object, gives nothing", () => {
  const wanted = new Set(['u1'])

  expect(resultsOfRow(row('u1', {}, { type: 'assistant' }), wanted)).toEqual([])
  expect(resultsOfRow(row('u1', 'a string, no object'), wanted)).toEqual([])
  expect(resultsOfRow(row('u1', null), wanted)).toEqual([])
  expect(resultsOfRow(row('u1', [{}]), wanted)).toEqual([])
})

test('a row whose content is no list, or whose blocks are no results of the id, gives nothing', () => {
  const wanted = new Set(['u1'])
  const text = { type: 'user', toolUseResult: {}, message: { content: 'u1 as text' } }
  const block = { type: 'user', toolUseResult: {}, message: { content: [{ type: 'text', tool_use_id: 'u1' }] } }
  const loose = { type: 'user', toolUseResult: {}, message: { content: [{ type: 'tool_result', tool_use_id: 1 }] } }

  expect(resultsOfRow(JSON.stringify(text), wanted)).toEqual([])
  expect(resultsOfRow(JSON.stringify(block), wanted)).toEqual([])
  expect(resultsOfRow(JSON.stringify(loose), wanted)).toEqual([])
  expect(resultsOfRow(JSON.stringify({ type: 'user', toolUseResult: {} }), wanted)).toEqual([])
})

test('a row that names a wanted id and is no JSON is an error, not a missing result', () => {
  expect(() => resultsOfRow('{"toolUseResult":{},"u1', new Set(['u1']))).toThrow()
})

/** A transcript's bytes, read by ranges as `$.fs.read` does, and how many reads it took. */
const file = (text: string) => {
  const bytes = new TextEncoder().encode(text)
  const reads: [number, number][] = []

  return {
    bytes,
    reads,
    read: (offset: number, length: number) => {
      reads.push([offset, length])

      return Promise.resolve(bytes.slice(offset, offset + length))
    },
  }
}

const lines = (...rows: string[]) => `${rows.join('\n')}\n`

test('the results are read from the transcript, each by the id of the call', async () => {
  const { bytes, read } = file(lines(row('u1', { n: 1 }), row('u2', { n: 2 }), row('u3', { n: 3 })))
  const found = await resultsIn(read, bytes.length, new Set(['u1', 'u3', 'u9']))

  expect([...found]).toEqual([
    ['u3', { n: 3 }],
    ['u1', { n: 1 }],
  ])
})

test('the file is read from its end, and no more once every id is found', async () => {
  const text = lines(row('u1', {}), row('u2', {}), row('u3', {}))
  const { bytes, reads, read } = file(text)
  const chunk = text.length / 3 + 1

  await resultsIn(read, bytes.length, new Set(['u3']), chunk)
  expect(reads).toEqual([[bytes.length - chunk, chunk]])

  reads.length = 0
  await resultsIn(read, bytes.length, new Set(['u1', 'u9']), chunk)
  expect(reads.at(0)).toEqual([bytes.length - chunk, chunk])
  expect(reads.at(-1)?.[0]).toBe(0)
  expect(reads.every(([offset, length]) => offset >= 0 && length <= chunk)).toBe(true)
})

test('where an id has two results, the later one is kept', async () => {
  const { bytes, read } = file(lines(row('u1', { n: 1 }), row('u1', { n: 2 })))

  expect((await resultsIn(read, bytes.length, new Set(['u1']))).get('u1')).toEqual({ n: 2 })
})

test('a row a chunk cuts is read whole, whatever the chunk size and where the edge falls, accents included', async () => {
  const text = lines(
    row('u1', { text: 'línea ñandú 日本語 😀' }),
    row('u2', { text: 'x'.repeat(40) }),
    row('u3', { text: 'ç' }),
    row('u4', { text: '😀😀😀' }),
  )
  const { bytes, read } = file(text)
  const wanted = new Set(['u1', 'u2', 'u3', 'u4'])
  const whole = await resultsIn(read, bytes.length, wanted)

  expect(whole.size).toBe(4)

  for (let chunk = 1; chunk <= bytes.length + 1; chunk += 1) {
    expect(await resultsIn(read, bytes.length, wanted, chunk)).toEqual(whole)
  }
})

test('a row longer than a chunk is joined from as many chunks as it spans', async () => {
  const { bytes, read } = file(lines(row('u1', { text: 'y'.repeat(500) }), row('u2', {})))

  expect((await resultsIn(read, bytes.length, new Set(['u1']), 64)).get('u1')).toEqual({ text: 'y'.repeat(500) })
})

test('a last row not written whole is left out, even one longer than a chunk, and the ones before it are read', async () => {
  const whole = lines(row('u1', { n: 1 }))
  const torn = row('u2', { text: 'z'.repeat(300) }).slice(0, -20)
  const { bytes, read } = file(whole + torn)

  expect([...(await resultsIn(read, bytes.length, new Set(['u1', 'u2']), 64))]).toEqual([['u1', { n: 1 }]])
  expect([...(await resultsIn(read, bytes.length, new Set(['u1', 'u2'])))]).toEqual([['u1', { n: 1 }]])
})

test('an empty transcript, or no wanted id, reads nothing', async () => {
  const { reads, read } = file('')

  expect((await resultsIn(read, 0, new Set(['u1']))).size).toBe(0)
  expect((await resultsIn(read, 10, new Set())).size).toBe(0)
  expect(reads).toEqual([])
})

test('a chunk is what one read of the file answers at most, 4 MiB', () => {
  expect(CHUNK).toBe(4194304)
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
