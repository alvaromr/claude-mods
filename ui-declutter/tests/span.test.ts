import { expect, test } from 'claude-code/testing'
import type { ToolGroupCall } from 'claude-code'

import type { Item, Span } from '../hooks/conversation'
import type { Hunk, Outcome } from '../hooks/outcome'
import {
  callsOf,
  drawerOf,
  editsOf,
  engineUnfolds,
  foldable,
  isEngineRow,
  itemOf,
  shownFor,
  splitEdits,
  treatmentOf,
  wantedOf,
} from '../hooks/span'
import type { EditLine, Shown } from '../hooks/span'
import { TEXT } from '../hooks/text'

const call = (id: string, tool: string, isRunning = false): ToolGroupCall => ({
  tool_use_id: id,
  tool,
  input: {},
  isRunning,
  isErrored: false,
  isInterrupted: false,
})
const calls = (id: string, tool: string): Item => ({ kind: 'calls', call: call(id, tool) })
const edits = (id: string, path = '/x.ts', failure?: string): Item => ({
  kind: 'edits',
  edit: { id, path, ...(failure === undefined ? {} : { failure }) },
})
const span = (...items: Item[]): Span => ({ first: items[0] === undefined ? '' : 'first', items })
const hunk: Hunk = { oldStart: 1, oldLines: 0, newStart: 1, newLines: 1, lines: ['+a'] }
const everything: Shown = { calls: true, skills: true, edits: true, changes: true }
const nothing: Shown = { calls: false, skills: false, edits: false, changes: false }

test("every kind is in a span's line at the summary level", () => {
  expect(shownFor({ diffs: 'summary', commands: 'summary', skills: 'summary' })).toEqual(everything)
})

test("a hidden kind is nowhere and a full one the engine's, each by its own level", () => {
  expect(shownFor({ diffs: 'hidden', commands: 'summary', skills: 'full' })).toEqual({
    calls: true,
    skills: false,
    edits: false,
    changes: false,
  })
  expect(shownFor({ diffs: 'full', commands: 'hidden', skills: 'summary' })).toEqual({
    calls: false,
    skills: true,
    edits: false,
    changes: false,
  })
})

test('the commands are in the line only at the summary level, not at full', () => {
  expect(shownFor({ diffs: 'summary', commands: 'full', skills: 'summary' }).calls).toBe(false)
})

test("the files a command changed are in the line while the diffs are, and the commands are not the engine's", () => {
  expect(shownFor({ diffs: 'summary', commands: 'hidden', skills: 'summary' }).changes).toBe(true)
  expect(shownFor({ diffs: 'summary', commands: 'full', skills: 'summary' }).changes).toBe(false)
})

test('the span draws where its first shown item is', () => {
  const some = span(calls('a', 'Read'), edits('b'), calls('c', 'Bash'))

  expect(drawerOf(some, everything)).toBe('a')
  expect(drawerOf(some, { ...everything, calls: false })).toBe('b')
  expect(drawerOf(some, { ...nothing, changes: true })).toBe('c')
  expect(drawerOf(some, nothing)).toBeUndefined()
})

test("a skill is shown by the skills' level, any other call by the commands'", () => {
  const some = span(calls('a', 'Skill'), calls('b', 'Read'))

  expect(drawerOf(some, { ...nothing, calls: true })).toBe('b')
  expect(drawerOf(some, { ...nothing, skills: true })).toBe('a')
})

test('a span less the calls an unfolded run draws is the rest, as it was', () => {
  const some = span(calls('a', 'Read'), calls('b', 'Bash'), edits('c'))

  expect(foldable(some, new Set(['a', 'c'])).items).toEqual([calls('b', 'Bash')])
  expect(foldable(some, new Set())).toEqual(some)
})

test('the calls in the line are those shown, each as the drawing has it where it has it', () => {
  const some = span(calls('a', 'Read'), calls('b', 'Skill'), edits('c'), calls('d', 'Bash'))
  const running = call('d', 'Bash', true)

  expect(callsOf(some, { ...everything, skills: false }, [running])).toEqual([call('a', 'Read'), running])
})

test('the results the line needs are the edits that worked, the commands for their files, and an image opened', () => {
  const some = span(
    edits('a'),
    edits('b', '/y.ts', 'rechazado'),
    calls('c', 'Bash'),
    calls('d', 'Read'),
    calls('e', 'Read'),
  )
  const read = [call('d', 'Read'), call('e', 'Read')]
  const pictures = new Map([
    ['d', 'image'],
    ['e', 'PDF'],
  ])

  expect(wantedOf(some, everything, read, pictures, ['row:d'])).toEqual(['a', 'c', 'd'])
  expect(wantedOf(some, { ...everything, changes: false }, read, pictures, [])).toEqual(['a'])
  expect(wantedOf(some, nothing, read, pictures, [])).toEqual([])
})

test('only a read is asked for what it took in', () => {
  const some = span(calls('w', 'WebFetch'))

  expect(wantedOf(some, everything, [call('w', 'WebFetch')], new Map([['w', 'image']]), ['row:w'])).toEqual([])
})

