import { expect, test } from 'claude-code/testing'

import { reasonOf } from '../hooks/reason'

test('an error says its message, anything else as it prints', () => {
  expect(reasonOf(new Error('no space left'))).toBe('no space left')
  expect(reasonOf('plain')).toBe('plain')
  expect(reasonOf(3)).toBe('3')
  expect(reasonOf(undefined)).toBe('undefined')
})
