import { expect, test } from 'claude-code/testing'

import { completes, isFull, numbered, typed } from '../hooks/prompts'

/** What `typed` keeps of a prompt; nothing for one it leaves out. */
const textOf = (e: Parameters<typeof typed>[0]) => {
  const heard = typed(e)

  return 'text' in heard ? heard.text : undefined
}

test('a prompt left out says why', () => {
  const why = (prompt: string, source?: string) => typed({ prompt, source })

  expect(why('Compara las facturas de luz', 'hook')).toEqual({ dropped: 'not typed by the person' })
  expect(why('/clear')).toEqual({ dropped: 'a slash command' })
  expect(why('<system-reminder>algo que ocurrió</system-reminder>')).toEqual({ dropped: "Claude Code's own text" })
  expect(why('You have 1 orchestration message. Run `orca orchestration check`.')).toEqual({
    dropped: 'a notice of Orca',
  })
  expect(why('sigue')).toEqual({ dropped: 'too short to say anything' })
  expect(why('[Image #1]')).toEqual({ dropped: 'too short to say anything' })
  expect(why('Compara las facturas de luz')).toEqual({ text: 'Compara las facturas de luz' })
})

test('what the person typed is kept, its spaces folded and trimmed', () => {
  expect(textOf({ prompt: '  Compara   las facturas\n\nde luz  ' })).toBe('Compara las facturas de luz')
  expect(textOf({ prompt: 'Compara las facturas de luz', source: 'user' })).toBe('Compara las facturas de luz')
})

test('the marks of what was attached are not words', () => {
  expect(textOf({ prompt: 'Mira esto [Image #1] y también [Pasted text #2 +40 lines] por favor' })).toBe(
    'Mira esto y también por favor',
  )
  // Only the marks: nothing is left to say anything.
  expect(textOf({ prompt: '[Image #1] [Pasted text #2 +4 lines]' })).toBeUndefined()
})

test('a prompt nobody typed is nothing', () => {
  expect(textOf({ prompt: 'Compara las facturas de luz', source: 'hook' })).toBeUndefined()
})

test('a prompt too short says nothing of the session, one just long enough does', () => {
  expect(textOf({ prompt: 'sí, adelante' })).toBe('sí, adelante')
  expect(textOf({ prompt: 'sí, adelant' })).toBeUndefined()
  expect(textOf({ prompt: 'sigue' })).toBeUndefined()
})

test('a long prompt is cut to an excerpt of 400 characters', () => {
  const text = textOf({ prompt: 'a'.repeat(1000) })

  expect(text).toBe('a'.repeat(400))
})

test('a slash command is nothing, a path that starts with a slash is a prompt', () => {
  expect(textOf({ prompt: '/clear' })).toBeUndefined()
  expect(textOf({ prompt: '/plugin:command with its arguments' })).toBeUndefined()
  expect(textOf({ prompt: '/ui-mods:declutter on' })).toBeUndefined()
  expect(textOf({ prompt: '/usr/local/bin/tool no arranca en este equipo' })).toBe(
    '/usr/local/bin/tool no arranca en este equipo',
  )
  expect(textOf({ prompt: '/etc/hosts no resuelve' })).toBe('/etc/hosts no resuelve')
})

test('what the engine wraps around a command, a shell line or an injection is nothing', () => {
  for (const tag of ['command-name', 'local-command-stdout', 'bash-input', 'task-notification', 'system-reminder']) {
    expect(textOf({ prompt: `<${tag}>algo que ocurrió en la sesión</${tag}>` }), tag).toBeUndefined()
  }

  expect(textOf({ prompt: '<div> no es un envoltorio del motor</div>' })).toBe(
    '<div> no es un envoltorio del motor</div>',
  )
})

// Orca's own instructions to a worker, longer than an excerpt, before its task.
const PREAMBLE = `You are working inside Orca, a multi-agent IDE.\n${'Orca says how to report back.\n'.repeat(20)}`

test('Orca’s brief to a worker is its task alone, typed or pasted', () => {
  expect(textOf({ prompt: `${PREAMBLE}\n=== TASK ===\nCompara las facturas\nde luz\n` })).toBe(
    'Compara las facturas de luz',
  )
  expect(
    textOf({
      prompt:
        'Please carry out this task from my Orca coordinator by following the brief I pasted below.\n\n' +
        `<pasted_content id="1b1a">\n${PREAMBLE}\n=== TASK ===\nCompara las facturas de luz\n</pasted_content id="1b1a">\n`,
    }),
  ).toBe('Compara las facturas de luz')
})

test('only a line of its own marks the task, not the marker quoted in it', () => {
  expect(textOf({ prompt: `${PREAMBLE}\n=== TASK ===\nTitle what follows \`=== TASK ===\` alone` })).toBe(
    'Title what follows `=== TASK ===` alone',
  )
  expect(textOf({ prompt: 'Explica qué hace el marcador === TASK === de Orca' })).toBe(
    'Explica qué hace el marcador === TASK === de Orca',
  )
})

test('what Claude Code wraps around a paste is not words', () => {
  expect(
    textOf({ prompt: '\n\n<pasted_content id="ab">\nUn informe sobre facturas\n</pasted_content id="ab">\n' }),
  ).toBe('Un informe sobre facturas')
})

test('what Orca writes in a worker’s prompt box is nothing', () => {
  for (const notice of [
    '\nYou have 1 orchestration message. Run `orca orchestration check --terminal term_e4300a30`.',
    'You have 2 orchestration messages. Run `orca orchestration check`.',
    '──── From: RUN:RUN_CC31CE133F6A (run:run_cc31) (status) ────\nSubject: done',
    '[Orca: Item 16 is In progress but nothing is running for it: start the work]',
  ]) {
    expect(textOf({ prompt: notice }), notice).toBeUndefined()
  }

  expect(textOf({ prompt: 'Why do I have 2 orchestration messages pending?' })).toBe(
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
