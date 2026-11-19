import { expect, test } from 'claude-code/testing'

import {
  cachedTokens,
  coldOf,
  isMiss,
  isResume,
  isTtl,
  missCause,
  resumedAt,
  rewarmed,
  secondsLeft,
  ttlOfPlan,
  ttlSaid,
  writtenTtl,
} from '../hooks/prompt-cache'

const MINUTE = 60_000
const HOUR = 60 * MINUTE

const written = (cacheCreation: object, extra: object = {}) =>
  JSON.stringify({ type: 'assistant', message: { usage: { cache_creation: cacheCreation } }, ...extra })

test('only 5m and 1h are lifetimes the cache has', () => {
  expect(['5m', '1h'].every(isTtl)).toBe(true)
  expect(['2h', '', 5, null, undefined].some(isTtl)).toBe(false)
})

test('the lifetime written is the one of the last write the transcript reports', () => {
  const transcript = [
    written({ ephemeral_1h_input_tokens: 900, ephemeral_5m_input_tokens: 0 }),
    JSON.stringify({ type: 'user', message: { content: 'hi' } }),
    written({ ephemeral_1h_input_tokens: 0, ephemeral_5m_input_tokens: 40 }),
    '',
  ].join('\n')

  expect(writtenTtl(transcript)).toBe('5m')
  expect(writtenTtl(transcript.split('\n').slice(0, 2).join('\n'))).toBe('1h')
})

test('a write of 1h wins over one of 5m in the same response', () => {
  expect(writtenTtl(written({ ephemeral_1h_input_tokens: 1, ephemeral_5m_input_tokens: 1 }))).toBe('1h')
})

test('no lifetime is written by a subagent, a line cut short, a response that wrote nothing or an empty transcript', () => {
  const sidechain = written({ ephemeral_1h_input_tokens: 5 }, { isSidechain: true })
  const cut = written({ ephemeral_1h_input_tokens: 5 }).slice(0, -8)
  const nothing = written({ ephemeral_1h_input_tokens: 0, ephemeral_5m_input_tokens: 0 })
  const prompt = written({ ephemeral_1h_input_tokens: 5 }, { type: 'user' })

  expect([sidechain, cut, nothing, prompt, ''].map(writtenTtl)).toEqual([
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
  ])
})

test('the lifetime Claude Code is told by its variables and settings follows their order', () => {
  const none = { force5m: undefined, ttlVariable: undefined, setting: undefined, force1h: undefined }

  expect(ttlSaid(none)).toBeUndefined()
  expect(ttlSaid({ ...none, force1h: 'on' })).toBe('1h')
  expect(ttlSaid({ ...none, force1h: 'on', setting: '5m' })).toBe('5m')
  expect(ttlSaid({ ...none, force1h: 'on', setting: '5m', ttlVariable: '1h' })).toBe('1h')
  expect(ttlSaid({ force5m: 'YES', ttlVariable: '1h', setting: '1h', force1h: '1' })).toBe('5m')
})

test('a switch that is off, or a value that is no lifetime, says nothing', () => {
  expect(ttlSaid({ force5m: 'no', ttlVariable: '2h', setting: 3600, force1h: '0' })).toBeUndefined()
  expect(ttlSaid({ force5m: '', ttlVariable: '', setting: null, force1h: 'off' })).toBeUndefined()
  // Only the whole value switches it on, not a word that holds one.
  expect(ttlSaid({ force5m: 'only', ttlVariable: undefined, setting: undefined, force1h: 'yesterday' })).toBeUndefined()
})

test('the account gives an hour only while every plan window has room left', () => {
  expect(ttlOfPlan([{ kind: 'five_hour', percentUsed: 40 }])).toBe('1h')
  expect(
    ttlOfPlan([
      { kind: 'five_hour', percentUsed: 99 },
      { kind: 'seven_day', percentUsed: 10 },
    ]),
  ).toBe('1h')
  expect(
    ttlOfPlan([
      { kind: 'five_hour', percentUsed: 40 },
      { kind: 'seven_day', percentUsed: 100 },
    ]),
  ).toBe('5m')
})

test('an account that reports no plan window gets five minutes', () => {
  expect(ttlOfPlan([])).toBe('5m')
  expect(ttlOfPlan([{ kind: 'monthly', percentUsed: 0 }])).toBe('5m')
})

test('a resumed conversation was last answered the seconds ago Claude Code says', () => {
  expect(resumedAt(1_000_000, 30, false)).toBe(970_000)
  expect(resumedAt(1_000_000, undefined, false)).toBe(1_000_000)
})

