import { expect, test } from 'claude-code/testing'

import { isAfterPause, marked, staggerOf } from '../hooks/resend'

test('a picture marked is the same picture in other bytes: an empty private chunk before the last 12 bytes', () => {
  const bytes = 'HEADERBYTES0123456789ab' + 'END-CHUNK-12'
  const png = btoa(bytes)

  expect(atob(marked(png))).toBe('HEADERBYTES0123456789ab' + '\x00\x00\x00\x00reSd\x75\x27\x15\x16' + 'END-CHUNK-12')
  expect(marked(png)).not.toBe(png)
})

test('the first key typed is no return, nor one after less than five seconds', () => {
  expect(isAfterPause(undefined, 10_000)).toBe(false)
  expect(isAfterPause(1000, 5999)).toBe(false)
  expect(isAfterPause(1000, 1000)).toBe(false)
})

test('a key typed five seconds or more after the last is the person back', () => {
  expect(isAfterPause(1000, 6000)).toBe(true)
  expect(isAfterPause(0, 60_000)).toBe(true)
  expect(isAfterPause(0, 5000)).toBe(true)
})

test('each picture waits 50 ms more than the one before to be sent again', () => {
  expect([0, 1, 2, 10].map(staggerOf)).toEqual([0, 50, 100, 500])
})
