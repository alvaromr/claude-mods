import { expect, test } from 'claude-code/testing'

import { indentOf, outputOf, roomOf, rowOf } from '../hooks/command-view'
import type { Run } from '../types'

const done = (exitCode: number | null, stdout = '', stderr = ''): Run => ({ status: 'done', exitCode, stdout, stderr })
const running = (stdout = '', stderr = ''): Run => ({ status: 'running', stdout, stderr })

test('a command with no run draws no output', () => {
  expect(outputOf(undefined, false)).toBeUndefined()
})

test('a run still going shows what it printed and that it runs', () => {
  expect(outputOf(running('a\nb\n'), true)).toEqual({
    hasLines: true,
    head: 'a\nb',
    hidden: 0,
    isRunning: true,
    isStopped: false,
    failure: undefined,
    isSilent: false,
  })
})

test('a run the store says is going but nothing here can stop is shown as stopped', () => {
  expect(outputOf(running('a'), false)).toMatchObject({ isRunning: false, isStopped: true })
  expect(outputOf(running(), false)).toMatchObject({ hasLines: false, isRunning: false, isStopped: true })
})

test('a run that ended says how it did: nothing printed, an exit code that failed, or that it was stopped', () => {
  expect(outputOf(done(0), false)).toMatchObject({
    isSilent: true,
    failure: undefined,
    isStopped: false,
    isRunning: false,
  })
  expect(outputOf(done(0, 'x'), false)).toMatchObject({ isSilent: false, failure: undefined, isStopped: false })
  expect(outputOf(done(2, 'x'), false)).toMatchObject({ isSilent: false, failure: 2, isStopped: false })
  expect(outputOf(done(1), true)).toMatchObject({ isSilent: false, failure: 1 })
  expect(outputOf(done(null, 'x'), true)).toMatchObject({ isSilent: false, failure: undefined, isStopped: true })
  expect(outputOf(done(null), true)).toMatchObject({ isSilent: false, failure: undefined, isStopped: true })
})

test('the first ten lines are shown, and how many more there are', () => {
  const lines = (n: number) => Array.from({ length: n }, (_, i) => `l${i + 1}`).join('\n')

  expect(outputOf(done(0, lines(10)), false)).toMatchObject({ head: lines(10), hidden: 0 })
  expect(outputOf(done(0, lines(11)), false)).toMatchObject({ head: lines(10), hidden: 1 })
  expect(outputOf(done(0, lines(25)), false)).toMatchObject({ head: lines(10), hidden: 15 })
})

test('both streams are shown, the output first, with no control characters and no last newline', () => {
  expect(outputOf(done(0, '\x1b[31mred\x1b[0m\n', 'warn\x07\n'), false)).toMatchObject({
    head: 'red\nwarn',
    hasLines: true,
    isSilent: false,
  })
  // Only one newline is dropped from each stream.
  expect(outputOf(done(0, 'a\n\n'), false)).toMatchObject({ head: 'a\n' })
})

test('a stream of one newline is a line, and a stream of nothing is none', () => {
  expect(outputOf(done(0, '\n'), false)).toMatchObject({ hasLines: true, head: '', isSilent: false })
  expect(outputOf(done(0, '', ''), false)).toMatchObject({ hasLines: false, head: '', isSilent: true })
})

test('a reply’s first block, drawn after its bullet, pushes what follows by two columns', () => {
  expect(indentOf(true)).toBe(2)
  expect(indentOf(false)).toBe(0)
})

test('the room of a command is the width, 80 where the surface says none, less the indent and five', () => {
  expect(roomOf(100, 0)).toBe(95)
  expect(roomOf(100, 2)).toBe(93)
  expect(roomOf(undefined, 0)).toBe(75)
  expect(roomOf(undefined, 2)).toBe(73)
})

test('a command’s row ends in the mark, the room away, and in a space at least where it is too long', () => {
  expect(rowOf('ls', 75, false)).toBe(`ls${' '.repeat(68)}▶`)
  expect(rowOf('ls', 75, true)).toBe(`ls${' '.repeat(68)}■`)
  expect(rowOf('a'.repeat(70), 75, false)).toBe(`${'a'.repeat(70)} ▶`)
  expect(rowOf('a'.repeat(100), 75, true)).toBe(`${'a'.repeat(100)} ■`)
  // The mark takes five columns with its space, the border and the padding.
  expect(rowOf('a'.repeat(69), 75, false)).toBe(`${'a'.repeat(69)} ▶`)
  expect(rowOf('a'.repeat(68), 75, false)).toBe(`${'a'.repeat(68)}  ▶`)
})
