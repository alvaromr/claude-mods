import { expect, test } from 'claude-code/testing'

import { CONTROL, partsOf } from '../hooks/command-parts'

test('a message with no command is one text', () => {
  expect(partsOf('Nada que ejecutar.\nNi aquí.')).toEqual([{ text: 'Nada que ejecutar.\nNi aquí.' }])
  expect(partsOf('')).toEqual([{ text: '' }])
})

test('a line `! command` cuts the message, the text around it kept, the command placed by its line', () => {
  expect(partsOf('Corre:\n! ls\nFin.')).toEqual([{ text: 'Corre:' }, { command: 'ls', at: '1' }, { text: 'Fin.' }])
  expect(partsOf('! ls')).toEqual([{ command: 'ls', at: '0' }])
  expect(partsOf('! ls\n! pwd')).toEqual([
    { command: 'ls', at: '0' },
    { command: 'pwd', at: '1' },
  ])
})

test('a line is a command only in bash mode form: `!`, a space and a command, a line ending in \\r being one too', () => {
  expect(partsOf('!Nota: esto no es un comando\n!\n!  \n! ls\r\nFin.')).toEqual([
    { text: '!Nota: esto no es un comando\n!\n!  ' },
    { command: 'ls', at: '3' },
    { text: 'Fin.' },
  ])
  expect(partsOf('![imagen](x.png)')).toEqual([{ text: '![imagen](x.png)' }])
})

test('the command of a fence of one line is boxed, the fence indented or not', () => {
  expect(partsOf('x\n```sh\n! ls\n```\ny')).toEqual([{ text: 'x' }, { command: 'ls', at: '1' }, { text: 'y' }])
  expect(partsOf('- a\n  ```\n  ! ls\n  ```\n- b')).toEqual([
    { text: '- a' },
    { command: 'ls', at: '1' },
    { text: '- b' },
  ])
  expect(partsOf('```\n! ls\n```')).toEqual([{ command: 'ls', at: '0' }])
})

test('a fence holding anything else is left whole, its lines as written', () => {
  for (const fence of [
    '```\nls -la\n```',
    '```\n! ls\n! pwd\n```',
    '```\n! ls\nmás\n```',
    '```sh\n$ ls\n! ls\n```',
    '```\nusa `! pwd` aquí\n```',
  ]) {
    expect(partsOf(fence), fence).toEqual([{ text: fence }])
  }
})

test('a fence opened inside another holds no command to box', () => {
  expect(partsOf('x\n```md\n```\n! ls\n```\n```')).toEqual([
    { text: 'x\n```md\n```' },
    { command: 'ls', at: '3' },
    { text: '```\n```' },
  ])
})

test('a command in a code span of a sentence is boxed under its line, in the order it is named', () => {
  expect(partsOf('Con `! pwd` o `! ls`:\nFin')).toEqual([
    { text: 'Con `! pwd` o `! ls`:' },
    { command: 'pwd', at: '0.0' },
    { command: 'ls', at: '0.1' },
    { text: 'Fin' },
  ])
  expect(partsOf('a\n`! ls`')).toEqual([{ text: 'a\n`! ls`' }, { command: 'ls', at: '1.0' }])
})

test('a code span is a command only with a space after the `!`, and holding something', () => {
  expect(partsOf('Usa `!important` o `!ls` o `!`.')).toEqual([{ text: 'Usa `!important` o `!ls` o `!`.' }])
  expect(partsOf('Vacío `!   ` aquí')).toEqual([{ text: 'Vacío `!   ` aquí' }])
})

test('a command right after the same one is drawn once, not when text comes between', () => {
  expect(partsOf('Con `! pwd` o `! pwd`')).toEqual([{ text: 'Con `! pwd` o `! pwd`' }, { command: 'pwd', at: '0.0' }])
  expect(partsOf('Con `! pwd` o `! pwd`:\n! pwd\n! ls\nY otra vez:\n! pwd')).toEqual([
    { text: 'Con `! pwd` o `! pwd`:' },
    { command: 'pwd', at: '0.0' },
    { command: 'ls', at: '2' },
    { text: 'Y otra vez:' },
    { command: 'pwd', at: '4' },
  ])
})

test('a command is without control, bidirectional and zero-width characters, and trimmed', () => {
  const unseen = [
    0x80, 0x9f, 0xad, 0x61c, 0x180e, 0x200b, 0x200f, 0x202a, 0x202e, 0x2060, 0x2064, 0x2066, 0x206f, 0xfeff,
  ]

  for (const point of unseen) {
    const char = String.fromCodePoint(point)

    expect(partsOf(`! a${char}b`), point.toString(16)).toEqual([{ command: 'ab', at: '0' }])
  }

  expect(partsOf('! cat txt\x1b[31m\x07 \x1b]0;título\x07\x1b]8;;http://x\x1b\\.exe\x7f')).toEqual([
    { command: 'cat txt .exe', at: '0' },
  ])
  expect(partsOf('! a b⁥c\td')).toEqual([{ command: 'a b⁥c\td', at: '0' }])
})

test('a command that is nothing once cleaned is none', () => {
  expect(partsOf('! ​')).toEqual([{ text: '! ​' }])
})

test('the drawing refuses escape sequences and every control character but the newline and the tab', () => {
  expect('\x1b[31mred\x1b[0m \x1b]0;t\x07x\x1b]8;;u\x1b\\y \x1bM z'.replace(CONTROL, '')).toBe('red xy  z')
  expect('a\tb\nc\x00d\x08e\x0bf\x1fg\x7fh'.replace(CONTROL, '')).toBe('a\tb\ncdefgh')
})
