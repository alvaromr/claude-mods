import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, RenderNode, RenderSurface } from 'claude-code'

import { stage } from './stage'
import type { Drawn } from './stage'

// Claude Code beneath: each text the mod hands on, drawn as it is.
const beneath = (on: On) => {
  const handed: string[] = []

  on('ui.render', { component: 'AssistantMessage' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    handed.push(e.props.text)

    return <Text>{e.props.text}</Text>
  })

  return handed
}

const said = ($: Engine, text: string, surface: RenderSurface = 'terminal') =>
  $.ui.mount({
    plugin: 'ui-colorify',
    surface,
    component: 'AssistantMessage',
    props: { text, isFirstOfReply: true },
    viewport: { columns: 40, rows: 20, isFullscreen: false },
  })

// Every element of a drawn tree, depth first.
const elements = (node: RenderNode): Drawn[] =>
  typeof node === 'string' ? [] : [node, ...(((node as Drawn).children ?? []) as RenderNode[]).flatMap(elements)]

const boxes = async (ui: Awaited<ReturnType<typeof said>>) =>
  elements(await ui.drawn()).filter(el => el.type === 'Box' && 'borderStyle' in (el.props ?? {}))

const WARNING = 'Antes de nada.\n\n> [!WARNING]\n> Si desactivas el mod, se ven grises.\n\nDespués, sigue.'

test('an alert is framed in its colour under its title, its marker gone, the text around it handed on', async ($, on) => {
  const { start } = stage(on)
  const handed = beneath(on)
  await start($)

  const ui = await said($, WARNING)

  expect(handed).toEqual(['Antes de nada.', 'Si desactivas el mod, se ven grises.', 'Después, sigue.'])
  expect((await ui.find({ type: 'Text', text: 'Advertencia' }))?.props).toMatchObject({
    weight: 'semibold',
    color: 'warning',
  })
  expect((await boxes(ui)).map(box => box.props)).toEqual([
    expect.objectContaining({ borderStyle: 'round', borderColor: 'warning' }),
  ])
  await ui.unmount()
})

test('each alert has its own colour and title, a lower-case marker too', async ($, on) => {
  const { start } = stage(on)
  beneath(on)
  await start($)

  const cases = [
    ['NOTE', 'Nota', 'suggestion'],
    ['tip', 'Consejo', 'success'],
    ['IMPORTANT', 'Importante', 'merged'],
    ['WARNING', 'Advertencia', 'warning'],
    ['CAUTION', 'Precaución', 'error'],
  ] as const

  for (const [marker, title, color] of cases) {
    const ui = await said($, `> [!${marker}]\n> Texto.`)

    expect((await ui.find({ type: 'Text', text: title }))?.props.color, marker).toBe(color)
    await ui.unmount()
  }
})

test('a quote without a marker is framed gray with no title, its ⧉ beside its text', async ($, on) => {
  const { start } = stage(on)
  const handed = beneath(on)
  await start($)

  const ui = await said($, '> Una cita\n> de dos líneas.')

  expect(handed).toEqual(['Una cita\nde dos líneas.'])
  expect((await boxes(ui)).map(box => box.props?.borderColor)).toEqual(['subtle'])
  expect(await ui.find({ key: 'copy-0' })).toBeDefined()
  await ui.unmount()
})

test('the ⧉ copies the text as written, without the marker or the quote marks', async ($, on) => {
  const { it, start } = stage(on)
  beneath(on)
  await start($)

  const ui = await said($, '> [!TIP]\n> Usa `pnpm fix`.\n>\n> Y después `pnpm check`.')

  await ui.press({ key: 'copy-0' })
  expect(it.copied).toEqual(['Usa `pnpm fix`.\n\nY después `pnpm check`.'])
  expect(it.toasts).toEqual(['Texto copiado'])
  await ui.unmount()
})

