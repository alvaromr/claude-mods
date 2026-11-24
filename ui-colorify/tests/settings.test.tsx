import { expect, test } from 'claude-code/testing'
import type { Engine, Mounted } from 'claude-code/testing'
import type { On } from 'claude-code'

import { ROOT, stage } from './stage'

const PANE = {
  plugin: 'ui-colorify',
  component: 'Pane',
  requestId: 'colorify',
  props: {
    title: 'Colores',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

// The footer beneath, with another mod's button in the first slot row; the
// panes recorded; a reply drawn as the text it is handed.
const footer = (on: On) => {
  const it = { open: new Set<string>(), handed: [] as string[] }

  // As on a terminal too narrow for a pane nobody asked for: an open is placed
  // only while the press that asked for it is still running.
  let pressing = 0
  on('ui.press', { plugin: '*' }, async (_, e, next) => {
    pressing++
    try {
      return await next(e)
    } finally {
      pressing--
    }
  })
  on('ui.open', (_, e) =>
    pressing > 0
      ? (it.open.add(e.id), { value: { isPlaced: true } })
      : { value: { isPlaced: false, reason: 'unasked' } },
  )
  on('ui.close', (_, e) => (it.open.delete(e.id), { value: undefined }))
  on('ui.panes', () => ({
    value: [...it.open].map(id => ({ id, title: id, isShown: true, isFocused: false, isPlaced: true })),
  }))
  on('ui.render', { component: 'SessionMode' }, ($, e) => {
    const { Box, Button } = $.ui.resolve(e)

    return (
      <Box width="100%">
        <Box key="slot:1.1:other">
          <Button key="other" plain label="other" onPress={() => undefined} />
        </Box>
      </Box>
    )
  })
  on('ui.render', { component: 'AssistantMessage' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    it.handed.push(e.props.text)

    return <Text>{e.props.text}</Text>
  })

  return it
}

const bar = ($: Engine) =>
  $.ui.mount({ plugin: 'ui-colorify', surface: 'terminal', component: 'SessionMode', props: { modes: [] } })

const header = async (pane: Mounted<'terminal', 'Pane'>) => (await pane.find({ type: 'Text', text: /^Ajustes/ }))?.text

const said = async ($: Engine, text: string) =>
  (
    await $.ui.mount({
      plugin: 'ui-colorify',
      surface: 'terminal',
      component: 'AssistantMessage',
      props: { text, isFirstOfReply: true },
    })
  ).unmount()

test("the button goes after the first slot row's others and opens and closes the pane", async ($, on) => {
  const { start } = stage(on)
  const it = footer(on)
  await start($)

  const ui = await bar($)

  expect((await ui.findAll({ type: 'Button' })).map(button => button.props.label ?? button.text)).toEqual([
    'other',
    '● colorify',
  ])
  await ui.press({ key: 'colorify' })
  expect([...it.open]).toEqual(['colorify'])
  await ui.press({ key: 'colorify' })
  expect([...it.open]).toEqual([])
  await ui.unmount()
})

test("the switch turns the whole mod off for the session, the button's dot gray", async ($, on) => {
  const { start } = stage(on)
  const it = footer(on)
  await start($)

  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const ui = await bar($)

  await pane.press({ key: 'on' })
  expect((await ui.find({ key: 'colorify' }))?.text).toBe('○ colorify')
  expect((await ui.find({ type: 'Text', text: '○' }))?.props.color).toBe('inactive')
  expect(await header(pane)).toBe('Ajustes por defecto · cambios sin guardar')

  await said($, '> [!TIP]\n> Algo.')
  expect(it.handed).toEqual(['> [!TIP]\n> Algo.'])

  // Back on: as the defaults, nothing unsaved.
  await pane.press({ key: 'on' })
  expect(await header(pane)).toBe('Ajustes por defecto')
  await pane.unmount()
  await ui.unmount()
})

test("an alert's colour, frame, switch and title change from the pane; a title past 30 characters is refused", async ($, on) => {
  const { it, start } = stage(on)
  footer(on)
  await start($)

  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })

  await pane.press({ key: 'color-WARNING-error' })
  await pane.press({ key: 'frame-WARNING-lines' })
  await pane.input({ key: 'title-WARNING', text: '  Ojo  ' })
  await pane.input({ key: 'title-WARNING', text: 'x'.repeat(31) })
  expect(it.toasts).toEqual(['Un título de hasta 30 caracteres'])

  const reply = await $.ui.mount({
    plugin: 'ui-colorify',
    surface: 'terminal',
    component: 'AssistantMessage',
    props: { text: '> [!WARNING]\n> Cuidado.', isFirstOfReply: false },
  })

  expect((await reply.find({ type: 'Text', text: 'Ojo' }))?.props.color).toBe('error')
  expect(await reply.find({ type: 'Text', text: /^─+$/ })).toBeDefined()
  await reply.unmount()

  await pane.press({ key: 'on-WARNING' })
  expect(await pane.find({ key: 'on-WARNING' })).toMatchObject({ text: '□ Colorear' })
  await pane.unmount()
})

