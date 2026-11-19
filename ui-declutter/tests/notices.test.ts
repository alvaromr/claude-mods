import { expect, test } from 'claude-code/testing'

import { jqNotice, jqUnchecked, messageOf } from '../hooks/notices'
import { TEXT } from '../hooks/text'

test("a failure's message is its own if it is an error, else what it says as text", () => {
  expect(messageOf(new Error('no luck'))).toBe('no luck')
  expect(messageOf('plain')).toBe('plain')
  expect(messageOf(42)).toBe('42')
})

test('the person is told of a missing jq, and of nothing when it is there', () => {
  expect(jqNotice(0)).toBeUndefined()
  expect(jqNotice(1)).toBe(TEXT.needsJq)
  expect(jqNotice(127)).toBe(TEXT.needsJq)
})

test('a check for jq that could not run says why', () => {
  expect(jqUnchecked(new Error('spawn failed'))).toBe(TEXT.cannotCheckJq('spawn failed'))
  expect(jqUnchecked('gone')).toBe(TEXT.cannotCheckJq('gone'))
})
