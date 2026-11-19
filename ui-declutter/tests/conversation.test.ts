import { expect, test } from 'claude-code/testing'

import { arrivalOf, idOf, isGoneFrom, reasonOf, scan, unread } from '../hooks/conversation'
import type { Span } from '../hooks/conversation'
import { TEXT } from '../hooks/text'

type Block = { type: string; [field: string]: unknown }

const use = (id: string, name: string, input: unknown = {}) => ({ type: 'tool_use', id, name, input })
const assistant = (...content: Block[]) => ({ role: 'assistant' as const, content })
const result = (id: string, content: unknown = 'ok', isError = false) => ({
  type: 'tool_result',
  tool_use_id: id,
  content,
  is_error: isError,
})
const user = (...content: Block[]) => ({ role: 'user' as const, content })
const said = (text: string) => ({ type: 'text', text })
const notice = (task: string, status: string, summary = 'Done') =>
  `<system-reminder><task-notification><task-id>${task}</task-id><status>${status}</status><summary>${summary}</summary></task-notification></system-reminder>`

const idsOf = (span: Span | undefined) => span?.items.map(idOf)

test('calls and edits with nothing else between them are one span, found by the id of each', () => {
  const { spans } = scan([
    user(said('go')),
    assistant(use('a', 'Read'), use('b', 'Edit', { file_path: '/x.ts' }), use('c', 'Bash')),
    user(result('a'), result('b'), result('c')),
  ])

  expect(idsOf(spans.get('a'))).toEqual(['a', 'b', 'c'])
  expect(spans.get('b')).toBe(spans.get('a'))
  expect(spans.get('c')?.first).toBe('a')
})

test("a prompt, the model's text or a tool that asks ends a span", () => {
  const { spans } = scan([
    assistant(use('a', 'Read')),
    user(result('a')),
    assistant(said('looking'), use('b', 'Read'), use('q', 'AskUserQuestion'), use('c', 'Read')),
    user(result('b'), result('q'), result('c')),
    user(said('next')),
    assistant(use('d', 'Read')),
    user(result('d')),
  ])

  expect(['a', 'b', 'c', 'd'].map(id => spans.get(id)?.first)).toEqual(['a', 'b', 'c', 'd'])
  expect(spans.has('q')).toBe(false)
})

test('a call with no result yet is running, one with an error result errored', () => {
  const { spans } = scan([assistant(use('a', 'Read'), use('b', 'Bash')), user(result('b', 'boom', true))])
  const [first, second] = spans.get('a')?.items ?? []

  expect(first).toMatchObject({ kind: 'calls', call: { tool_use_id: 'a', isRunning: true, isErrored: false } })
  expect(second).toMatchObject({ kind: 'calls', call: { tool_use_id: 'b', isRunning: false, isErrored: true } })
})

test('the failed results an interruption follows are the calls it stopped', () => {
  const { spans } = scan([
    assistant(use('a', 'Bash'), use('b', 'Bash')),
    user(result('a', 'cut', true), result('b', 'fine')),
    user(said('[Request interrupted by user for tool use]')),
  ])

  expect(spans.get('a')?.items.map(item => (item.kind === 'calls' ? item.call.isInterrupted : undefined))).toEqual([
    true,
    false,
  ])
})

test('an edit that failed tells why in a word, one that worked tells none', () => {
  const { spans } = scan([
    assistant(use('a', 'Edit', { file_path: '/x.ts' }), use('b', 'Write', { file_path: '/y.ts' })),
    user(result('a', '<tool_use_error>File has not been read yet</tool_use_error>', true), result('b')),
  ])

  expect(spans.get('a')?.items).toEqual([
    { kind: 'edits', edit: { id: 'a', path: '/x.ts', failure: TEXT.reasons.notRead } },
    { kind: 'edits', edit: { id: 'b', path: '/y.ts' } },
  ])
})

test('each result is kept as text, the tools a search loaded by name, and an image or a PDF as what it took in', () => {
  const { outputs, pictures } = scan([
    assistant(use('a', 'Read'), use('b', 'Read'), use('c', 'ToolSearch'), use('d', 'Read')),
    user(
      result('a', [
        { type: 'text', text: 'one' },
        { type: 'text', text: 'two' },
      ]),
      result('b', [{ type: 'image', source: {} }]),
      result('c', [{ type: 'tool_reference', tool_name: 'mcp__x__y' }]),
      result('d', [{ type: 'document', source: {} }]),
    ),
  ])

  expect(outputs.get('a')).toBe('one\ntwo')
  expect(outputs.get('c')).toBe('mcp__x__y')
  expect([...pictures]).toEqual([
    ['b', 'image'],
    ['d', 'PDF'],
  ])
})

test('a web-fetch agent is a WebFetch call of the span, its id reported', () => {
  const { spans, webFetches } = scan([
    assistant(use('w', 'Agent', { subagent_type: 'web-fetch' }), use('x', 'Agent', { subagent_type: 'Explore' })),
    user(result('w'), result('x')),
  ])

  expect(spans.get('w')?.items).toMatchObject([{ kind: 'calls', call: { tool: 'WebFetch' } }])
  expect(spans.has('x')).toBe(false)
  expect(webFetches).toEqual(['w'])
})

