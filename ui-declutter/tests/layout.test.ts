import { expect, test } from 'claude-code/testing'
import type { ToolGroupCall } from 'claude-code'

import type { Timing } from '../types'
import type { Item } from '../hooks/conversation'
import {
  callGaps,
  deniedOf,
  diffRows,
  entriesOf,
  failedOf,
  fileRowOf,
  filesIn,
  filesOf,
  foldLabel,
  glyphOf,
  isTall,
  isTallSpan,
  labelOf,
  layoutOf,
  restLabel,
  resultLine,
  resultOf,
  statusOf,
  timesOf,
} from '../hooks/layout'
import type { FileLine } from '../hooks/layout'
import type { Hunk } from '../hooks/outcome'
import type { EditLine } from '../hooks/span'
import { rowsOf } from '../hooks/timeline'
import type { Row } from '../hooks/timeline'

const call = (id: string, flags: Partial<ToolGroupCall> = {}): ToolGroupCall => ({
  tool_use_id: id,
  tool: 'Bash',
  input: { command: 'ls' },
  isRunning: false,
  isErrored: false,
  isInterrupted: false,
  ...flags,
})
const hunk = (...lines: string[]): Hunk => ({ oldStart: 1, oldLines: 0, newStart: 1, newLines: lines.length, lines })
const edit = (
  id: string,
  path: string,
  hunks: Hunk[] | null = [hunk('+a')],
  more: Partial<EditLine> = {},
): EditLine => ({
  id,
  path,
  hunks,
  isChange: false,
  ...more,
})
const rows = (...calls: ToolGroupCall[]) =>
  rowsOf(
    calls,
    calls.map(() => ({ ranMs: 500 })),
  )
const asCalls = (...ids: string[]): Item[] => ids.map(id => ({ kind: 'calls', call: call(id) }))
const asEdits = (...ids: string[]): Item[] => ids.map(id => ({ kind: 'edits', edit: { id, path: '' } }))
const file = (key: string, hunks: Hunk[] = []): FileLine => ({
  kind: 'file',
  key,
  button: key,
  path: key,
  shown: key,
  hunks,
  isKnown: true,
  ids: [],
})
const group = (...some: [Row, ...Row[]]) => some
const row = (made: ToolGroupCall, timing: Timing | null = { ranMs: 500 }): Row => {
  const [only] = rowsOf([made], [timing ?? undefined])

  if (only === undefined) {
    throw new Error('One call, one row')
  }

  return only
}

test('rows are tall past fifteen', () => {
  expect([15, 16].map(isTall)).toEqual([false, true])
})

test('the edits that changed something are grouped by file, each with all its hunks, known only if all are', () => {
  expect(
    filesOf(
      [edit('a', '/repo/src/x.ts', [hunk('+1')]), edit('b', '/repo/y.ts'), edit('c', '/repo/src/x.ts', null)],
      '/repo/',
    ),
  ).toEqual([
    { path: '/repo/src/x.ts', shown: 'src/x.ts', hunks: [hunk('+1')], isKnown: false },
    { path: '/repo/y.ts', shown: 'y.ts', hunks: [hunk('+a')], isKnown: true },
  ])
})

test('calls alike one after another, ended well, are one row', () => {
  const some = rows(call('a'), call('b'), call('c', { input: { command: 'pwd' } }))
  const entries = entriesOf(asCalls('a', 'b', 'c'), some, [], '/repo/')

  expect(
    entries.map(entry => (entry.kind === 'calls' ? entry.rows.map(row => row.call.tool_use_id) : undefined)),
  ).toEqual([['a', 'b'], ['c']])
})

test('a call that failed, was refused or still runs is a row of its own', () => {
  const some = rows(call('a'), call('b', { isErrored: true }), call('c'), call('d', { isRunning: true }), call('e'))

  expect(entriesOf(asCalls('a', 'b', 'c', 'd', 'e'), some, [], '/repo/')).toHaveLength(5)
})

test('a call refused or stopped, before or after calls alike, is a row of its own, and a tool of its own is another row', () => {
  const plain = { ranMs: 500 }
  const refused = { deny: 'no' }
  const stopped = call('b', { isInterrupted: true })

  expect(entriesOf(asCalls('a', 'b'), rowsOf([call('a'), call('b')], [plain, refused]), [], '/repo/')).toHaveLength(2)
  expect(entriesOf(asCalls('a', 'b'), rowsOf([call('a'), call('b')], [refused, plain]), [], '/repo/')).toHaveLength(2)
  expect(entriesOf(asCalls('a', 'b'), rowsOf([call('a'), stopped], [plain, plain]), [], '/repo/')).toHaveLength(2)
  expect(entriesOf(asCalls('b', 'a'), rowsOf([stopped, call('a')], [plain, plain]), [], '/repo/')).toHaveLength(2)

  const reads = rows(call('a'), call('b', { tool: 'Read' }))

  expect(entriesOf(asCalls('a', 'b'), reads, [], '/repo/')).toHaveLength(2)
})

