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

// Orca's own instructions to a worker, longer than an excerpt, before its task.
const PREAMBLE = `You are working inside Orca, a multi-agent IDE.\n${'Orca says how to report back.\n'.repeat(20)}`

test('Orca’s brief to a worker is its task alone, typed or pasted', () => {
  expect(typed({ prompt: `${PREAMBLE}\n=== TASK ===\nCompara las facturas\nde luz\n` })).toBe(
    'Compara las facturas de luz',
  )
  expect(
    typed({
      prompt:
        'Please carry out this task from my Orca coordinator by following the brief I pasted below.\n\n' +
        `<pasted_content id="1b1a">\n${PREAMBLE}\n=== TASK ===\nCompara las facturas de luz\n</pasted_content id="1b1a">\n`,
    }),
  ).toBe('Compara las facturas de luz')
})

test('only a line of its own marks the task, not the marker quoted in it', () => {
  expect(typed({ prompt: `${PREAMBLE}\n=== TASK ===\nTitle what follows \`=== TASK ===\` alone` })).toBe(
    'Title what follows `=== TASK ===` alone',
  )
  expect(typed({ prompt: 'Explica qué hace el marcador === TASK === de Orca' })).toBe(
    'Explica qué hace el marcador === TASK === de Orca',
  )
})

test('what Claude Code wraps around a paste is not words', () => {
  expect(
    typed({ prompt: '\n\n<pasted_content id="ab">\nUn informe sobre facturas\n</pasted_content id="ab">\n' }),
  ).toBe('Un informe sobre facturas')
})

test('what Orca writes in a worker’s prompt box is nothing', () => {
  for (const notice of [
    '\nYou have 1 orchestration message. Run `orca orchestration check --terminal term_e4300a30`.',
    'You have 2 orchestration messages. Run `orca orchestration check`.',
    '──── From: RUN:RUN_CC31CE133F6A (run:run_cc31) (status) ────\nSubject: done',
    '[Orca: Item 16 is In progress but nothing is running for it: start the work]',
  ]) {
    expect(typed({ prompt: notice }), notice).toBeUndefined()
  }

  expect(typed({ prompt: 'Why do I have 2 orchestration messages pending?' })).toBe(
    'Why do I have 2 orchestration messages pending?',
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
