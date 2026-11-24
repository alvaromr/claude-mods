import { expect, test } from 'claude-code/testing'

import { focusAfter, focusPosted, isAfterPause, marked, staggerOf, UNKNOWN_FOCUS } from '../hooks/resend'

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

test('the window is focused until it says otherwise, and its focus is reported once it was seen lost', () => {
  expect(UNKNOWN_FOCUS).toEqual({ isReported: false, isFocused: true })
  expect(focusAfter(UNKNOWN_FOCUS, true).focus).toEqual({ isReported: false, isFocused: true })
  expect(focusAfter(UNKNOWN_FOCUS, false).focus).toEqual({ isReported: true, isFocused: false })
  expect(focusAfter({ isReported: true, isFocused: false }, true).focus).toEqual({ isReported: true, isFocused: true })
})

test('the person is back when the window gets the focus after losing it, not when it keeps or loses it', () => {
  expect(focusAfter({ isReported: true, isFocused: false }, true).isBack).toBe(true)
  expect(focusAfter(UNKNOWN_FOCUS, true).isBack).toBe(false)
  expect(focusAfter(UNKNOWN_FOCUS, false).isBack).toBe(false)
  expect(focusAfter({ isReported: true, isFocused: false }, false).isBack).toBe(false)
})

test('the focus a surface module posted is its boolean, none for anything else', () => {
  expect(focusPosted({ isFocused: false })).toBe(false)
  expect(focusPosted({ isFocused: true })).toBe(true)
  expect([null, undefined, 'x', 3, {}, { isFocused: 'yes' }].map(focusPosted)).toEqual(Array(6).fill(undefined))
})

test('each picture waits 50 ms more than the one before to be sent again', () => {
  expect([0, 1, 2, 10].map(staggerOf)).toEqual([0, 50, 100, 500])
})