test("the dashed switch shows for a prompt's box or lines, not for normal", async ($, on) => {
  const { start } = stage(on)
  footer(on)
  await start($)

  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })

  expect(await pane.find({ key: 'dashed-prompts' })).toBeDefined()
  await pane.press({ key: 'frame-prompts-normal' })
  expect(await pane.find({ key: 'dashed-prompts' })).toBeUndefined()
  await pane.unmount()
})

test('settings saved as global are kept for the next session; reset brings the defaults back unsaved', async ($, on) => {
  const { start } = stage(on)
  footer(on)
  await start($)

  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })

  await pane.press({ key: 'color-headings-error' })
  await pane.press({ key: 'save-global' })
  expect(await header(pane)).toBe('Ajustes globales')
  await start($)
  expect(await pane.find({ type: 'Text', text: '  rojo  ' })).toBeDefined()

  await pane.press({ key: 'reset' })
  expect(await header(pane)).toBe('Ajustes globales · cambios sin guardar')
  await pane.unmount()
})

test("a project's own settings win over the global ones, until forgotten", async ($, on) => {
  const { start } = stage(on, { headings: { color: 'success' } }, { [`settings:${ROOT}`]: { on: false } })
  footer(on)
  await start($)

  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })

  expect(await header(pane)).toBe('Ajustes de este proyecto')
  expect((await pane.find({ key: 'on' }))?.text).toBe('□ Activado')

  await pane.press({ key: 'forget-project' })
  expect(await header(pane)).toBe('Ajustes globales')
  expect((await pane.find({ key: 'on' }))?.text).toBe('■ Activado')
  expect(await pane.find({ key: 'forget-project' })).toBeUndefined()
  await pane.unmount()
})

test('saving for the project keeps the global ones apart', async ($, on) => {
  const { start } = stage(on)
  footer(on)
  await start($)

  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })

  await pane.press({ key: 'frame-prompts-box' })
  await pane.press({ key: 'save-project' })
  expect(await header(pane)).toBe('Ajustes de este proyecto')
  await start($)
  expect(await header(pane)).toBe('Ajustes de este proyecto')
  expect(await pane.find({ type: 'Text', text: '  caja  ' })).toBeDefined()

  // Forgotten, nothing global was saved: the defaults.
  await pane.press({ key: 'forget-project' })
  expect(await header(pane)).toBe('Ajustes por defecto')
  await pane.unmount()
})

test("a reload's start keeps the session's unsaved changes", async ($, on) => {
  const { start } = stage(on)
  footer(on)
  await start($)

  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })

  await pane.press({ key: 'frame-prompts-box' })
  await start($)
  expect(await header(pane)).toBe('Ajustes por defecto · cambios sin guardar')
  expect(await pane.find({ type: 'Text', text: '  caja  ' })).toBeDefined()
  await pane.unmount()
})

test('a saved value of another type or out of its options takes its default', async ($, on) => {
  const { start } = stage(on, {
    on: 'yes',
    looks: { NOTE: { frame: 'circle', color: 3, title: 'Dato' }, TIP: 'nope' },
    prompts: { frame: 'background' },
  })
  footer(on)
  await start($)

  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })

  expect((await pane.find({ key: 'on' }))?.text).toBe('■ Activado')
  expect(await pane.find({ key: 'title-NOTE' })).toMatchObject({ props: { value: 'Dato' } })
  expect(await pane.find({ key: 'frame-NOTE-box' })).toBeUndefined()
  expect(await pane.find({ key: 'frame-prompts-lines' })).toBeUndefined()
  await pane.unmount()
})
