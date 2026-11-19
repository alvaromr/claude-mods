import { expect, test } from 'claude-code/testing'

import { reasonOf } from '../hooks/failure'

test('an Error says its message', () => {
  expect(reasonOf(new Error('disk full'))).toBe('disk full')
})

test('anything else thrown says its text', () => {
  expect([reasonOf('plain'), reasonOf(7), reasonOf(null), reasonOf(undefined)]).toEqual([
    'plain',
    '7',
    'null',
    'undefined',
  ])
})