test('a file a command changed, or an edit that failed, is no row an edit of the same file joins', () => {
  // The command is not shown, its files are.
  const changed = entriesOf(
    [...asCalls('c'), ...asEdits('b')],
    [],
    [edit('c', '/repo/f.ts', [hunk('+1')], { isChange: true }), edit('b', '/repo/f.ts')],
    '/repo/',
  )
  const afterEdit = entriesOf(
    [...asEdits('a'), ...asCalls('c')],
    [],
    [edit('a', '/repo/f.ts'), edit('c', '/repo/f.ts', [hunk('+1')], { isChange: true })],
    '/repo/',
  )
  const afterFailure = entriesOf(
    asEdits('a', 'b'),
    [],
    [edit('a', '/repo/f.ts', null, { failure: 'rechazado' }), edit('b', '/repo/f.ts')],
    '/repo/',
  )

  expect(changed.map(entry => (entry.kind === 'file' ? entry.ids : entry.kind))).toEqual([[], ['b']])
  expect(afterEdit.map(entry => (entry.kind === 'file' ? entry.ids : entry.kind))).toEqual([['a'], []])
  expect(afterFailure).toHaveLength(2)
})

test('a row of edits is known only if the hunks of every one are', () => {
  const [entry] = entriesOf(
    asEdits('a', 'b'),
    [],
    [edit('a', '/repo/f.ts', [hunk('+1')]), edit('b', '/repo/f.ts', null)],
    '/repo/',
  )

  expect(entry).toMatchObject({ kind: 'file', ids: ['a', 'b'], isKnown: false })
})

test('edits of one file one after another are one row, their changes summed, the edits it draws the time of listed', () => {
  const entries = entriesOf(
    asEdits('a', 'b'),
    [],
    [edit('a', '/repo/f.ts', [hunk('+1')]), edit('b', '/repo/f.ts', [hunk('+2', '-3')])],
    '/repo/',
  )

  expect(entries).toEqual([
    {
      kind: 'file',
      key: 'file:a:/repo/f.ts',
      button: 'file-a-0',
      path: '/repo/f.ts',
      shown: 'f.ts',
      hunks: [hunk('+1'), hunk('+2', '-3')],
      isKnown: true,
      failure: undefined,
      ids: ['a', 'b'],
    },
  ])
})

test('another row between edits of a file, or an edit that failed, starts a new row', () => {
  const between = entriesOf(
    [...asEdits('a'), ...asCalls('c'), ...asEdits('b')],
    rows(call('c')),
    [edit('a', '/repo/f.ts'), edit('b', '/repo/f.ts')],
    '/repo/',
  )
  const failed = entriesOf(
    asEdits('a', 'b'),
    [],
    [edit('a', '/repo/f.ts'), edit('b', '/repo/f.ts', null, { failure: 'rechazado' })],
    '/repo/',
  )

  expect(between.map(entry => entry.kind)).toEqual(['file', 'calls', 'file'])
  expect(failed.map(entry => (entry.kind === 'file' ? entry.failure : undefined))).toEqual([undefined, 'rechazado'])
})

test('the files a command changed come after it, each its own row with no edit to time', () => {
  const entries = entriesOf(
    asCalls('c'),
    rows(call('c')),
    [
      edit('c', '/repo/a.ts', [hunk('+1')], { isChange: true }),
      edit('c', '/repo/b.ts', [hunk('+1')], { isChange: true }),
    ],
    '/repo/',
  )

  expect(entries.map(entry => (entry.kind === 'file' ? [entry.button, entry.ids] : entry.kind))).toEqual([
    'calls',
    ['file-c-0', []],
    ['file-c-1', []],
  ])
})

test('the rows have a bar, a label and a status on a wide screen', () => {
  expect(layoutOf(100, true, [], new Map())).toEqual({
    cells: 30,
    hasBars: true,
    hasEditBars: false,
    labelRoom: 49,
    statusRoom: 9,
    rowWidth: 92,
    noteRoom: 46,
  })
})

