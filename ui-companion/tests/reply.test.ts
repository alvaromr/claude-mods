import { expect, test } from 'claude-code/testing'

import { isSilent, messageOf, whyUnanswered } from '../hooks/reply'

const USAGE = {
  input_tokens: 0,
  output_tokens: 0,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
}

test('a mode is silent when its reply is empty or the dash it is told to answer', () => {
  expect(isSilent('')).toBe(true)
  expect(isSilent('—')).toBe(true)
})

test('a reply with anything else is not silent', () => {
  expect(isSilent('- algo')).toBe(false)
  expect(isSilent('— y algo más')).toBe(false)
  expect(isSilent('-')).toBe(false)
})

test('a failure that is an error says its message, and any other is said as text', () => {
  expect(messageOf(new Error('modelo rechazado'))).toBe('modelo rechazado')
  expect(messageOf('a secas')).toBe('a secas')
  expect(messageOf(42)).toBe('42')
  expect(messageOf(undefined)).toBe('undefined')
})

test('a refusal by the API says its reason, its kind of error and its status', () => {
  expect(
    whyUnanswered({ isAnswered: false, reason: 'api-error', status: 429, error: 'rate_limit', usage: USAGE }),
  ).toBe('api-error rate_limit 429')
})

test('a refusal by the API that arrived with no response ends with no status', () => {
  expect(whyUnanswered({ isAnswered: false, reason: 'api-error', status: null, error: 'unknown', usage: USAGE })).toBe(
    'api-error unknown ',
  )
})

test('any other reason for no reply is said alone', () => {
  expect(whyUnanswered({ isAnswered: false, reason: 'empty-reply', usage: USAGE })).toBe('empty-reply')
  expect(whyUnanswered({ isAnswered: false, reason: 'aborted', usage: USAGE })).toBe('aborted')
})
