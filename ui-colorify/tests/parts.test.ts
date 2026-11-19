import { expect, test } from 'claude-code/testing'

import { asWritten, headingText, partsOf } from '../hooks/parts'

test('a reply with no quote or heading is one text', () => {
  expect(partsOf('Hola.\n\nAdiós.')).toEqual([{ text: 'Hola.\n\nAdiós.' }])
  expect(partsOf('')).toEqual([])
  expect(partsOf('\n  \n')).toEqual([])
})

test('an alert is cut out by its marker, which and the quote marks are taken off, the text around it kept', () => {
  expect(partsOf('Antes.\n\n> [!WARNING]\n> Una línea.\n> Otra.\n\nDespués.')).toEqual([
    { text: 'Antes.' },
    { kind: 'WARNING', body: 'Una línea.\nOtra.' },
    { text: 'Después.' },
  ])
})

test('each of the five markers is an alert, in any case, with the quote mark spaced as GitHub reads it', () => {
  const kinds = ['NOTE', 'TIP', 'IMPORTANT', 'WARNING', 'CAUTION']

  for (const kind of kinds) {
    expect(partsOf(`> [!${kind}]\n> Texto.`)).toEqual([{ kind, body: 'Texto.' }])
    expect(partsOf(`  >[!${kind.toLowerCase()}]  \n>Texto.`)).toEqual([{ kind, body: 'Texto.' }])
  }

  expect(partsOf('> [!INFO]\n> Texto.')).toEqual([{ kind: 'QUOTE', body: '[!INFO]\nTexto.' }])
})

test('a marker with text on its line is no alert: a quote, the marker kept', () => {
  expect(partsOf('> [!NOTE] algo\n> más')).toEqual([{ kind: 'QUOTE', body: '[!NOTE] algo\nmás' }])
})

test('a quote without a marker is a quote, up to its last quoted line', () => {
  expect(partsOf('> Una cita.\n> Sigue.\nFuera.')).toEqual([
    { kind: 'QUOTE', body: 'Una cita.\nSigue.' },
    { text: 'Fuera.' },
  ])
})

test('a quote indented up to three spaces is a quote, four is not', () => {
  expect(partsOf('   > Cita.')).toEqual([{ kind: 'QUOTE', body: 'Cita.' }])
  expect(partsOf('    > Código.')).toEqual([{ text: '> Código.' }])
})

test('an alert ends where its quote does, and the marker of another opens the next', () => {
  expect(partsOf('> [!NOTE]\n> Uno.\n> [!TIP]\n> Dos.')).toEqual([
    { kind: 'NOTE', body: 'Uno.' },
    { kind: 'TIP', body: 'Dos.' },
  ])
})

test('a marker with nothing quoted after it is an alert with no text', () => {
  expect(partsOf('> [!NOTE]\n\nTexto.')).toEqual([{ kind: 'NOTE', body: '' }, { text: 'Texto.' }])
})

test('a heading is cut out with its level and its title, its closing hashes aside', () => {
  expect(partsOf('# Uno\n## Dos ##\n###### Seis   \ntexto')).toEqual([
    { heading: 1, title: 'Uno' },
    { heading: 2, title: 'Dos' },
    { heading: 6, title: 'Seis' },
    { text: 'texto' },
  ])
})

test('a line that only looks like a heading is text', () => {
  expect(partsOf('#sin espacio\n####### siete\n    # sangrado\n#')).toEqual([
    { text: '#sin espacio\n####### siete\n    # sangrado\n#' },
  ])
})

test('a heading cuts the text around it, blank lines trimmed', () => {
  expect(partsOf('Antes.\n\n## Título\n\nDespués.')).toEqual([
    { text: 'Antes.' },
    { heading: 2, title: 'Título' },
    { text: 'Después.' },
  ])
})

test('an alert, a quote or a heading inside a code fence stays as written', () => {
  const fenced = '```md\n> [!NOTE]\n> Texto.\n> Cita.\n# Título\n```'

  expect(partsOf(fenced)).toEqual([{ text: fenced }])
  expect(partsOf(`Antes.\n\n${fenced}\n\n> [!TIP]\n> Fuera.`)).toEqual([
    { text: `Antes.\n\n${fenced}` },
    { kind: 'TIP', body: 'Fuera.' },
  ])
})

test('a fence is closed by the same fence, and a tilde fence is not closed by backticks', () => {
  const tilde = '~~~\n```\n> [!NOTE]\n# Título\n~~~'

  expect(partsOf(tilde)).toEqual([{ text: tilde }])
  // Closed, what follows is read again.
  expect(partsOf('```\ncódigo\n```\n# Título')).toEqual([{ text: '```\ncódigo\n```' }, { heading: 1, title: 'Título' }])
  // Never closed, the rest of the reply is code.
  expect(partsOf('```\n# Título')).toEqual([{ text: '```\n# Título' }])
})

test('a fence opening right after a quote ends it', () => {
  expect(partsOf('> Cita.\n```\n> Código.\n```')).toEqual([
    { kind: 'QUOTE', body: 'Cita.' },
    { text: '```\n> Código.\n```' },
  ])
})

test("a heading's code and bold marks are taken off, since a Text draws no markdown", () => {
  expect(headingText('Usa `pnpm` y **cuidado** con __esto__')).toBe('Usa pnpm y cuidado con esto')
  expect(headingText('Sin marcas')).toBe('Sin marcas')
})

test('a text goes beneath as it is', () => {
  expect(asWritten({ text: 'Hola.\n\nAdiós.' })).toBe('Hola.\n\nAdiós.')
})

test('a heading goes beneath with its hashes', () => {
  expect(asWritten({ heading: 1, title: 'Uno' })).toBe('# Uno')
  expect(asWritten({ heading: 4, title: 'Cuatro `x`' })).toBe('#### Cuatro `x`')
})

test('an alert goes beneath with its marker and every line quoted', () => {
  expect(asWritten({ kind: 'WARNING', body: 'Una.\nOtra.' })).toBe('> [!WARNING]\n> Una.\n> Otra.')
  expect(asWritten({ kind: 'CAUTION', body: '' })).toBe('> [!CAUTION]\n> ')
})

test('a quote without a marker goes beneath with its lines quoted and no marker', () => {
  expect(asWritten({ kind: 'QUOTE', body: 'Una.\nOtra.' })).toBe('> Una.\n> Otra.')
})
