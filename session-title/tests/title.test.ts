import { expect, test } from 'claude-code/testing'

import { isTicket, titleOf } from '../hooks/title'

test('a whole ticket key is a ticket, anything else is not', () => {
  expect(['ABC-1', 'A1-22', 'PROJ-1234'].map(isTicket)).toEqual([true, true, true])
  expect(['abc-1', 'ABC-', 'ABC-1x', 'xABC-1 ', '1A-2', 'ABC-1\nmore', '', 'comparar-facturas'].map(isTicket)).toEqual([
    false,
    false,
    false,
    false,
    false,
    false,
    false,
    false,
  ])
})

test('a reply becomes a phrase, in sentence case, its words parted by spaces', () => {
  expect(titleOf('Comparar facturas de luz')).toBe('Comparar facturas de luz')
  expect(titleOf('comparar facturas de MTX')).toBe('Comparar facturas de MTX')
  expect(titleOf('¿cuál tarifa conviene?')).toBe('¿Cuál tarifa conviene?')
})

test('a title keeps its accents, even written decomposed', () => {
  expect(titleOf('Revisión de la contraseña')).toBe('Revisión de la contraseña')
  expect(titleOf('Revisión de la contraseña')).toBe('Revisión de la contraseña')
})

test('a title keeps the punctuation and digits of a phrase, not quotes nor marks', () => {
  expect(titleOf('«Migración a Node 26: pasos, dudas y session-title.md»')).toBe(
    'Migración a Node 26: pasos, dudas y session-title.md',
  )
  expect(titleOf('"**Comparar** facturas_de luz"')).toBe('Comparar facturas de luz')
})

test('a title holds no control, bidi or zero-width character', () => {
  expect(titleOf('‮Comparar\u0007 facturas​ de\u001b]0;x luz')).toBe('Comparar facturas de 0 x luz')
})

test('a title is made of the first line of the reply that has words', () => {
  expect(titleOf('\n  \nPrimera línea\nSegunda línea')).toBe('Primera línea')
})

test('a title has no end marks, and is cut at sixty characters, after a whole word', () => {
  expect(titleOf('--- Título. ')).toBe('Título')
  expect(titleOf(`${'a'.repeat(54)} bcdef`)).toBe(`A${'a'.repeat(53)} bcdef`)
  expect(titleOf(`${'a'.repeat(54)} bcdefg`)).toBe(`A${'a'.repeat(53)}`)
  expect(titleOf(`${'a'.repeat(30)} ${'b'.repeat(29)} c`)).toBe(`A${'a'.repeat(29)} ${'b'.repeat(29)}`)
  expect(titleOf(`${'a'.repeat(50)}, bcdefghijk`)).toBe(`A${'a'.repeat(49)}`)
  // One word longer than that is cut where it reaches sixty.
  expect(titleOf('a'.repeat(100))).toBe(`A${'a'.repeat(59)}`)
})

test('a reply with no words gives no title', () => {
  expect([titleOf(''), titleOf('   \n  '), titleOf('«»"…"')]).toEqual([undefined, undefined, undefined])
})

test('a reply that reads as a ticket gives no title', () => {
  expect(titleOf('ABC-123')).toBeUndefined()
  expect(titleOf('abc-123')).toBeUndefined()
  expect(titleOf('ABC 123')).toBe('ABC 123')
  expect(titleOf('abc-123 arreglar facturas')).toBe('Abc-123 arreglar facturas')
})