test('a narrow screen draws the bar shorter, and one too narrow for it beside the label draws none', () => {
  expect(layoutOf(40, true, [], new Map())).toMatchObject({ cells: 10, hasBars: true })
  expect(layoutOf(36, true, [], new Map())).toMatchObject({ cells: 0, hasBars: false, labelRoom: 16, rowWidth: 28 })
  expect(layoutOf(10, true, [], new Map())).toMatchObject({ labelRoom: 8 })
})

test('an untimed span has no bars', () => {
  expect(layoutOf(100, false, [], new Map())).toMatchObject({ cells: 30, hasBars: false, rowWidth: 1 + 1 + 49 + 1 + 9 })
})

test('a file row draws a bar when the span is timed, an edit has a time and another row is there to set it against', () => {
  const files = [{ ...file('a'), ids: ['a'] }, file('b')]
  const times = new Map([['a', { startedAt: 5 }]])

  expect(layoutOf(100, true, files, times).hasEditBars).toBe(true)
  expect(layoutOf(100, true, files.slice(0, 1), times).hasEditBars).toBe(false)
  expect(layoutOf(100, true, files, new Map([['a', {}]])).hasEditBars).toBe(false)
  expect(layoutOf(100, false, files, times).hasEditBars).toBe(false)
})

test('a span is tall by its rows, the lines of the calls opened and the diffs of the files opened', () => {
  const some = rows(...Array.from({ length: 15 }, (_, n) => call(`c${n}`)))
  const outputs = new Map([['c0', 'a\nb\nc']])
  const diff = file('f', [hunk('+1', '+2')])

  expect(isTallSpan(some, [], outputs, [])).toBe(false)
  expect(isTallSpan(some, [diff], outputs, [])).toBe(true)
  expect(isTallSpan(some.slice(0, 9), [], outputs, ['row:c0'])).toBe(false)
  expect(isTallSpan(some.slice(0, 9), [], outputs, ['row:c0', 'row:c1'])).toBe(true)
  expect(isTallSpan(some.slice(0, 12), [diff], outputs, [])).toBe(false)
  expect(isTallSpan(some.slice(0, 12), [diff], outputs, ['f'])).toBe(true)
})

test('a call opened counts at most ten lines of its result, or all of it once asked', () => {
  const some = rows(call('a'))
  const outputs = new Map([['a', Array.from({ length: 30 }, () => 'x').join('\n')]])

  expect(isTallSpan(some, [], outputs, ['row:a'])).toBe(false)
  expect(isTallSpan(some, [], outputs, ['row:a', 'full:a'])).toBe(true)
})

test('a call that is refused counts twice', () => {
  const refused = rowsOf(
    Array.from({ length: 8 }, (_, n) => call(`c${n}`, { isErrored: true })),
    Array.from({ length: 8 }, () => ({ deny: 'no' })),
  )

  expect(isTallSpan(refused, [], new Map(), [])).toBe(true)
  expect(isTallSpan(refused.slice(0, 7), [], new Map(), [])).toBe(false)
})

test("a call's status is the time it took, or the word for why it did not end well", () => {
  expect(statusOf(group(row(call('a'))))).toEqual({ status: '0.5s', tone: 'success', hasFailed: false })
  expect(statusOf(group(row(call('a', { isErrored: true }))))).toEqual({
    status: '0.5s ✗',
    tone: 'error',
    hasFailed: true,
  })
  expect(statusOf(group(row(call('a', { isInterrupted: true }))))).toMatchObject({
    status: 'stopped',
    tone: 'error',
    hasFailed: true,
  })
  expect(statusOf(group(row(call('a', { isRunning: true }))))).toMatchObject({ status: 'running' })
  expect(statusOf(group(row(call('a', { isErrored: true }), { deny: 'no' })))).toMatchObject({
    status: 'denied',
    tone: 'warning',
  })
})

test('a run of calls alike tells the time they took together, none where none is known', () => {
  expect(statusOf(group(row(call('a')), row(call('b')))).status).toBe('1.0s')
  expect(statusOf(group(row(call('u'), null))).status).toBe('')
})

test("a row is labelled with the tool's name, what it is about and how many it stands for", () => {
  expect(labelOf(call('a'), 1, 40, false)).toEqual({ name: 'Bash', times: '', whole: 'ls', isWhole: true, about: 'ls' })
  expect(labelOf(call('a', { tool: 'mcp__srv__do_it' }), 3, 40, false)).toMatchObject({ name: 'do_it', times: ' ×3' })
})

