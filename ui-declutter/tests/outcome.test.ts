import { expect, test } from 'claude-code/testing'

import { countsOf, fitting, outcomeOf, unified, withoutBashEdit } from '../hooks/outcome'
import type { Hunk } from '../hooks/outcome'

const hunk = (lines: string[], at = 1): Hunk => ({ oldStart: at, oldLines: 0, newStart: at, newLines: 0, lines })
const long = (mark: string) => `${mark}${'x'.repeat(29_999)}`

test("an edit's result gives its hunks", () => {
  const patch = [hunk([' a', '-b', '+c'])]

  expect(outcomeOf({ type: 'update', structuredPatch: patch })).toEqual({
    hunks: patch,
    changes: [],
    media: undefined,
  })
})

test('a file created has one hunk of its lines, all added, the last newline not a line', () => {
  expect(outcomeOf({ type: 'create', content: 'a\nb\n' }).hunks).toEqual([
    { oldStart: 0, oldLines: 0, newStart: 1, newLines: 2, lines: ['+a', '+b'] },
  ])
})

test('the files a command changed are the ones that name a path and hold hunks', () => {
  const kept = hunk(['+a'])

  expect(
    outcomeOf({
      bashEditDiff: { files: [{ filePath: '/a.ts', hunks: [kept] }, { filePath: '/b.ts' }, { hunks: [kept] }] },
    }).changes,
  ).toEqual([{ path: '/a.ts', hunks: [kept] }])
})

test('a read of an image or a PDF tells what it took in: its size and its dimensions where known', () => {
  const file = { originalSize: 31 * 1024, dimensions: { originalWidth: 1080, originalHeight: 2408 } }

  expect(outcomeOf({ type: 'image', file }).media).toBe('Read image · 1080×2408 · 31 KB')
  expect(outcomeOf({ type: 'pdf', file: { originalSize: 2 * 1024 * 1024 } }).media).toBe('Read PDF · 2.0 MB')
  expect(outcomeOf({ type: 'image', file: null }).media).toBe('Read image')
  expect(
    outcomeOf({ type: 'pdf', file: { originalSize: 3 * 1024, dimensions: { originalWidth: 8, originalHeight: 9 } } })
      .media,
  ).toBe('Read PDF · 3 KB')
})

test('a result that is none of these gives nothing to draw', () => {
  expect(outcomeOf({ type: 'text' })).toEqual({ hunks: undefined, changes: [], media: undefined })
  expect(outcomeOf(undefined)).toEqual({ hunks: undefined, changes: [], media: undefined })
})

test('the counts are the lines added and removed, marked where the hunks are not all known', () => {
  const hunks = [hunk(['+a', '+b', '-c', ' d'])]

  expect(countsOf(hunks, true)).toEqual({ plus: ' +2', minus: ' −1', length: 6 })
  expect(countsOf(hunks, false)).toEqual({ plus: ' +2', minus: ' −1 ?', length: 8 })
  expect(countsOf([], true)).toEqual({ plus: ' +0', minus: ' −0', length: 6 })
})

test('hunks are a unified diff, its header counting the old and new lines', () => {
  expect(unified([hunk([' a', '+b', '-c', ' d'], 7), hunk(['+e'], 20)])).toBe(
    '@@ -7,3 +7,3 @@\n a\n+b\n-c\n d\n@@ -20,0 +20,1 @@\n+e\n',
  )
})

test('a diff too long for a drawing is cut at a line, its header counting the lines kept, and the hunks after it dropped', () => {
  const diff = unified([hunk([long('+'), long('+'), long('+')], 5), hunk(['+later'], 90)])

  expect(diff.startsWith('@@ -5,0 +5,2 @@\n')).toBe(true)
  expect(diff.split('\n').filter(line => line.startsWith('+'))).toHaveLength(2)
  expect(diff).not.toContain('later')
})

test('no hunk follows one that was cut, though there is room left for it', () => {
  const diff = unified([hunk(['+'.padEnd(50_000, 'x'), '+'.padEnd(20_000, 'y')], 5), hunk(['+later'], 90)])

  expect(diff.startsWith('@@ -5,0 +5,1 @@\n')).toBe(true)
  expect(diff).not.toContain('later')
})

test('a hunk with no line that fits is left out', () => {
  expect(unified([hunk([long('+').repeat(3)])])).toBe('')
})

test("a command's result loses its diff and nothing else, and one without a diff is left as it is", () => {
  expect(withoutBashEdit({ stdout: 'ok', bashEditDiff: { files: [] }, exitCode: 0 })).toEqual({
    stdout: 'ok',
    exitCode: 0,
  })
  expect(withoutBashEdit({ stdout: 'ok' })).toBeUndefined()
  expect(withoutBashEdit({ bashEditDiff: undefined, stdout: 'ok' })).toBeUndefined()
  expect(withoutBashEdit({ bashEditDiff: null })).toEqual({})
})

test('the lines that fit a drawing are kept up to its limit', () => {
  expect(fitting(['a', 'b'])).toEqual(['a', 'b'])
  expect(fitting(['x'.repeat(29_999), 'y'.repeat(29_999), 'z']).map(line => line.charAt(0))).toEqual(['x', 'y'])
})
