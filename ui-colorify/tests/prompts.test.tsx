import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, PromptOrigin, RenderNode } from 'claude-code'

import { stage } from './stage'
import type { Drawn } from './stage'

const ROW = '❯ Hola'

// Claude Code's own row beneath.
const beneath = (on: On) =>
  on('ui.render', { component: 'UserMessage' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>{`❯ ${e.props.text}`}</Text>
  })

const typed = ($: Engine, origin: PromptOrigin = { kind: 'composer' }) =>
  $.ui.mount({
    plugin: 'ui-colorify',
    surface: 'terminal',
    component: 'UserMessage',
    props: { text: 'Hola', origin, isExpanded: true },
    viewport: { columns: 30, rows: 20, isFullscreen: false },
  })

const children = (node: RenderNode | Drawn | undefined) => ((node as Drawn | undefined)?.children ?? []) as Drawn[]

// The drawing, its rows as the text each holds, a line's colour beside it.
const rows = async (ui: Awaited<ReturnType<typeof typed>>) => {
  const drawn = (await ui.drawn()) as Drawn

  return { drawn, rows: children(drawn).map(row => [row.props?.color, row.children?.[0]]) }
}

test('by default a prompt goes between two lavender lines as wide as the row, the row itself kept', async ($, on) => {
  const { start } = stage(on)
  beneath(on)
  await start($)

  const ui = await typed($)

  expect((await rows(ui)).rows).toEqual([
    ['permission', '─'.repeat(30)],
    [undefined, ROW],
    ['permission', '─'.repeat(30)],
  ])
  await ui.unmount()
})

test('dashed lines of a fixed colour', async ($, on) => {
  const { start } = stage(on, { prompts: { frame: 'lines', color: '#7a8aa6', dashed: true } })
  beneath(on)
  await start($)

  const ui = await typed($)

  expect((await rows(ui)).rows[0]).toEqual(['#7a8aa6', '╌'.repeat(30)])
  await ui.unmount()
})

test('a box of the colour around the row, dashed when asked', async ($, on) => {
  const { start } = stage(on, { prompts: { frame: 'box', color: 'success', dashed: true } })
  beneath(on)
  await start($)

  const ui = await typed($)
  const { drawn, rows: inside } = await rows(ui)

  expect(drawn.props).toMatchObject({ borderStyle: 'dashed', borderColor: 'success' })
  expect(inside).toEqual([[undefined, ROW]])
  await ui.unmount()
})

for (const [why, saved, origin] of [
  ['set to normal', { prompts: { frame: 'normal' } }, undefined],
  ['of another agent', undefined, { kind: 'unclassified' }],
  ['with the mod off', { on: false }, undefined],
] as const) {
  test(`a prompt ${why} is drawn as Claude Code draws it`, async ($, on) => {
    const { start } = stage(on, saved)
    beneath(on)
    await start($)

    const ui = await typed($, origin)

    expect(((await ui.drawn()) as Drawn).children).toEqual([ROW])
    await ui.unmount()
  })
}
