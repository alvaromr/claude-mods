import { expect, test } from 'claude-code/testing'

import { listedCommands, outwardOf } from '../hooks/outward'

test('the commands listed are each split into their words', () => {
  expect(listedCommands('chat send, chat react')).toEqual([
    ['chat', 'send'],
    ['chat', 'react'],
  ])
  expect(listedCommands('x,y')).toEqual([['x'], ['y']])
})

test('the commands listed leave out blanks and empty entries', () => {
  expect(listedCommands(' a  b ,, c ,')).toEqual([['a', 'b'], ['c']])
  expect(listedCommands('')).toEqual([])
  expect(listedCommands(' , ')).toEqual([])
})

test('a Bash or Monitor command that sends is named', () => {
  expect(outwardOf('Bash', { command: 'git push' }, [])).toBe('git push')
  expect(outwardOf('Monitor', { command: 'git push', description: 'd', timeout_ms: 1 }, [])).toBe('git push')
  expect(outwardOf('Bash', { command: 'chat send x' }, [['chat', 'send']])).toBe('chat send')
})

test('a Bash command that stays here sends nothing', () => {
  expect(outwardOf('Bash', { command: 'git status' }, [])).toBeUndefined()
})

test('a call with no command, or one that is no text, sends nothing', () => {
  expect(outwardOf('Bash', {}, [])).toBeUndefined()
  expect(outwardOf('Bash', undefined, [])).toBeUndefined()
  expect(outwardOf('Bash', null, [])).toBeUndefined()
  expect(outwardOf('Bash', { command: 3 }, [])).toBeUndefined()
})

test('a tool other than Bash, Monitor and an MCP one sends nothing, whatever its input', () => {
  expect(outwardOf('Read', { command: 'git push' }, [])).toBeUndefined()
  expect(outwardOf('Write', { command: 'git push' }, [])).toBeUndefined()
})

test('an MCP tool is read by its name, never by its input', () => {
  expect(outwardOf('mcp__a__send_message', {}, [])).toBe('mcp__a__send_message')
  expect(outwardOf('mcp__a__get_thing', { command: 'git push' }, [])).toBeUndefined()
})