test('a heading is drawn bold in its colour, its code and bold marks taken off', async ($, on) => {
  const { start } = stage(on)
  const handed = beneath(on)
  await start($)

  const ui = await said($, '## Cambios en `register.tsx` y **settings** ##\nEl texto.')

  expect((await ui.find({ type: 'Text', text: 'Cambios en register.tsx y settings' }))?.props).toMatchObject({
    weight: 'semibold',
    color: 'suggestion',
  })
  expect(handed).toEqual(['El texto.'])
  await ui.unmount()
})

test('what a code fence holds, an alert or a heading, is handed on whole', async ($, on) => {
  const { start } = stage(on)
  const handed = beneath(on)
  await start($)

  const fenced = '```\n## No es un título\n> [!IMPORTANT]\n> No es una alerta.\n```'
  const ui = await said($, fenced)

  expect(handed).toEqual([fenced])
  await ui.unmount()
})

test('a marker with text on its line is no alert: a quote, the marker kept', async ($, on) => {
  const { start } = stage(on)
  const handed = beneath(on)
  await start($)

  const ui = await said($, '> [!NOTE] en la misma línea')

  expect(handed).toEqual(['[!NOTE] en la misma línea'])
  expect((await boxes(ui)).map(box => box.props?.borderColor)).toEqual(['subtle'])
  await ui.unmount()
})

test('an alert set to lines has a line of its colour above and below, as wide as the row past the bullet', async ($, on) => {
  const { start } = stage(on, { looks: { CAUTION: { frame: 'lines' } } })
  beneath(on)
  await start($)

  const ui = await said($, '> [!CAUTION]\n> Borra la rama.')
  const lines = elements(await ui.drawn()).filter(el => el.type === 'Text' && String(el.children?.[0]).startsWith('─'))

  expect(lines.map(line => [line.props?.color, String(line.children?.[0]).length])).toEqual([
    ['error', 38],
    ['error', 38],
  ])
  expect(await boxes(ui)).toEqual([])
  await ui.unmount()
})

test('an alert set to title alone has no frame, and an empty title leaves the text alone', async ($, on) => {
  const { start } = stage(on, { looks: { NOTE: { frame: 'title', title: '' } } })
  const handed = beneath(on)
  await start($)

  const ui = await said($, '> [!NOTE]\n> Un dato.')

  expect(handed).toEqual(['Un dato.'])
  expect(await boxes(ui)).toEqual([])
  expect(await ui.find({ type: 'Text', text: 'Nota' })).toBeUndefined()
  await ui.unmount()
})

test('an alert turned off goes beneath as written', async ($, on) => {
  const { start } = stage(on, { looks: { WARNING: { on: false } } })
  const handed = beneath(on)
  await start($)

  const ui = await said($, WARNING)

  expect(handed).toEqual([WARNING])
  await ui.unmount()
})

test('beside one drawn, an alert or a quote turned off goes beneath with its marker and its quote marks', async ($, on) => {
  const { start } = stage(on, { looks: { WARNING: { on: false }, QUOTE: { on: false } } })
  const handed = beneath(on)
  await start($)

  const ui = await said($, '> [!TIP]\n> Uno.\n\n> [!WARNING]\n> Dos\n> líneas.\n\n> Una cita.')

  expect(handed).toEqual(['Uno.', '> [!WARNING]\n> Dos\n> líneas.', '> Una cita.'])
  await ui.unmount()
})

test('with the whole mod off, a reply goes beneath as written', async ($, on) => {
  const { start } = stage(on, { on: false })
  const handed = beneath(on)
  await start($)

  const ui = await said($, '# Título\n> [!TIP]\n> Algo.')

  expect(handed).toEqual(['# Título\n> [!TIP]\n> Algo.'])
  await ui.unmount()
})

test('only the terminal is drawn on: the other surfaces get the reply as written', async ($, on) => {
  const { start } = stage(on)
  const handed = beneath(on)
  await start($)

  for (const surface of ['desktop', 'vscode', 'mobile'] as const) {
    const ui = await said($, WARNING, surface)

    expect(handed.at(-1), surface).toBe(WARNING)
    await ui.unmount()
  }
})
