import { expect, test } from 'claude-code/testing'

import { completes, isFull, numbered, typed } from '../hooks/prompts'

test('what the person typed is kept, its spaces folded and trimmed', () => {
  expect(typed({ prompt: '  Compara   las facturas\n\nde luz  ' })).toBe('Compara las facturas de luz')
  expect(typed({ prompt: 'Compara las facturas de luz', source: 'user' })).toBe('Compara las facturas de luz')
})

test('the marks of what was attached are not words', () => {
  expect(typed({ prompt: 'Mira esto [Image #1] y también [Pasted text #2 +40 lines] por favor' })).toBe(
    'Mira esto y también por favor',
  )
  // Only the marks: nothing is left to say anything.
  expect(typed({ prompt: '[Image #1] [Pasted text #2 +4 lines]' })).toBeUndefined()
})

test('a prompt nobody typed is nothing', () => {
  expect(typed({ prompt: 'Compara las facturas de luz', source: 'hook' })).toBeUndefined()
})

test('a prompt too short says nothing of the session, one just long enough does', () => {
  expect(typed({ prompt: 'sí, adelante' })).toBe('sí, adelante')
  expect(typed({ prompt: 'sí, adelant' })).toBeUndefined()
  expect(typed({ prompt: 'sigue' })).toBeUndefined()
})

test('a long prompt is cut to an excerpt of 400 characters', () => {
  const text = typed({ prompt: 'a'.repeat(1000) })

  expect(text).toBe('a'.repeat(400))
})

test('a slash command is nothing, a path that starts with a slash is a prompt', () => {
  expect(typed({ prompt: '/clear' })).toBeUndefined()
  expect(typed({ prompt: '/plugin:command with its arguments' })).toBeUndefined()
  expect(typed({ prompt: '/ui-mods:declutter on' })).toBeUndefined()
  expect(typed({ prompt: '/usr/local/bin/tool no arranca en este equipo' })).toBe(
    '/usr/local/bin/tool no arranca en este equipo',
  )
  expect(typed({ prompt: '/etc/hosts no resuelve' })).toBe('/etc/hosts no resuelve')
})

test('what the engine wraps around a command, a shell line or an injection is nothing', () => {
  for (const tag of ['command-name', 'local-command-stdout', 'bash-input', 'task-notification', 'system-reminder']) {
    expect(typed({ prompt: `<${tag}>algo que ocurrió en la sesión</${tag}>` }), tag).toBeUndefined()
  }

  expect(typed({ prompt: '<div> no es un envoltorio del motor</div>' })).toBe(
    '<div> no es un envoltorio del motor</div>',
  )
})

test('a title is made again, to stay, at the third prompt', () => {
  expect([0, 1, 2, 3, 4].map(completes)).toEqual([false, false, false, true, false])
})

test('prompts after the third are not kept', () => {
  expect([0, 1, 2, 3, 4].map(isFull)).toEqual([false, false, false, true, true])
})

test('the prompts said are numbered one to a line', () => {
  expect(numbered(['uno', 'dos', 'tres'])).toBe('1. uno\n2. dos\n3. tres')
  expect(numbered(['uno'])).toBe('1. uno')
  expect(numbered([])).toBe('')
})
