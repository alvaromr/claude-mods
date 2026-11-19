import { expect, test } from 'claude-code/testing'

import type { Mod } from '../types'
import { failureOf, messageOf, switchArgs } from '../hooks/cli'
import { TEXT } from '../hooks/text'

const mod = (isEnabled: boolean, scope?: string): Mod => ({
  id: 'pet@market',
  isEnabled,
  description: 'x',
  ...(scope === undefined ? {} : { scope }),
})

test('a failure that is an error says its message, and any other is said as text', () => {
  expect(messageOf(new Error('no hay red'))).toBe('no hay red')
  expect(messageOf('a secas')).toBe('a secas')
  expect(messageOf(42)).toBe('42')
})

test('a command that fails says what it printed on stderr, trimmed', () => {
  expect(failureOf(['enable', 'x'], { exitCode: 1, stdout: 'salida', stderr: '  error\n' })).toBe('error')
})

test('a command that fails with nothing on stderr says what it printed on stdout', () => {
  expect(failureOf(['enable', 'x'], { exitCode: 1, stdout: ' salida\n', stderr: ' \n' })).toBe('salida')
})

test('a command that fails with nothing printed says which one failed and how', () => {
  expect(failureOf(['disable', 'x'], { exitCode: 3, stdout: '', stderr: '' })).toBe(TEXT.commandFailed('disable', 3))
  expect(failureOf([], { exitCode: 2, stdout: '', stderr: '' })).toBe(TEXT.commandFailed(undefined, 2))
})

test('an enabled mod is switched with disable, and a disabled one with enable', () => {
  expect(switchArgs(mod(true))[0]).toBe('disable')
  expect(switchArgs(mod(false))[0]).toBe('enable')
})

test('a mod is switched by its id, in its own scope when the CLI takes it', () => {
  expect(switchArgs(mod(true, 'project'))).toEqual(['disable', 'pet@market', '--scope', 'project'])
  expect(switchArgs(mod(false, 'user'))).toEqual(['enable', 'pet@market', '--scope', 'user'])
  expect(switchArgs(mod(true, 'local'))).toEqual(['disable', 'pet@market', '--scope', 'local'])
})

test('a mod with no scope, or one the CLI does not take, is switched with none', () => {
  expect(switchArgs(mod(true))).toEqual(['disable', 'pet@market'])
  expect(switchArgs(mod(true, 'flag'))).toEqual(['disable', 'pet@market'])
})