test("the notice that a task ended, inside the engine's reminder, is a call of the span, its result how it ended", () => {
  const { spans, outputs } = scan([
    assistant(use('a', 'Bash')),
    user(result('a')),
    user(said(notice('t1', 'completed', 'Build done'))),
    assistant(use('b', 'Read')),
    user(result('b')),
  ])

  expect(spans.get('task:t1')).toBe(spans.get('a'))
  expect(spans.get('b')).toBe(spans.get('a'))
  expect(spans.get('task:t1')?.items.map(item => (item.kind === 'calls' ? item.call : undefined))).toMatchObject([
    { tool_use_id: 'a' },
    { tool_use_id: 'task:t1', tool: 'Notification', input: { summary: 'Build done' } },
    { tool_use_id: 'b' },
  ])
  expect(outputs.get('task:t1')).toBe('completed')
})

test('a task that notifies more than once, or has not ended, or is quoted in a prompt, has no notice', () => {
  const { spans } = scan([
    user(said(notice('twice', 'completed') + notice('twice', 'completed'))),
    user(said(notice('running', 'running'))),
    user(said('<task-notification><task-id>quoted</task-id><status>completed</status></task-notification>')),
  ])

  expect([...spans.keys()]).toEqual([])
})

test("a failure is told in a word the engine's text matches, else by its own text cut to fit", () => {
  expect(reasonOf("The user doesn't want to proceed")).toBe(TEXT.reasons.rejected)
  expect(reasonOf('Permission denied')).toBe(TEXT.reasons.denied)
  expect(reasonOf('String to replace not found in file')).toBe(TEXT.reasons.notFound)
  expect(reasonOf('Found 3 matches of the string')).toBe(TEXT.reasons.severalMatches)
  expect(reasonOf('<tool_use_error>Disk   is\nfull</tool_use_error>')).toBe('Disk is full')
  expect(reasonOf('x'.repeat(60))).toBe(`${'x'.repeat(39)}…`)
  expect(reasonOf('')).toBe(TEXT.reasons.unknown)
})

test('each failure the engine words is told in its own word, and one only alike is cut as its own text', () => {
  const worded = [
    ['Hook: no verdict', TEXT.reasons.denied],
    ['File has not been read yet', TEXT.reasons.notRead],
    ['The edit was rejected', TEXT.reasons.rejected],
    ['old_string not found in file', TEXT.reasons.notFound],
    ['File has been modified since read', TEXT.reasons.changedSinceRead],
    ['File does not exist', TEXT.reasons.missing],
    ['No changes to make', TEXT.reasons.noChanges],
    ['Found 2 matches of the string', TEXT.reasons.severalMatches],
  ]
  const alike = [
    'File has not been read',
    'Command not found',
    'File modified',
    'Directory exists',
    'No changes were found',
    'Found 1 match',
  ]

  expect(worded.map(([text]) => reasonOf(text ?? ''))).toEqual(worded.map(([, reason]) => reason))
  expect(alike.map(reasonOf)).toEqual(alike)
})

test('only a text that starts as the engine does is the interruption, and only the failures since the model spoke are cut', () => {
  const { spans } = scan([
    assistant(use('a', 'Bash')),
    user(result('a', 'boom', true)),
    user(said('I saw «[Request interrupted by user» earlier')),
    assistant(use('b', 'Bash')),
    user(result('b', 'boom', true)),
    assistant(use('c', 'Bash')),
    user(result('c', 'fine')),
    user(said('[Request interrupted by user]')),
  ])
  const stopped = (id: string) =>
    spans
      .get(id)
      ?.items.flatMap(item => (item.kind === 'calls' && item.call.tool_use_id === id ? [item.call.isInterrupted] : []))

  expect(['a', 'b', 'c'].map(stopped)).toEqual([[false], [false], [false]])
})

test('a notice that names no task is no call', () => {
  expect([...scan([user(said(notice('', 'completed')))]).spans.keys()]).toEqual([])
})

test('a conversation that could not be read holds nothing and says it was not read', () => {
  const { isRead, spans, outputs, pictures, webFetches } = unread()

  expect(isRead).toBe(false)
  expect([spans.size, outputs.size, pictures.size, webFetches.length]).toEqual([0, 0, 0, 0])
  expect(unread().spans).not.toBe(unread().spans)
})

test('a finished row the conversation holds no longer is gone, but only if it was read', () => {
  const read = scan([assistant(use('a', 'Read')), user(result('a'))])

  expect(read.isRead).toBe(true)
  expect(isGoneFrom(read, 'a', false)).toBe(false)
  expect(isGoneFrom(read, 'lost', false)).toBe(true)
  expect(isGoneFrom(read, 'lost', true)).toBe(false)
  expect(isGoneFrom(unread(), 'lost', false)).toBe(false)
})

test('a new message brings the ids of the results it holds, and tells if it may start or join a span', () => {
  expect(
    arrivalOf(
      [{ type: 'tool_result', tool_use_id: 'a' }, { type: 'text' }, { type: 'tool_result', tool_use_id: 7 }],
      'user',
    ),
  ).toEqual({
    resultIds: ['a', '7'],
    isCall: true,
  })
  expect(arrivalOf([{ type: 'tool_use' }], 'assistant')).toEqual({ resultIds: [], isCall: true })
  expect(arrivalOf([{ type: 'text' }], 'user')).toEqual({ resultIds: [], isCall: false })
  expect(arrivalOf('a prompt', 'user')).toEqual({ resultIds: [], isCall: false })
})

test("a task's end notice may join a span, with or without a tool in the message", () => {
  expect(arrivalOf('<task-notification>', 'task-notification')).toEqual({ resultIds: [], isCall: true })
  expect(arrivalOf([{ type: 'text' }], 'task-notification').isCall).toBe(true)
})
