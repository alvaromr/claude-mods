import { expect, test } from 'claude-code/testing'

import { fileUrl, linkPaths } from '../hooks/path-links'

const HOME = '/Users/me'
const EXISTING = new Set([
  '/Users',
  '/Users/me',
  '/Users/me/Downloads',
  '/Users/me/Downloads/Notas de un viaje',
  '/Users/me/Downloads/Notas de un viaje/guion.md',
  '/Users/me/code/a (1).ts',
  '/etc',
  '/etc/hosts',
  // Names that are no ordinary path: brackets, a leading slash or space, a trailing space, a line break, a space before a slash.
  '/Users/me/b[1].txt',
  '//etc/hosts',
  '/ x',
  '/Users/me/Trailing ',
  '/Users/me/a\nb',
  '/Users/me/dir /sub',
  '/sub',
  'README.md',
])

const GUION = 'file:///Users/me/Downloads/Notas%20de%20un%20viaje/guion.md'
const FOLDER = '[/Users/me/Downloads](file:///Users/me/Downloads)'

// The paths above exist; every path asked is noted.
const machine = () => {
  const asked: string[] = []

  return {
    asked,
    exists: (path: string) => {
      asked.push(path)

      return Promise.resolve(EXISTING.has(path))
    },
  }
}

test('links the paths that exist, bare or in a code span, and leaves the rest as written', async () => {
  const cases: readonly (readonly [written: string, drawn: string])[] = [
    [
      'el texto en ~/Downloads/Notas de un viaje/guion.md. Para cambiar alguna frase',
      `el texto en [~/Downloads/Notas de un viaje/guion.md](${GUION}). Para cambiar alguna frase`,
    ],
    [
      'Abre /Users/me/Downloads/Notas de un viaje/guion.md',
      `Abre [/Users/me/Downloads/Notas de un viaje/guion.md](${GUION})`,
    ],
    [
      'Mira `/etc/hosts:12` y /etc/hosts, ya',
      'Mira [`/etc/hosts:12`](file:///etc/hosts) y [/etc/hosts](file:///etc/hosts), ya',
    ],
    ['en ~/code/a (1).ts', 'en [~/code/a (1).ts](file:///Users/me/code/a%20%281%29.ts)'],
    ['«~/Downloads»', '«[~/Downloads](file:///Users/me/Downloads)»'],
    ['no existe /tmp/nada ni ~/nada', 'no existe /tmp/nada ni ~/nada'],
    ['`cat /etc/hosts`', '`cat /etc/hosts`'],
    ['```\n/etc/hosts\n```', '```\n/etc/hosts\n```'],
    ['[hosts](/etc/hosts) y https://x.com/etc/hosts', '[hosts](/etc/hosts) y https://x.com/etc/hosts'],
    ['y/o 1 / 2', 'y/o 1 / 2'],
    ['https://x.com/a?f=/etc/hosts', 'https://x.com/a?f=/etc/hosts'],
    ['foo/etc/hosts', 'foo/etc/hosts'],
    ['x //etc/hosts', 'x //etc/hosts'],
    ['a / x', 'a / x'],
    ['`README.md`', '`README.md`'],
    ['ver /Users/me/Trailing ', 'ver /Users/me/Trailing '],
    ['abre /Users/me/a\nb', 'abre /Users/me/a\nb'],
    ['</etc/hosts>', '<[/etc/hosts](file:///etc/hosts)>'],
    ['`/etc/hosts:12:3`', '[`/etc/hosts:12:3`](file:///etc/hosts)'],
    ['ver ~/b[1].txt', 'ver [~/b\\[1\\].txt](file:///Users/me/b%5B1%5D.txt)'],
    ['ver ~/dir /sub ok', 'ver [~/dir /sub](file:///Users/me/dir%20/sub) ok'],
  ]

  for (const [written, drawn] of cases) {
    expect(await linkPaths(machine().exists, HOME, written), written).toBe(drawn)
  }
})