test('what a call is about is cut to the room, and drawn whole beneath once opened', () => {
  const long = call('a', { input: { command: 'x'.repeat(50) } })

  expect(labelOf(long, 1, 20, false)).toMatchObject({ isWhole: true, about: `${'x'.repeat(14)}…` })
  expect(labelOf(long, 1, 20, true)).toMatchObject({ isWhole: false, about: '', whole: 'x'.repeat(50) })
  expect(labelOf(call('a'), 1, 20, true)).toMatchObject({ isWhole: true, about: 'ls' })
  // The count ` ×3` takes its cells from the input's.
  expect(labelOf(long, 3, 20, false)).toMatchObject({ times: ' ×3', about: `${'x'.repeat(11)}…` })
})

test('the head of a result is its first ten lines, with how many are left out', () => {
  const output = Array.from({ length: 12 }, (_, n) => `line ${n}`).join('\n')
  const { said, rest } = resultOf(call('a'), `${output}\n\n`, undefined, undefined, false, 80)

  expect(said).toEqual(Array.from({ length: 10 }, (_, n) => `line ${n}`))
  expect(rest).toBe(2)
})

test('once asked, all of a result that fits is drawn, its lines cut to the width', () => {
  const output = Array.from({ length: 12 }, () => 'x'.repeat(30)).join('\n')
  const { said, rest } = resultOf(call('a'), output, undefined, undefined, true, 20)

  expect(said).toHaveLength(12)
  expect(said[0]).toBe(`${'x'.repeat(14)}…`)
  expect(rest).toBe(0)
})

test("the notes the engine adds for the model are not the tool's output", () => {
  expect(
    resultOf(call('a'), 'out\n<system-reminder>be careful</system-reminder>', undefined, undefined, false, 80),
  ).toEqual({
    said: ['out'],
    rest: 0,
  })
})

test('a result with nothing in it, or a call still running, says so', () => {
  expect(resultOf(call('a'), '', undefined, undefined, false, 80).said).toEqual(['(No output)'])
  expect(resultOf(call('a'), '', 'image', undefined, false, 80).said).toEqual(['(image)'])
  expect(resultOf(call('a', { isRunning: true }), '', undefined, undefined, false, 80)).toEqual({
    said: ['Running…'],
    rest: 0,
  })
})

test('a read tells what it took in, never its lines: how many, or the image or the PDF', () => {
  const read = call('a', { tool: 'Read' })

  expect(resultOf(read, 'a\nb\nc\n', undefined, undefined, false, 80)).toEqual({ said: ['Read 3 lines'], rest: 0 })
  expect(resultOf(read, 'a', undefined, undefined, false, 80).said).toEqual(['Read 1 line'])
  expect(resultOf(read, '', 'image', 'Read image · 10×10', false, 80).said).toEqual(['Read image · 10×10'])
  expect(resultOf(read, '', 'PDF', undefined, false, 80).said).toEqual(['Read PDF'])
  expect(resultOf({ ...read, isErrored: true }, 'No such file', undefined, undefined, false, 80).said).toEqual([
    'No such file',
  ])
})

test('the file rows are told from the call rows, in order', () => {
  const entries = [{ kind: 'calls' as const, rows: group(row(call('a'))) }, file('f1'), file('f2')]

  expect(filesIn(entries).map(entry => entry.key)).toEqual(['f1', 'f2'])
  expect(filesIn([])).toEqual([])
})

test("a file row's times are its edits' own, none for a command's files, and a call row's are its rows'", () => {
  const editTimes = new Map([['a', { startedAt: 1, endedAt: 2 }]])
  const calls = group(row(call('c')), row(call('d')))

  expect(timesOf({ ...file('f'), ids: ['a', 'b'] }, editTimes)).toEqual([{ startedAt: 1, endedAt: 2 }, undefined])
  expect(timesOf(file('f'), editTimes)).toEqual([])
  expect(timesOf({ kind: 'calls', rows: calls }, editTimes)).toEqual(calls)
})

test("a diff takes a line for each hunk's head and one for each of its lines", () => {
  expect(diffRows([])).toBe(0)
  expect(diffRows([hunk('+a', '+b'), hunk('-c')])).toBe(5)
})

test("a call's row starts with a dollar for a command, else the first letter of its tool's name", () => {
  expect(glyphOf('Bash', 'Bash')).toBe('$')
  expect(glyphOf('Read', 'Read')).toBe('R')
  expect(glyphOf('mcp__github__get_issue', 'get_issue')).toBe('G')
  expect(glyphOf('Skill', 'ñandú')).toBe('Ñ')
  expect(glyphOf('Odd', '')).toBe('')
})

