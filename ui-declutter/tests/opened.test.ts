import { expect, test } from 'claude-code/testing'

import { isSpanOpen, rowToggled, toggled, withFull, withoutSpans } from '../hooks/opened'

test('a press opens what was closed and closes what was open, the rest left as it was', () => {
  expect(toggled(['a'], 'b')).toEqual(['a', 'b'])
  expect(toggled(['a', 'b', 'c'], 'b')).toEqual(['a', 'c'])
})

test("a call's row pressed opens, and closes with its whole result too", () => {
  expect(rowToggled(['span:x'], 'a')).toEqual(['span:x', 'row:a'])
  expect(rowToggled(['row:a', 'full:a', 'row:b', 'full:b'], 'a')).toEqual(['row:b', 'full:b'])
})

test("a call's whole result is asked for on top of the rest", () => {
  expect(withFull(['row:a'], 'a')).toEqual(['row:a', 'full:a'])
})

test('the presses that turned spans are forgotten, the rows and files kept', () => {
  expect(withoutSpans(['span:a', 'row:a', 'span:b', 'full:a', 'file:a:/x'])).toEqual(['row:a', 'full:a', 'file:a:/x'])
})

test('a press turns a span from how spans start', () => {
  expect(isSpanOpen(false, [], 'a')).toBe(false)
  expect(isSpanOpen(false, ['span:a'], 'a')).toBe(true)
  expect(isSpanOpen(true, [], 'a')).toBe(true)
  expect(isSpanOpen(true, ['span:a'], 'a')).toBe(false)
  expect(isSpanOpen(false, ['span:b', 'row:a'], 'a')).toBe(false)
})
