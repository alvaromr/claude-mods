import { expect, test } from 'claude-code/testing'
import type { SessionMessage } from 'claude-code'

import type { Digest, Mode, Note } from '../types'
import { brief, toAsk } from '../hooks/brief'
import type { Ask } from '../hooks/brief'
import { TEXT } from '../hooks/text'

const person = (text: string): SessionMessage => ({ role: 'user', text, toolUses: [] })
const assistant = (text: string, toolUses: SessionMessage['toolUses'] = []): SessionMessage => ({
  role: 'assistant',
  text,
  toolUses,
})

const asked = (
  chosen: Mode,
  messages: SessionMessage[],
  given: { ask?: Ask; target?: Note; digests?: Partial<Record<Mode, Digest>>; notes?: Note[] } = {},
) =>
  brief({
    chosen,
    messages,
    ask: given.ask ?? 'own',
    target: given.target,
    digests: given.digests ?? {},
    notes: given.notes ?? [],
  })

test('a mode that keeps a text reads it and only the conversation past what it covers', () => {
  const messages = [person('uno'), assistant('dos'), person('tres')]

  expect(asked('resumen', messages, { digests: { resumen: { text: '- resumen', covered: 2 } } })).toBe(
    [TEXT.youWrote, '- resumen', '', TEXT.whatsNew, 'PERSONA: tres'].join('\n'),
  )
})

test('a mode with no text yet reads a blank and the whole conversation', () => {
  expect(asked('pendientes', [person('uno'), assistant('dos')])).toBe(
    [TEXT.youWrote, TEXT.blank, '', TEXT.whatsNew, 'PERSONA: uno\n\nASISTENTE: dos'].join('\n'),
  )
})

test('a kept text made again reads as if it had not been written', () => {
  const digests = { resumen: { text: '- resumen', covered: 2 } }

  expect(asked('resumen', [person('uno'), assistant('dos')], { ask: 'redo', digests })).toBe(
    [TEXT.youWrote, TEXT.blank, '', TEXT.whatsNew, 'PERSONA: uno\n\nASISTENTE: dos'].join('\n'),
  )
})

test('a kept text covering more than the conversation holds, which was compacted unseen, reads it whole', () => {
  expect(asked('resumen', [person('uno')], { digests: { resumen: { text: '- resumen', covered: 5 } } })).toBe(
    [TEXT.youWrote, '- resumen', '', TEXT.whatsNew, 'PERSONA: uno'].join('\n'),
  )
})

test('a mode of notes reads its last five notes and the end of the conversation', () => {
  const notes: Note[] = Array.from({ length: 7 }, (_, index) => ({
    n: index + 1,
    text: `nota ${index + 1}`,
    mode: 'asesor',
  }))

  expect(asked('asesor', [person('uno')], { notes: [...notes, { n: 1, text: 'de otro', mode: 'troll' }] })).toBe(
    [TEXT.yourNotes, 'nota 3\nnota 4\nnota 5\nnota 6\nnota 7', '', TEXT.conversationEnd, 'PERSONA: uno'].join('\n'),
  )
})

test('a mode of notes with none yet says so', () => {
  expect(asked('vigilante', [person('uno')])).toBe(
    [TEXT.yourNotes, TEXT.noNotes, '', TEXT.conversationEnd, 'PERSONA: uno'].join('\n'),
  )
})

test('a mode of notes starts from the summary made earlier', () => {
  expect(asked('vigilante', [person('uno')], { digests: { resumen: { text: '- visto', covered: 1 } } })).toBe(
    [TEXT.earlierSummary, '- visto', '', TEXT.yourNotes, TEXT.noNotes, '', TEXT.conversationEnd, 'PERSONA: uno'].join(
      '\n',
    ),
  )
})

test('a note made again is left out of the notes the model reads', () => {
  const first: Note = { n: 1, text: 'primera', mode: 'asesor' }
  const second: Note = { n: 2, text: 'segunda', mode: 'asesor' }

  expect(asked('asesor', [person('uno')], { ask: 'redo', target: second, notes: [first, second] })).toContain(
    `${TEXT.yourNotes}\nprimera\n`,
  )
  expect(asked('asesor', [person('uno')], { ask: 'redo', target: second, notes: [first, second] })).not.toContain(
    'segunda',
  )
})

test('the turn is read whole from the last prompt, and never less than the last 12 messages', () => {
  const long = [
    person('viejo'),
    ...Array.from({ length: 14 }, (_, index) => assistant(`respuesta ${index}`)),
    person('reciente'),
    assistant('fin'),
  ]
  const end = asked('vigilante', long).split(TEXT.conversationEnd)[1] ?? ''

  expect(end).toContain('PERSONA: reciente')
  expect(end).not.toContain('PERSONA: viejo')
  expect(end).toContain('respuesta 4')
  expect(end).not.toContain('respuesta 3\n')

  const turn = [person('inicio'), ...Array.from({ length: 20 }, (_, index) => assistant(`paso ${index}`))]
  const whole = asked('vigilante', turn).split(TEXT.conversationEnd)[1] ?? ''

  expect(whole).toContain('PERSONA: inicio')
  expect(whole).toContain('paso 19')
})