test('a cache Claude Code says has lapsed was written an hour ago, whatever the seconds say', () => {
  expect(resumedAt(10 * HOUR, 5, true)).toBe(9 * HOUR)
  expect(resumedAt(10 * HOUR, undefined, true)).toBe(9 * HOUR)
})

test('the cache has its lifetime less the time since the last request, in whole seconds', () => {
  const warm = { at: 0, tokens: null, ttl: '5m' as const }

  expect(secondsLeft(warm, 100_500)).toBe(199)
  expect(secondsLeft(warm, 5 * MINUTE)).toBe(0)
  expect(secondsLeft(warm, 5 * MINUTE + 100_000)).toBe(-100)
  expect(secondsLeft({ ...warm, ttl: '1h' }, 0)).toBe(3600)
})

test('the cache is cold from the moment its lifetime ends, with the tokens a next request writes again', () => {
  const warm = { at: 1000, tokens: 261_000, ttl: '5m' as const }

  expect(coldOf(null, 10 * HOUR)).toBeNull()
  expect(coldOf(warm, 1000 + 5 * MINUTE - 1)).toBeNull()
  expect(coldOf(warm, 1000 + 5 * MINUTE)).toEqual({ tokens: 261_000 })
  expect(coldOf({ ...warm, tokens: null }, 10 * HOUR)).toEqual({ tokens: null })
})

test('a miss is put down to the lifetime that lapsed, else to the model that changed, else to nothing known', () => {
  const warm = { at: 0, tokens: 100, ttl: '1h' as const, model: 'a' }

  expect(missCause(null, HOUR, 'a')).toBeNull()
  expect(missCause(warm, HOUR, 'b')).toBe('ttl_expired_1h')
  expect(missCause({ ...warm, ttl: '5m' }, 5 * MINUTE, 'a')).toBe('ttl_expired_5m')
  expect(missCause(warm, HOUR - 1, 'b')).toBe('model_changed')
  expect(missCause(warm, HOUR - 1, 'a')).toBeNull()
  expect(missCause({ at: 0, tokens: 100, ttl: '1h' }, HOUR - 1, 'b')).toBeNull()
})

test('a response that read or wrote the cache left in it all its input', () => {
  expect(cachedTokens({ input_tokens: 5, cache_read_input_tokens: 100 })).toBe(105)
  expect(cachedTokens({ input_tokens: 3, cache_creation_input_tokens: 50 })).toBe(53)
  expect(cachedTokens({ input_tokens: 3, cache_read_input_tokens: 10, cache_creation_input_tokens: 20 })).toBe(33)
})

test('a response that touched no cache left none', () => {
  expect(cachedTokens({})).toBeNull()
  expect(cachedTokens({ input_tokens: 900, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 })).toBeNull()
})

test('a request that wrote again and read back less than half of the cache is a miss', () => {
  const before = { at: 0, tokens: 1000, ttl: '1h' as const }

  expect(isMiss(before, { cache_creation_input_tokens: 600, cache_read_input_tokens: 499 })).toBe(true)
  expect(isMiss(before, { cache_creation_input_tokens: 600, cache_read_input_tokens: 500 })).toBe(false)
  expect(isMiss(before, { cache_creation_input_tokens: 0, cache_read_input_tokens: 0 })).toBe(false)
})

test('there is no miss to speak of without a cache whose size is known', () => {
  const usage = { cache_creation_input_tokens: 600, cache_read_input_tokens: 0 }

  expect(isMiss(null, usage)).toBe(false)
  expect(isMiss({ at: 0, tokens: null, ttl: '1h' }, usage)).toBe(false)
})

test('a session that resumes or forks takes up a conversation that went before', () => {
  expect(['resume', 'fork'].every(isResume)).toBe(true)
  expect(['startup', 'clear', 'compact', ''].some(isResume)).toBe(false)
})

test('a cache told of a change takes it, and keeps the rest', () => {
  const left = { at: 1000, tokens: 5000, ttl: '5m', model: 'claude-opus-5-5' } as const

  expect(rewarmed(left, { at: 2000 })).toEqual({ ...left, at: 2000 })
  expect(rewarmed(left, { ttl: '1h' })).toEqual({ ...left, ttl: '1h' })
})

test('there is no cache to tell of a change where there was none', () => {
  expect(rewarmed(null, { at: 2000 })).toBeNull()
})
