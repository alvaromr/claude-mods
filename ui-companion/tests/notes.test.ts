import { expect, test } from 'claude-code/testing'

import type { Digest, Mode, Note } from '../types'
import { afterCompaction, cardsOf, isSame, withNote, withoutNote, withoutNotes } from '../hooks/notes'
import { TEXT } from '../hooks/text'

const note = (mode: Mode, n: number, text: string, sent?: string[]): Note => ({
  mode,
  n,
  text,
  ...(sent ? { sent } : {}),
})

test('a mode numbers its notes from 1, each mode on its own', () => {
  const first = withNote([], { mode: 'asesor', text: 'a', target: undefined })
  const second = withNote(first.list, { mode: 'asesor', text: 'b', target: undefined })
  const other = withNote(second.list, { mode: 'troll', text: 'c', target: undefined })

  expect(first).toEqual({ isGone: false, list: [note('asesor', 1, 'a')] })
  expect(second.list).toEqual([note('asesor', 1, 'a'), note('asesor', 2, 'b')])
  expect(other.list).toEqual([note('asesor', 1, 'a'), note('asesor', 2, 'b'), note('troll', 1, 'c')])
})

test('a mode keeps its newest 20 notes and numbers on from the last', () => {
  const full = Array.from({ length: 20 }, (_, index) => note('asesor', index + 1, `n${index + 1}`))
  const { list } = withNote(full, { mode: 'asesor', text: 'nueva', target: undefined })

  expect(list).toHaveLength(20)
  expect(list[0]).toEqual(note('asesor', 2, 'n2'))
  expect(list.at(-1)).toEqual(note('asesor', 21, 'nueva'))
})

test('a silent reply adds no note and leaves the mode’s notes as they were', () => {
  const kept = [note('troll', 1, 'z'), note('asesor', 1, 'a')]

  expect(withNote(kept, { mode: 'asesor', text: '—', target: undefined })).toEqual({ isGone: false, list: kept })
  expect(withNote(kept, { mode: 'asesor', text: '', target: undefined }).list).toEqual(kept)
})

test('a note made again takes the place of the one it was made from, numbered after the others', () => {
  const kept = [note('asesor', 1, 'a'), note('asesor', 2, 'b'), note('troll', 1, 'z')]
  const { isGone, list } = withNote(kept, { mode: 'asesor', text: 'b2', target: kept[1] })

  expect(isGone).toBe(false)
  expect(list).toEqual([note('troll', 1, 'z'), note('asesor', 1, 'a'), note('asesor', 2, 'b2')])
})

test('a note made again that comes out silent leaves none in its place', () => {
  const kept = [note('asesor', 1, 'a'), note('asesor', 2, 'b')]

  expect(withNote(kept, { mode: 'asesor', text: '—', target: kept[1] }).list).toEqual([note('asesor', 1, 'a')])
})

test('a note made again that the person discarded meanwhile leaves the notes alone and says it is gone', () => {
  const kept = [note('asesor', 1, 'a')]
  const result = withNote(kept, { mode: 'asesor', text: 'nueva', target: note('asesor', 2, 'b') })

  expect(result).toEqual({ isGone: true, list: kept })
})

test('a note is the same as another only with the same mode, number and text', () => {
  expect(isSame(note('asesor', 1, 'a'), note('asesor', 1, 'a'))).toBe(true)
  expect(isSame(note('asesor', 1, 'a'), note('troll', 1, 'a'))).toBe(false)
  expect(isSame(note('asesor', 1, 'a'), note('asesor', 2, 'a'))).toBe(false)
  expect(isSame(note('asesor', 1, 'a'), note('asesor', 1, 'b'))).toBe(false)
  expect(isSame(note('asesor', 1, 'a'), undefined)).toBe(false)
})

test('a compaction zeroes what the kept texts cover and touches nothing else', () => {
  const digests: Partial<Record<Mode, Digest>> = {
    resumen: { text: '- a', covered: 6, sent: ['- a'] },
    asesor: { text: 'no se guarda así', covered: 3 },
  }

  expect(afterCompaction(digests)).toEqual({
    resumen: { text: '- a', covered: 0, sent: ['- a'] },
    asesor: { text: 'no se guarda así', covered: 3 },
  })
  expect(afterCompaction({})).toEqual({})
})

test('the pane shows a mode that keeps a text as one card named for the mode', () => {
  expect(cardsOf('resumen', { resumen: { text: '- a', covered: 2, sent: ['- a'] } }, [])).toEqual([
    {
      text: '- a',
      sent: ['- a'],
      title: 'resumen',
      isOld: false,
      n: undefined,
      sendKey: 'send',
      discardKey: 'discard',
    },
  ])
  expect(cardsOf('pendientes', { pendientes: { text: '- b', covered: 1 } }, [])[0]?.title).toBe(TEXT.nextSteps)
  expect(cardsOf('resumen', {}, [])).toEqual([])
})

test('a note is dropped alone, by its number and in its own mode', () => {
  const notes = [note('asesor', 1, 'a'), note('asesor', 2, 'b'), note('troll', 1, 'z')]

  expect(withoutNote(notes, 'asesor', 1)).toEqual([note('asesor', 2, 'b'), note('troll', 1, 'z')])
  expect(withoutNote(notes, 'troll', 1)).toEqual([note('asesor', 1, 'a'), note('asesor', 2, 'b')])
  expect(withoutNote(notes, 'vigilante', 1)).toEqual(notes)
})

test('dropping all of a mode’s notes leaves the other modes’, and the next note starts again from 1', () => {
  const notes = [note('asesor', 1, 'a'), note('asesor', 2, 'b'), note('troll', 1, 'z')]
  const left = withoutNotes(notes, 'asesor')

  expect(left).toEqual([note('troll', 1, 'z')])
  expect(withNote(withoutNotes(notes, 'troll'), { mode: 'troll', text: 'y', target: undefined }).list.at(-1)?.n).toBe(1)
  expect(withoutNotes(notes, 'vigilante')).toEqual(notes)
})

test('the pane shows a mode of notes as one card per note, newest first, the older ones old', () => {
  const notes = [note('asesor', 1, 'a'), note('troll', 1, 'z'), note('asesor', 2, 'b', ['b'])]

  expect(cardsOf('asesor', {}, notes)).toEqual([
    { text: 'b', sent: ['b'], title: TEXT.note(2), isOld: false, n: 2, sendKey: 'send-2', discardKey: 'discard-2' },
    { text: 'a', sent: undefined, title: TEXT.note(1), isOld: true, n: 1, sendKey: 'send-1', discardKey: 'discard-1' },
  ])
  expect(cardsOf('vigilante', {}, notes)).toEqual([])
})