test('the edits of a span carry their hunks, none known as null, and the files a command changed come under its id', () => {
  const some = span(edits('a'), edits('b', '/y.ts', 'rechazado'), calls('c', 'Bash'), calls('d', 'Read'))
  const outcomes = new Map<string, Outcome | null | undefined>([
    ['a', { hunks: [hunk], changes: [] }],
    [
      'c',
      {
        changes: [
          { path: '/z.ts', hunks: [hunk] },
          { path: '/w.ts', hunks: [] },
        ],
      },
    ],
  ])

  expect(editsOf(some, everything, outcomes)).toEqual([
    { id: 'a', path: '/x.ts', hunks: [hunk], isChange: false },
    { id: 'b', path: '/y.ts', failure: 'rechazado', hunks: null, isChange: false },
    { id: 'c', path: '/z.ts', hunks: [hunk], isChange: true },
    { id: 'c', path: '/w.ts', hunks: [], isChange: true },
  ])
})

test('the edits and the files a command changed are left out where their kind is not shown', () => {
  const some = span(edits('a'), calls('c', 'Bash'))
  const outcomes = new Map<string, Outcome | null | undefined>([['c', { changes: [{ path: '/z.ts', hunks: [hunk] }] }]])

  expect(editsOf(some, { ...everything, edits: false }, outcomes).map(edit => edit.id)).toEqual(['c'])
  expect(editsOf(some, { ...everything, changes: false }, outcomes).map(edit => edit.id)).toEqual(['a'])
  expect(editsOf(some, everything, new Map()).map(edit => [edit.id, edit.hunks])).toEqual([['a', null]])
})

test('an edit the conversation does not hold yet is an item with its path, and why if it failed', () => {
  const edit = { ...call('e', 'Edit'), input: { file_path: '/x/y.ts' } }

  expect(itemOf(edit, undefined)).toEqual({ kind: 'edits', edit: { id: 'e', path: '/x/y.ts' } })
  expect(itemOf({ ...edit, tool: 'Write' }, 'ok')).toEqual({ kind: 'edits', edit: { id: 'e', path: '/x/y.ts' } })
  expect(itemOf({ ...edit, isErrored: true }, 'File has not been read yet.')).toEqual({
    kind: 'edits',
    edit: { id: 'e', path: '/x/y.ts', failure: TEXT.reasons.notRead },
  })
  expect(itemOf({ ...edit, isErrored: true }, { not: 'text' })).toEqual({
    kind: 'edits',
    edit: { id: 'e', path: '/x/y.ts', failure: TEXT.reasons.unknown },
  })
})

test('an edit whose input names no path, or none at all, has an empty one', () => {
  expect(itemOf(call('e', 'Edit'), undefined)).toEqual({ kind: 'edits', edit: { id: 'e', path: '' } })
  expect(itemOf({ ...call('e', 'Edit'), input: undefined }, undefined)).toEqual({
    kind: 'edits',
    edit: { id: 'e', path: '' },
  })
  expect(itemOf({ ...call('e', 'Edit'), input: { file_path: 7 } }, undefined)).toEqual({
    kind: 'edits',
    edit: { id: 'e', path: '7' },
  })
})

test("any other tool's call not held yet is a call item, failed or not", () => {
  const bash = { ...call('b', 'Bash'), isErrored: true }

  expect(itemOf(bash, 'boom')).toEqual({ kind: 'calls', call: bash })
  expect(itemOf(call('r', 'Read'), undefined)).toEqual({ kind: 'calls', call: call('r', 'Read') })
})

test("a row is the engine's in a run it unfolded, or drawn in full unless the mod unfolded that run", () => {
  const engine = new Set(['a'])
  const mod = new Set(['m'])

  expect(isEngineRow('a', undefined, engine, mod)).toBe(true)
  expect(isEngineRow('a', false, engine, mod)).toBe(true)
  expect(isEngineRow('x', true, engine, mod)).toBe(true)
  expect(isEngineRow('m', true, engine, mod)).toBe(false)
  expect(isEngineRow('x', false, engine, mod)).toBe(false)
  expect(isEngineRow('x', undefined, engine, mod)).toBe(false)
})

test('a run the engine unfolds is its own, and goes back to the mod folded again', () => {
  const unfolded = new Set(['z'])
  const unfoldedHere = new Set(['a', 'y'])

  engineUnfolds(['a', 'b'], true, unfolded, unfoldedHere)
  expect([...unfolded]).toEqual(['z', 'a', 'b'])
  expect([...unfoldedHere]).toEqual(['y'])

  engineUnfolds(['a'], false, unfolded, unfoldedHere)
  expect([...unfolded]).toEqual(['z', 'b'])
  expect([...unfoldedHere]).toEqual(['y'])
})

test("a run is the engine's if all its kinds are normal, drawn by rows if some are, else its span's line", () => {
  expect(treatmentOf(['full', 'full'])).toBe('engine')
  expect(treatmentOf(['full', 'summary'])).toBe('rows')
  expect(treatmentOf(['hidden', 'full'])).toBe('rows')
  expect(treatmentOf(['summary', 'hidden'])).toBe('span')
  expect(treatmentOf(['hidden'])).toBe('span')
})

test('the edits that failed are told from those that changed something, each in its order', () => {
  const line = (id: string, failure?: string): EditLine => ({
    id,
    path: '/x.ts',
    hunks: null,
    isChange: false,
    ...(failure === undefined ? {} : { failure }),
  })
  const { done, failed } = splitEdits([line('a'), line('b', 'rechazado'), line('c'), line('d', 'falló')])

  expect(done.map(edit => edit.id)).toEqual(['a', 'c'])
  expect(failed.map(edit => edit.id)).toEqual(['b', 'd'])
})
