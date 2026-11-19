import { expect, test } from 'claude-code/testing'

import { rule } from '../hooks/rule'

const text = (color: string, line: string) => ({
  type: 'Text',
  props: { color, wrap: 'truncate-end' },
  children: [line],
})

test('a rule is a text of its colour as wide as the row, cut at its edge rather than wrapped', () => {
  expect(rule(5, 'warning', false)).toEqual(text('warning', '─────'))
})

test('a dashed rule is drawn with dashes', () => {
  expect(rule(3, '#7a8aa6', true)).toEqual(text('#7a8aa6', '╌╌╌'))
})

test('a rule is at least one character wide', () => {
  expect([0, -4, 1].map(columns => rule(columns, 'error', false))).toEqual([
    text('error', '─'),
    text('error', '─'),
    text('error', '─'),
  ])
})
