import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'
import { jira, SITE } from './jira'

const BROWSE = `${SITE}/browse`

const CASES: readonly (readonly [written: string, drawn: string])[] = [
  ['Fixes ABC-22133.', `Fixes [ABC-22133](${BROWSE}/ABC-22133).`],
  ['ABC-1 and ABC-2', `[ABC-1](${BROWSE}/ABC-1) and [ABC-2](${BROWSE}/ABC-2)`],
  ['See `ABC-18510` now', `See [\`ABC-18510\`](${BROWSE}/ABC-18510) now`],
  [`[ABC-7](${BROWSE}/ABC-7)`, `[ABC-7](${BROWSE}/ABC-7)`],
  [`${BROWSE}/ABC-7`, `${BROWSE}/ABC-7`],
  ['`git checkout ABC-7-fix`', '`git checkout ABC-7-fix`'],
  ['```\nABC-7\n```', '```\nABC-7\n```'],
  ['UTF-8, SHA-256 and PABC-9', 'UTF-8, SHA-256 and PABC-9'],
]

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

const SURFACES = ['terminal', 'desktop', 'vscode', 'mobile'] as const

const said = ($: Engine, text: string, surface: (typeof SURFACES)[number] = 'terminal') =>
  $.ui.mount({ plugin: 'ui-linkify', surface, component: 'AssistantMessage', props: { text, isFirstOfReply: true } })

test('links the tickets of an assistant message on every surface', async ($, on) => {
  const begin = jira(on)
  const drawn = handedOn(on)

  await begin($)

  for (const surface of SURFACES) {
    for (const [written, expected] of CASES) {
      const ui = await said($, written, surface)

      expect(drawn.text, `${surface}: ${written}`).toBe(expected)
      await ui.unmount()
    }
  }
})

test('reads the site and the keys as they were typed', async ($, on) => {
  const begin = jira(on, { site: ` ${SITE}/ `, keys: 'abc, ops' })
  const drawn = handedOn(on)

  await begin($)
  await said($, 'ABC-1 and OPS-2, not XYZ-3')
  expect(drawn.text).toBe(`[ABC-1](${BROWSE}/ABC-1) and [OPS-2](${BROWSE}/OPS-2), not XYZ-3`)
})

test('takes a site served over plain http', async ($, on) => {
  const begin = jira(on, { site: 'http://jira.local', keys: 'ABC' })
  const drawn = handedOn(on)

  await begin($)
  await said($, 'Fixes ABC-1.')
  expect(drawn.text).toBe('Fixes [ABC-1](http://jira.local/browse/ABC-1).')
})

// Settings that leave out the site or the keys, hold what is neither, or turn Jira off.
const UNSET: readonly Record<string, unknown>[] = [
  {},
  { site: SITE },
  { keys: 'ABC' },
  { site: 'example.atlassian.net', keys: 'ABC' },
  { site: SITE, keys: 'a.c' },
  { site: SITE, keys: 'ABC', jira: false },
  { site: 'https://example atlassian.net', keys: 'ABC' },
  { site: 'https://example.atlassian.net/(x)', keys: 'ABC' },
  { site: SITE, keys: '1ABC' },
]

for (const saved of UNSET) {
  test(`links nothing until a site and a key are set, and Jira on: ${JSON.stringify(saved)}`, async ($, on) => {
    const begin = jira(on, saved)
    const drawn = handedOn(on)

    await begin($)
    await said($, 'Fixes ABC-1.')
    expect(drawn.text).toBe('Fixes ABC-1.')
  })
}

test('links the tickets of the person’s own prompt on every surface', async ($, on) => {
  const begin = jira(on)
  let passed = 0

  on('ui.render', { component: 'UserMessage' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    passed += 1

    return <Text>{e.props.text}</Text>
  })
  await begin($)

  for (const surface of SURFACES) {
    const prompt = (text: string, kind: 'composer' | 'bridge' | 'task-notification' = 'composer') =>
      $.ui.mount({
        plugin: 'ui-linkify',
        surface,
        component: 'UserMessage',
        props: { text, origin: { kind }, isExpanded: false },
      })

    const ui = await prompt(`fix ABC-1 like ${BROWSE}/ABC-2 and\nABC-3`)
    const links = await ui.findAll({ type: 'Link' })

    expect(
      links.map(found => [found.children, found.props.href]),
      surface,
    ).toEqual([
      [['ABC-1'], `${BROWSE}/ABC-1`],
      [['ABC-3'], `${BROWSE}/ABC-3`],
    ])
    expect(await ui.find({ text: /^fix $/ }), surface).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /fix .* and\n/ }), surface).toBeDefined()
    expect(passed, surface).toBe(0)
    await ui.unmount()

    // A prompt typed on a phone or the web is the person's own too.
    const bridged = await prompt('fix ABC-1', 'bridge')

    expect(
      (await bridged.findAll({ type: 'Link' })).map(found => found.props.href),
      surface,
    ).toEqual([`${BROWSE}/ABC-1`])
    await bridged.unmount()

    await (await prompt('nothing to link, UTF-8')).unmount()
    await (await prompt('task ABC-1 done', 'task-notification')).unmount()
    expect(passed, surface).toBe(2)
    passed = 0
  }
})
