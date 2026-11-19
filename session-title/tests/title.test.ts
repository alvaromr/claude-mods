import { expect, test } from 'claude-code/testing'

import { isTicket, slug } from '../hooks/title'

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

test('a reply becomes a slug, lower-case, its words joined by dashes', () => {
  expect(slug('Comparar facturas de luz')).toBe('comparar-facturas-de-luz')
  expect(slug('«Comparar facturas, de luz.»')).toBe('comparar-facturas-de-luz')
})

test('a slug loses its accents', () => {
  expect(slug('Revisión de la contraseña')).toBe('revision-de-la-contrasena')
})

test('a slug is made of the first line of the reply that has words', () => {
  expect(slug('\n  \nPrimera línea\nSegunda línea')).toBe('primera-linea')
})

test('a slug is at most sixty characters and has no dashes at its ends', () => {
  expect(slug('a'.repeat(100))).toBe('a'.repeat(60))
  expect(slug(`${'a'.repeat(59)} b`)).toBe('a'.repeat(59))
  expect(slug('--- título ---')).toBe('titulo')
})

test('a reply with no words gives no slug', () => {
  expect([slug(''), slug('   \n  '), slug('«¿?»')]).toEqual([undefined, undefined, undefined])
})

test('a reply that reads as a ticket gives no slug', () => {
  expect(slug('abc-123')).toBeUndefined()
  expect(slug('ABC 123')).toBeUndefined()
  expect(slug('abc-123-fix')).toBe('abc-123-fix')
})
