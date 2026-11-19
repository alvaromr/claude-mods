import { expect, test } from 'claude-code/testing'
import type { ToolGroupCall } from 'claude-code'

import type { Hunk } from '../hooks/outcome'
import { lineOf, padOf, relative, seconds, subject } from '../hooks/summary'
import { TEXT } from '../hooks/text'

const call = (tool: string): ToolGroupCall => ({
  tool_use_id: tool,
  tool,
  input: {},
  isRunning: false,
  isErrored: false,
  isInterrupted: false,
})
const added = (n: number): Hunk => ({
  oldStart: 1,
  oldLines: 0,
  newStart: 1,
  newLines: n,
  lines: Array.from({ length: n }, () => '+x'),
})
const nothing = {
  calls: [],
  done: 0,
  files: [],
  failed: 0,
  fileRows: [],
  isTimed: false,
  total: 0,
  isOpen: false,
  rowWidth: 30,
  hasEditBars: false,
}

test("an unfolded line is padded to the rows' width beneath it, a folded one or one as wide as them not", () => {
  expect(padOf({ width: 30, length: 12 }, true)).toBe(18)
  expect(padOf({ width: 30, length: 12 }, false)).toBe(0)
  expect(padOf({ width: 10, length: 12 }, true)).toBe(0)
  expect(padOf({ width: 12, length: 12 }, true)).toBe(0)
})

test('a time under a minute is in tenths of a second, longer in whole seconds', () => {
  expect([0, 1400, 59_949].map(seconds)).toEqual(['0.0s', '1.4s', '59.9s'])
  expect([59_950, 119_600, 125_000].map(seconds)).toEqual(['1m 0s', '2m 0s', '2m 5s'])
})

test("what a call is about is its command, else its file's name, else its first text, on one line", () => {
  expect(subject({ command: 'ls   -la\n' })).toBe('ls -la')
  expect(subject({ file_path: '/a/b/c.ts', other: 'x' })).toBe('c.ts')
  expect(subject({ n: 1, pattern: 'foo  bar' })).toBe('foo bar')
  expect(subject({ n: 1 })).toBe('')
  expect(subject(undefined)).toBe('')
  expect(subject(null)).toBe('')
})

test("a path under the session's folder is shown from it, any other whole", () => {
  expect(relative('/repo/src/a.ts', '/repo/')).toBe('src/a.ts')
  expect(relative('/other/a.ts', '/repo/')).toBe('/other/a.ts')
})

test('a path too long keeps its end, with an ellipsis for what was cut', () => {
  const path = `${'dir/'.repeat(30)}file.ts`
  const shown = relative(path, '/repo/')

  expect(shown).toHaveLength(60)
  expect(shown.startsWith('…')).toBe(true)
  expect(shown.endsWith('/file.ts')).toBe(true)
})

test('a span with nothing to tell has no line', () => {
  expect(lineOf(nothing)).toBeUndefined()
})

test('the line tells the calls, the edits and the files they changed, with the time and an arrow', () => {
  const line = lineOf({
    ...nothing,
    calls: [call('Read'), call('Read')],
    done: 3,
    files: [
      { shown: 'a.ts', hunks: [added(2)], isKnown: true },
      { shown: 'b.ts', hunks: [added(1)], isKnown: true },
    ],
    isTimed: true,
    total: 1400,
  })

  expect(line).toMatchObject({
    words: `Read 2 files · ${TEXT.changes(3)} · ${TEXT.files(2)}`,
    failure: '',
    tail: ' · 1.4s ▸',
    counts: { plus: ' +3', minus: ' −0' },
  })
})

test('the file is named where the edits are in one', () => {
  const line = lineOf({ ...nothing, done: 2, files: [{ shown: 'a.ts', hunks: [added(1)], isKnown: true }] })

  expect(line?.words).toBe(`${TEXT.changes(2)} · a.ts`)
  expect(line?.tail).toBe(' ▸')
})

test('edits of one file name it once, and a span of edits alone tells no time', () => {
  const file = { shown: 'a.ts', hunks: [added(1)], isKnown: true }
  const line = lineOf({ ...nothing, done: 2, files: [file, file], isTimed: true, total: 900 })

  expect(line?.words).toBe(`${TEXT.changes(2)} · a.ts`)
  expect(line?.tail).toBe(' ▸')
})

test('the counts are marked where the hunks of some file are not known', () => {
  const line = lineOf({
    ...nothing,
    done: 2,
    files: [
      { shown: 'a.ts', hunks: [added(1)], isKnown: true },
      { shown: 'b.ts', hunks: [], isKnown: false },
    ],
  })

  expect(line?.counts.minus).toBe(' −0 ?')
})

test('the edits that failed are counted apart, after the rest', () => {
  expect(lineOf({ ...nothing, calls: [call('Bash')], failed: 2 })?.failure).toBe(` · ${TEXT.failed(2)}`)
  expect(lineOf({ ...nothing, failed: 1 })).toMatchObject({ words: '', failure: TEXT.failed(1) })
})

test('opened, the arrow points down, and the line is as long as what it holds', () => {
  const line = lineOf({
    ...nothing,
    done: 1,
    files: [{ shown: 'a.ts', hunks: [added(1)], isKnown: true }],
    isOpen: true,
  })

  expect(line?.tail).toBe(' ▾')
  expect(line?.length).toBe(`${TEXT.changes(1)} · a.ts`.length + ' +1 −0'.length + ' ▾'.length)
})

test("the rows are as wide as the calls' rows, else the longest file row", () => {
  const file = { shown: 'src/a.ts', hunks: [added(1)], isKnown: true }

  expect(lineOf({ ...nothing, calls: [call('Read')], rowWidth: 44 })?.width).toBe(44)
  expect(lineOf({ ...nothing, done: 1, files: [file], fileRows: [file], hasEditBars: true, rowWidth: 44 })?.width).toBe(
    44,
  )
  expect(lineOf({ ...nothing, done: 1, files: [file], fileRows: [file] })?.width).toBe(
    '± src/a.ts ▸'.length + ' +1 −0'.length,
  )
  expect(
    lineOf({ ...nothing, failed: 1, fileRows: [{ shown: 'a.ts', hunks: [], isKnown: true, failure: 'rechazado' }] })
      ?.width,
  ).toBe('✗ a.ts'.length + 1 + 'rechazado'.length)
})