test("a call's row is blanked to its bar by what its words leave of the label's room, and to its status by the status's", () => {
  const room = { label: 20, status: 9 }
  const words = { name: 'Read', about: 'a.ts', times: ' ×2' }

  expect(callGaps(room, words, 'done')).toEqual({ label: 9, status: 5 })
  expect(callGaps(room, { name: '日本', about: '', times: '' }, '1.0s')).toEqual({ label: 16, status: 5 })
})

test('a row whose words fill its room keeps one blank, and a status wider than its room none', () => {
  expect(callGaps({ label: 5, status: 3 }, { name: 'Read', about: 'a.ts', times: ' ×2' }, 'running')).toEqual({
    label: 1,
    status: 0,
  })
})

test('a refused call is noted with what it would have run and why not, on one line, each cut to the room', () => {
  const refused = call('a', { input: { command: 'rm   -rf\n x' } })

  expect(deniedOf(refused, 'no  rule\nallows it', 40)).toEqual({
    would: '⊘ rm -rf x',
    why: 'denied · no rule allows it',
  })
  expect(deniedOf(refused, 'no rule', 6)).toEqual({ would: '⊘ rm …', why: 'denie…' })
})

test('an edit that failed is struck through with why, each cut to the room', () => {
  expect(failedOf({ shown: 'src/a.ts', failure: 'rechazado' }, 40)).toEqual({ name: '✗ src/a.ts', why: 'rechazado' })
  expect(failedOf({ shown: 'src/a.ts', failure: 'rechazado' }, 5)).toEqual({ name: '✗ sr…', why: 'rech…' })
})

test("a file's row names the file with how many edits made it and whether its diff is open, and counts its changes", () => {
  const edited = { ...file('src/a.ts', [hunk('+x', '+y', '-z')]), ids: ['a', 'b'] }
  const room = { label: 30, status: 9 }
  const { counts, name } = fileRowOf(edited, false, room, new Map())

  expect(name).toBe('src/a.ts ×2 ▸')
  expect(counts).toMatchObject({ plus: ' +2', minus: ' −1', length: 6 })
  expect(fileRowOf(edited, true, room, new Map()).name).toBe('src/a.ts ×2 ▾')
  expect(fileRowOf({ ...edited, ids: ['a'] }, false, room, new Map()).name).toBe('src/a.ts ▸')
  expect(fileRowOf({ ...edited, ids: [] }, false, room, new Map()).name).toBe('src/a.ts ▸')
})

test("a file's row tells its edits' own time summed, none where none is known, and blanks its bar and its time to their columns", () => {
  const edited = { ...file('src/a.ts', [hunk('+x', '+y', '-z')]), ids: ['a', 'b'] }
  const room = { label: 30, status: 9 }
  const timed = fileRowOf(
    edited,
    false,
    room,
    new Map([
      ['a', { ms: 1500 }],
      ['b', { ms: 500 }],
    ]),
  )

  expect(timed).toMatchObject({ took: '2.0s', gap: 12, tookGap: 5 })
  expect(fileRowOf(edited, false, room, new Map([['b', { ms: 500 }]])).took).toBe('0.5s')
  expect(fileRowOf(edited, false, room, new Map([['a', {}]]))).toMatchObject({ took: '', tookGap: 9 })
  expect(fileRowOf({ ...edited, ids: [] }, false, room, new Map([['a', { ms: 500 }]])).took).toBe('')
})

test("a file's name is cut to what its counts leave of the label's room, never below four cells", () => {
  const edited = { ...file('src/a.ts', [hunk('+x', '+y', '-z')]), ids: ['a', 'b'] }

  expect(fileRowOf(edited, false, { label: 10, status: 9 }, new Map())).toMatchObject({ name: 'src…', gap: 1 })
  expect(fileRowOf(edited, false, { label: 2, status: 9 }, new Map()).name).toBe('src…')
})

test("the button that folds an opened result is labelled with the call's name and its whole input, cut to the width", () => {
  expect(foldLabel('Bash', 'ls -la', 20)).toBe('▴ Bash ls -la')
  expect(foldLabel('Bash', 'ls -la', 10)).toBe('▴ Bash …')
})

test('a line of a result is cut to the row less its margin, and the lines left out are counted in words', () => {
  expect(resultLine('abcdefghij', 10)).toBe('abcd…')
  expect(resultLine('abcde', 10)).toBe('abcde')
  expect(restLabel(3)).toBe('… +3 lines')
})