test('a path is linked before the quotes, brackets and dashes of typography', async () => {
  for (const [written, drawn] of [
    ['“/Users/me/Downloads”', `“${FOLDER}”`],
    ['‘/Users/me/Downloads’', `‘${FOLDER}’`],
    ['/Users/me/Downloads—luego', `${FOLDER}—luego`],
    ['/Users/me/Downloads… y más', `${FOLDER}… y más`],
    ['{/Users/me/Downloads} y [/Users/me/Downloads]', `{${FOLDER}} y [${FOLDER}]`],
    ['ruta=/Users/me/Downloads|otra', `ruta=${FOLDER}|otra`],
    ['/Users/me/Downloads>', `${FOLDER}>`],
    ['*/Users/me/Downloads*', `*${FOLDER}*`],
    ['_/Users/me/Downloads_', `_${FOLDER}_`],
    ['¿/Users/me/Downloads? ¡/Users/me/Downloads!', `¿${FOLDER}? ¡${FOLDER}!`],
    ['«/Users/me/Downloads»; (/Users/me/Downloads): "/Users/me/Downloads"', `«${FOLDER}»; (${FOLDER}): "${FOLDER}"`],
    ["'/Users/me/Downloads', /Users/me/Downloads`", `'${FOLDER}', ${FOLDER}\``],
  ] as const) {
    expect(await linkPaths(machine().exists, HOME, written), written).toBe(drawn)
  }
})

test('a path not there yet does not link its folder, and a path ends only where its name does', async () => {
  for (const written of [
    'crea /Users/me/Downloads/.env',
    'crea ~/Downloads/_x y ~/.claude/foo.md',
    'o /Users/me/Downloads.bak',
    'o /Users/me/Downloads,x',
    'o /Users/me/Downloads*x',
  ]) {
    expect(await linkPaths(machine().exists, HOME, written), written).toBe(written)
  }

  // The same ends, before a space or another end, do end it.
  expect(
    await linkPaths(machine().exists, HOME, '/Users/me/Downloads. Y /Users/me/Downloads.. Y /Users/me/Downloads,'),
  ).toBe(`${FOLDER}. Y ${FOLDER}.. Y ${FOLDER},`)
})

test('a path is looked for within the first 300 characters of its line only', async () => {
  const far = `/Users/me/Downloads${'x'.repeat(290)}`
  const fine = machine()

  expect(await linkPaths(fine.exists, HOME, far)).toBe(far)
  // Only the first 300 characters are tried, and no name ends inside them.
  expect(fine.asked).toEqual([far.slice(0, 300)])
})

test('a path is looked for within its line, and only once a name may end', async () => {
  const fine = machine()

  await linkPaths(fine.exists, HOME, '/etc/hosts\n/sub and more')
  expect(fine.asked).not.toContain('/etc/hosts\n/sub')
  expect(fine.asked.every(path => !path.includes('\n'))).toBe(true)
})

test('what the file system does not know is asked of it, home resolved, and a path inside a link is not asked', async () => {
  const fine = machine()

  await linkPaths(fine.exists, HOME, 'ver `~/Downloads:3` y [x](/etc/hosts) y ```\n/etc/hosts\n``` y `~/nada:1:2`')
  expect(fine.asked).toEqual(['/Users/me/Downloads', '/Users/me/nada'])
})

test('without a home, a ~/ path is not linked as the one at the root, in a code span or bare', async () => {
  const exists = (path: string) => Promise.resolve(path === '/etc')

  expect(await linkPaths(exists, '', 'mira ~/etc y `~/etc` y /etc')).toBe('mira ~/etc y `~/etc` y [/etc](file:///etc)')
})

test('a path is a link as the system opens it: encoded by part, parentheses too', () => {
  expect(fileUrl('/Users/me/a (1)/b c.ts')).toBe('file:///Users/me/a%20%281%29/b%20c.ts')
  expect(fileUrl('/tmp/é#?.png')).toBe('file:///tmp/%C3%A9%23%3F.png')
})

test('a label with brackets is escaped inside its link', async () => {
  expect(await linkPaths(machine().exists, HOME, '~/b[1].txt')).toBe('[~/b\\[1\\].txt](file:///Users/me/b%5B1%5D.txt)')
})
