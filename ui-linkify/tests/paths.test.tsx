import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

const HOME = '/Users/me'
const EXISTING = new Set([
  '/Users',
  '/Users/me',
  '/Users/me/Downloads',
  '/Users/me/Downloads/Notas de un viaje',
  '/Users/me/Downloads/Notas de un viaje/guion.md',
  '/Users/me/code/a (1).ts',
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

const CASES: readonly (readonly [written: string, drawn: string])[] = [
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

// The world the mod reads: a home and the paths above.
const machine = (on: On) => {
  mock.env(on, { HOME })
  on('fs.exists', ($, e) => ({ value: EXISTING.has(e.path) }))
}

// The text of an assistant message as the mod hands it on to be drawn.
const handedOn = (on: On) => {
  const it = { text: '' }

  on('ui.render', { component: 'AssistantMessage' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    it.text = e.props.text

    return <Text>{e.props.text}</Text>
  })

  return it
}

const said = ($: Engine, text: string, surface: 'terminal' | 'desktop' | 'vscode' | 'mobile' = 'terminal') =>
  $.ui.mount({ plugin: 'ui-linkify', surface, component: 'AssistantMessage', props: { text, isFirstOfReply: true } })

test('links the existing paths of an assistant message', async ($, on) => {
  machine(on)
  const drawn = handedOn(on)

  for (const surface of ['terminal', 'desktop', 'vscode'] as const) {
    for (const [written, expected] of CASES) {
      const ui = await said($, written, surface)

      expect(drawn.text, `${surface}: ${written}`).toBe(expected)
      await ui.unmount()
    }
  }
})

test('each path is looked for once, however often its message is drawn', async ($, on) => {
  mock.env(on, { HOME })

  const asked: string[] = []

  on('fs.exists', (_, e) => (asked.push(e.path), { value: true }))
  handedOn(on)

  await (await said($, 'en /etc/hosts')).unmount()
  await (await said($, 'en /etc/hosts')).unmount()
  expect(asked.filter(path => path === '/etc/hosts')).toHaveLength(1)

  // A code span that is no path is not looked for at all.
  await (await said($, '`README.md`')).unmount()
  expect(asked).not.toContain('README.md')
})

test('leaves the text alone on the phone', async ($, on) => {
  machine(on)
  const drawn = handedOn(on)

  await said($, 'en /etc/hosts', 'mobile')
  expect(drawn.text).toBe('en /etc/hosts')
})

test('a path named before it is written is linked once it is there', async ($, on) => {
  const clock = mock.clock(on)
  machine(on)
  const drawn = handedOn(on)

  await (await said($, 'escribo ~/plan.md')).unmount()
  expect(drawn.text).toBe('escribo ~/plan.md')

  EXISTING.add('/Users/me/plan.md')
  await clock.advance(5000)
  await said($, 'ya está en ~/plan.md')
  expect(drawn.text).toBe('ya está en [~/plan.md](file:///Users/me/plan.md)')
  EXISTING.delete('/Users/me/plan.md')
})

test('a path not there yet does not link its folder, and a path ends only where its name does', async ($, on) => {
  machine(on)
  const drawn = handedOn(on)

  for (const written of [
    'crea /Users/me/Downloads/.env',
    'crea ~/Downloads/_x y ~/.claude/foo.md',
    'o /Users/me/Downloads.bak',
  ]) {
    await (await said($, written)).unmount()
    expect(drawn.text, written).toBe(written)
  }
})

test('a path is linked before the quotes, brackets and dashes of typography', async ($, on) => {
  machine(on)
  const drawn = handedOn(on)
  const folder = '[/Users/me/Downloads](file:///Users/me/Downloads)'

  for (const [written, expected] of [
    ['“/Users/me/Downloads”', `“${folder}”`],
    ['‘/Users/me/Downloads’', `‘${folder}’`],
    ['/Users/me/Downloads—luego', `${folder}—luego`],
    ['/Users/me/Downloads… y más', `${folder}… y más`],
    ['{/Users/me/Downloads} y [/Users/me/Downloads]', `{${folder}} y [${folder}]`],
    ['ruta=/Users/me/Downloads|otra', `ruta=${folder}|otra`],
  ] as const) {
    await (await said($, written)).unmount()
    expect(drawn.text, written).toBe(expected)
  }
})

test('without a home, a ~/ path is not linked as the one at the root', async ($, on) => {
  mock.env(on, {})
  on('fs.exists', (_, e) => ({ value: e.path === '/etc' }))
  const drawn = handedOn(on)

  await (await said($, 'mira ~/etc y `~/etc` y /etc')).unmount()

  expect(drawn.text).toBe('mira ~/etc y `~/etc` y [/etc](file:///etc)')
})