test('with no prompt from the person, the last 12 messages are read', () => {
  const only = Array.from({ length: 14 }, (_, index) => assistant(`paso ${index}`))
  const end = asked('vigilante', only).split(TEXT.conversationEnd)[1] ?? ''

  expect(end).toContain('paso 2')
  expect(end).not.toContain('paso 1\n')
})

test('a message the model reads says who spoke, its text trimmed at 1500 characters, and each tool called with its input', () => {
  const messages = [
    assistant(`  ${'a'.repeat(1600)}  `, [{ tool_use_id: 't1', tool: 'Bash', input: { command: 'ls' } }]),
    assistant('', []),
  ]

  expect(asked('pendientes', messages)).toBe(
    [
      TEXT.youWrote,
      TEXT.blank,
      '',
      TEXT.whatsNew,
      `ASISTENTE: ${'a'.repeat(1500)}…\n${TEXT.toolCall('Bash', '{"command":"ls"}')}`,
    ].join('\n'),
  )
})

test('a message of exactly 1500 characters is read whole', () => {
  expect(asked('pendientes', [assistant('a'.repeat(1500))])).toBe(
    [TEXT.youWrote, TEXT.blank, '', TEXT.whatsNew, `ASISTENTE: ${'a'.repeat(1500)}`].join('\n'),
  )
})

test('a kept text covering the whole conversation reads nothing new', () => {
  expect(
    asked('resumen', [person('uno'), assistant('dos')], { digests: { resumen: { text: '- resumen', covered: 2 } } }),
  ).toBe([TEXT.youWrote, '- resumen', '', TEXT.whatsNew, ''].join('\n'))
})

test('a turn starts at the person’s last prompt that says something, not at a blank one', () => {
  const long = [
    person('real'),
    ...Array.from({ length: 14 }, (_, index) => assistant(`respuesta ${index}`)),
    person('   '),
    assistant('fin'),
  ]

  expect(asked('vigilante', long).split(TEXT.conversationEnd)[1]).toContain('PERSONA: real')
})

test('a tool call that failed says so, with the error trimmed at 300 characters, or without one', () => {
  const failing = [
    assistant('', [
      { tool_use_id: 't1', tool: 'Bash', input: {}, isError: true, text: ` ${'e'.repeat(400)} ` },
      { tool_use_id: 't2', tool: 'Read', input: {}, isError: true },
      { tool_use_id: 't3', tool: 'Edit', input: {}, text: 'no error' },
    ]),
  ]

  expect(asked('pendientes', failing)).toBe(
    [
      TEXT.youWrote,
      TEXT.blank,
      '',
      TEXT.whatsNew,
      `ASISTENTE: ${TEXT.toolCall('Bash', '{}')}${TEXT.failedWith(`${'e'.repeat(300)}…`)}\n${TEXT.toolCall('Read', '{}')}${TEXT.failed}\n${TEXT.toolCall('Edit', '{}')}`,
    ].join('\n'),
  )
})

test('a tool input longer than 200 characters is cut', () => {
  const long = assistant('', [{ tool_use_id: 't1', tool: 'Write', input: { content: 'x'.repeat(300) } }])
  const [, call = ''] = asked('pendientes', [long]).split('ASISTENTE: ')

  expect(call).toBe(TEXT.toolCall('Write', `${JSON.stringify({ content: 'x'.repeat(300) }).slice(0, 200)}…`))
})

test('a mode that keeps a text, turned on, asks for it only when it lacks messages', () => {
  expect(toAsk('resumen', {}, 4)).toEqual([{ mode: 'resumen', ask: 'own' }])
  expect(toAsk('pendientes', { pendientes: { text: '- a', covered: 3 } }, 4)).toEqual([
    { mode: 'pendientes', ask: 'own' },
  ])
  expect(toAsk('resumen', { resumen: { text: '- a', covered: 4 } }, 4)).toEqual([])
})

test('a mode of notes, turned on, asks for the summary first when it lacks messages, then comments', () => {
  expect(toAsk('asesor', {}, 4)).toEqual([
    { mode: 'resumen', ask: 'summary' },
    { mode: 'asesor', ask: 'own' },
  ])
  expect(toAsk('troll', { resumen: { text: '- a', covered: 4 } }, 4)).toEqual([{ mode: 'troll', ask: 'own' }])
})
