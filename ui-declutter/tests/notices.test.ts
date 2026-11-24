import { expect, test } from 'claude-code/testing'

import { messageOf } from '../hooks/notices'

test("a failure's message is its own if it is an error, else what it says as text", () => {
  expect(messageOf(new Error('no luck'))).toBe('no luck')
  expect(messageOf('plain')).toBe('plain')
  expect(messageOf(42)).toBe('42')
})
