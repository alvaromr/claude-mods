import { expect, test } from 'claude-code/testing'

import { clip, clipStart, widthOf } from '../hooks/cells'

test('a text takes the cells a terminal draws: none for combining marks, two for wide characters and emoji', () => {
  expect(widthOf('abc')).toBe(3)
  expect(widthOf('é')).toBe(1)
  expect(widthOf('日本')).toBe(4)
  expect(widthOf('😀')).toBe(2)
  expect(widthOf('')).toBe(0)
})

test('a text that fits its room is left as it is', () => {
  expect(clip('abcd', 4)).toBe('abcd')
  expect(clip('日本', 4)).toBe('日本')
})

test('a text too long for its room is cut at a character and ended with an ellipsis that fits in it', () => {
  expect(clip('abcdef', 4)).toBe('abc…')
  expect(clip('日本語', 4)).toBe('日…')
  expect(clip('abc', 0)).toBe('…')
})

test('the end of a text is kept from the right, never half a wide character', () => {
  expect(clipStart('abcdef', 3)).toBe('def')
  expect(clipStart('日本語', 4)).toBe('本語')
  expect(clipStart('日本語', 3)).toBe('語')
  expect(clipStart('abc', 10)).toBe('abc')
})
