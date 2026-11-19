import { expect, test } from 'claude-code/testing'

import type { Digest, Mode, Note } from '../types'
import { isSent, points, sentDigest, sentLines, sentNote, sharable } from '../hooks/share'
import { TEXT } from '../hooks/text'

const NOTES: Note[] = [
  { mode: 'asesor', n: 1, text: '- uno\n- dos' },
  { mode: 'asesor', n: 2, text: 'sin lista' },
]
const DIGESTS: Partial<Record<Mode, Digest>> = { resumen: { text: '- a\n- b', covered: 2 } }

test('a text with a list is sent a point at a time, each item with the lines that continue it', () => {
  expect(points('antes\n- uno\n  sigue\n* dos\n\n1. tres\n2) cuatro\n• cinco')).toEqual([
    'antes',
    '- uno\n  sigue',
    '* dos',
    '1. tres',
    '2) cuatro',
    '• cinco',
  ])
})

test('an indented item is a point of its own', () => {
  expect(points('- uno\n  - sub\n    sigue')).toEqual(['- uno', '  - sub\n    sigue'])
})

test('a text with no list is one point, and an empty one has none', () => {
  expect(points('una\notra')).toEqual(['una\notra'])
  expect(points('  \n')).toEqual([])
})

test('a note, or with no number a kept text, can be sent while it holds the points drawn', () => {
  expect(sharable({}, NOTES, 'asesor', '- uno', 1)).toBe('- uno\n- dos')
  expect(sharable({}, NOTES, 'asesor', 'sin lista', 2)).toBe('sin lista')
  expect(sharable(DIGESTS, NOTES, 'resumen', '- b')).toBe('- a\n- b')
})

test('what is gone, or was rewritten since it was drawn, cannot be sent', () => {
  expect(sharable({}, NOTES, 'asesor', '- uno', 3)).toBeUndefined()
  expect(sharable({}, NOTES, 'troll', '- uno', 1)).toBeUndefined()
  expect(sharable({}, NOTES, 'asesor', '- tres', 1)).toBeUndefined()
  expect(sharable({}, NOTES, 'asesor', '- uno\n- tres', 1)).toBeUndefined()
  expect(sharable(DIGESTS, NOTES, 'pendientes', '- a')).toBeUndefined()
  expect(sharable(DIGESTS, NOTES, 'resumen', '- c')).toBeUndefined()
})

test('the points sent are marked in the kept text sent, and added to those already marked', () => {
  const marked = sentDigest(DIGESTS, 'resumen', '- a\n- b', '- a')

  expect(marked.resumen).toEqual({ text: '- a\n- b', covered: 2, sent: ['- a'] })
  expect(sentDigest(marked, 'resumen', '- a\n- b', '- b').resumen?.sent).toEqual(['- a', '- b'])
})

test('a kept text written in place of the one sent is not marked', () => {
  expect(sentDigest(DIGESTS, 'resumen', '- otro texto', '- a')).toBe(DIGESTS)
  expect(sentDigest({}, 'resumen', '- a', '- a')).toEqual({})
})

test('the points sent are marked in the note sent alone', () => {
  expect(sentNote(NOTES, 'asesor', 1, '- uno\n- dos', '- dos')).toEqual([
    { mode: 'asesor', n: 1, text: '- uno\n- dos', sent: ['- dos'] },
    NOTES[1],
  ])
})

test('a note written in place of the one sent, or another mode’s, is not marked', () => {
  expect(sentNote(NOTES, 'asesor', 1, 'otro', '- dos')).toEqual(NOTES)
  expect(sentNote(NOTES, 'troll', 1, '- uno\n- dos', '- dos')).toEqual(NOTES)
})

test('the transcript shows what went under a header, a line of it to a row', () => {
  expect(sentLines('asesor', 2, '- uno\n  sigue\n- dos')).toEqual([
    TEXT.sentHeader('asesor', 2),
    '- uno',
    '  sigue',
    '- dos',
  ])
})

test('what went from a kept text is headed with no note number', () => {
  expect(sentLines('resumen', undefined, 'todo')).toEqual([TEXT.sentHeader('resumen', undefined), 'todo'])
  expect(TEXT.sentHeader('resumen', undefined)).not.toBe(TEXT.sentHeader('resumen', 1))
})

test('a point is sent when it is among the points already sent', () => {
  expect(isSent(['- uno', '- dos'], '- dos')).toBe(true)
  expect(isSent(['- uno'], '- dos')).toBe(false)
  expect(isSent([], '- uno')).toBe(false)
  expect(isSent(undefined, '- uno')).toBe(false)
})
