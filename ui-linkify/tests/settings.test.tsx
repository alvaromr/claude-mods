import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { jira, SITE } from './jira'

const PANE = {
  plugin: 'ui-linkify',
  component: 'Pane',
  requestId: 'linkify',
  props: {
    title: 'Enlaces',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

// The engine beneath: the footer's own row, then a slot row another mod laid,
// its button first; an assistant message drawn as the text it is handed; the
// panes and toasts recorded.
const stage = (on: On) => {
  const it = { open: new Set<string>(), titles: [] as (string | undefined)[], toasts: [] as string[], text: '' }

  on('fs.exists', ($, e) => ({ value: e.path === '/etc/hosts' }))
  on('ui.toast', (_, e) => (it.toasts.push(e.text), { value: undefined }))
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
      ? (it.open.add(e.id), it.titles.push(e.title), { value: { isPlaced: true } })
      : { value: { isPlaced: false, reason: 'unasked' } },
  )
  on('ui.close', (_, e) => (it.open.delete(e.id), { value: undefined }))
  on('ui.panes', () => ({
    value: [...it.open].map(id => ({ id, title: id, isShown: true, isFocused: false, isPlaced: true })),
  }))
  on('ui.render', { component: 'SessionMode' }, ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        <Text>beneath</Text>
        <Box width="100%">
          <Box key="slot:1.1:other">
            <Button key="other" plain label="other" onPress={() => undefined} />
          </Box>
        </Box>
      </Box>
    )
  })
  on('ui.render', { component: 'AssistantMessage' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    it.text = e.props.text

    return <Text>{e.props.text}</Text>
  })

  return it
}

const said = async ($: Engine, text: string) =>
  (
    await $.ui.mount({
      plugin: 'ui-linkify',
      surface: 'terminal',
      component: 'AssistantMessage',
      props: { text, isFirstOfReply: true },
    })
  ).unmount()

test("the button goes after the first slot row's others and opens and closes the pane", async ($, on) => {
  const begin = jira(on)
  const it = stage(on)

  await begin($)

  const footer = await $.ui.mount({
    plugin: 'ui-linkify',
    surface: 'terminal',
    component: 'SessionMode',
    props: { modes: [] },
  })

  expect((await footer.findAll({ type: 'Button' })).map(button => button.props.label ?? button.text)).toEqual([
    'other',
    '● linkify',
  ])
  await footer.press({ key: 'linkify' })
  expect([...it.open]).toEqual(['linkify'])
  expect(it.titles).toEqual(['Enlaces'])
  await footer.press({ key: 'linkify' })
  expect([...it.open]).toEqual([])
})

test("the button's dot is full and green while some part links or draws, hollow and gray while none does", async ($, on) => {
  const none = { paths: false, jira: false, images: false, draft: false, commands: false }
  const begin = jira(on, { site: SITE, keys: 'ABC', ...none })
  stage(on)

  await begin($)

  const footer = await $.ui.mount({
    plugin: 'ui-linkify',
    surface: 'terminal',
    component: 'SessionMode',
    props: { modes: [] },
  })

  expect((await footer.find({ key: 'linkify' }))?.text).toBe('○ linkify')
  expect((await footer.find({ type: 'Text', text: '○' }))?.props.color).toBe('inactive')
})

test('a footer drawn before session.start reached the mod shows the defaults, and the saved settings from the start', async ($, on) => {
  const clock = mock.clock(on)
  const none = { paths: false, jira: false, images: false, draft: false, commands: false }
  const begin = jira(on, { site: SITE, keys: 'ABC', ...none })
  stage(on)

  const footer = await $.ui.mount({
    plugin: 'ui-linkify',
    surface: 'terminal',
    component: 'SessionMode',
    props: { modes: [] },
  })

  // Drawing writes no state, so it starts nothing: the settings wait.
  await clock.settle()
  expect((await footer.find({ key: 'linkify' }))?.text).toBe('● linkify')

  await begin($)
  expect((await footer.find({ key: 'linkify' }))?.text).toBe('○ linkify')
})

for (const part of ['paths', 'jira', 'images', 'draft', 'commands'] as const) {
  test(`the button's dot is full while ${part} alone is on`, async ($, on) => {
    const off = { paths: false, jira: false, images: false, draft: false, commands: false }
    const begin = jira(on, { site: SITE, keys: 'ABC', ...off, [part]: true })
    stage(on)

    await begin($)

    const footer = await $.ui.mount({
      plugin: 'ui-linkify',
      surface: 'terminal',
      component: 'SessionMode',
      props: { modes: [] },
    })

    expect((await footer.find({ key: 'linkify' }))?.text).toBe('● linkify')
    await footer.unmount()
  })
}

test('each part turns off on its own in the pane, for the session, and the Jira fields refuse what is neither', async ($, on) => {
  const begin = jira(on)
  const it = stage(on)

  await begin($)

  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })

  await said($, 'ABC-1 en /etc/hosts')
  expect(it.text).toBe(`[ABC-1](${SITE}/browse/ABC-1) en [/etc/hosts](file:///etc/hosts)`)

  await pane.press({ key: 'paths' })
  await said($, 'ABC-1 en /etc/hosts')
  expect(it.text).toBe(`[ABC-1](${SITE}/browse/ABC-1) en /etc/hosts`)
  expect((await pane.find({ type: 'Text', text: /^Ajustes/ }))?.text).toBe('Ajustes globales · cambios sin guardar')

  await pane.press({ key: 'jira' })
  await said($, 'ABC-1 en /etc/hosts')
  expect(it.text).toBe('ABC-1 en /etc/hosts')

  // A site that is no address is refused; the keys taken as written.
  await pane.press({ key: 'jira' })
  await pane.input({ key: 'site', text: 'empresa' })
  expect(it.toasts).toEqual(['Una dirección como https://empresa.atlassian.net'])
  await pane.input({ key: 'keys', text: 'abc, ops' })
  await said($, 'OPS-2')
  expect(it.text).toBe(`[OPS-2](${SITE}/browse/OPS-2)`)

  // Back as saved: nothing unsaved.
  await pane.input({ key: 'keys', text: 'ABC' })
  await pane.press({ key: 'paths' })
  expect((await pane.find({ type: 'Text', text: /^Ajustes/ }))?.text).toBe('Ajustes globales')
  await pane.unmount()
})

test('a pane saved as global is kept for the next session', async ($, on) => {
  const saved: Record<string, unknown> = {}
  mock.store(on, saved)
  stage(on)
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  const start = () => $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  await start()

  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })

  await pane.input({ key: 'site', text: SITE })
  await pane.input({ key: 'keys', text: 'ABC' })
  await pane.press({ key: 'save-global' })
  await start()
  expect((await pane.find({ type: 'Text', text: /^Ajustes/ }))?.text).toBe('Ajustes globales')
  expect((await pane.find({ key: 'keys' }))?.props.value).toBe('ABC')
  await pane.unmount()
})

test('the pane shows its fields in the mobile app too', async ($, on) => {
  const begin = jira(on)
  stage(on)
  await begin($)

  const pane = await $.ui.mount({ ...PANE, surface: 'mobile' })

  expect(await pane.find({ type: 'Input', key: 'site' })).toBeDefined()
  await pane.unmount()
})

test('keys are project keys separated by commas, and the fields may be emptied', async ($, on) => {
  const begin = jira(on)
  const it = stage(on)

  await begin($)

  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const keysRefusal = 'Claves de proyecto separadas por comas, como ABC, OPS'

  for (const text of ['1AB', 'AB C', 'ABC,', 'AB-1', '-']) {
    await pane.input({ key: 'keys', text })
  }

  expect(it.toasts).toEqual(Array(5).fill(keysRefusal))

  for (const key of ['site', 'keys']) {
    await pane.input({ key, text: '  ' })
    expect((await pane.find({ key }))?.props.value).toBe('')
  }

  await pane.input({ key: 'keys', text: 'A1_b , c2' })
  expect((await pane.find({ key: 'keys' }))?.props.value).toBe('A1_b , c2')
  expect(it.toasts).toHaveLength(5)
  await pane.unmount()
})

test('a size is a whole number from its smallest to its largest, 10 to 80 wide and 3 to 20 high', async ($, on) => {
  const begin = jira(on)
  const it = stage(on)

  await begin($)

  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const size = async (key: 'columns' | 'rows', text: string) => {
    await pane.input({ key, text })

    return (await pane.find({ key }))?.props.value
  }

  for (const text of ['9', '81', '12.5', '', 'ancho']) {
    expect(await size('columns', text), text).toBe('80')
  }

  for (const text of ['2', '21', '3.5', '']) {
    expect(await size('rows', text), text).toBe('20')
  }

  expect(it.toasts).toEqual([
    ...Array<string>(5).fill('Un número entero de 10 a 80'),
    ...Array<string>(4).fill('Un número entero de 3 a 20'),
  ])
  expect(await size('columns', '10')).toBe('10')
  expect(await size('columns', '80')).toBe('80')
  expect(await size('rows', '3')).toBe('3')
  expect(await size('rows', '20')).toBe('20')
  expect(it.toasts).toHaveLength(9)
  await pane.unmount()
})

test('a switch on is a full square, one off an empty one and dim, and reset puts them all back', async ($, on) => {
  const begin = jira(on)
  stage(on)

  await begin($)

  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const paths = async () => {
    const found = await pane.find({ key: 'paths' })

    return [found?.text, found?.props.dimColor]
  }

  expect(await paths()).toEqual(['■ Enlazar las rutas', false])
  await pane.press({ key: 'paths' })
  expect(await paths()).toEqual(['□ Enlazar las rutas', true])
  await pane.press({ key: 'reset' })
  expect(await paths()).toEqual(['■ Enlazar las rutas', false])
  await pane.unmount()
})

test('the terminal marks each field with a ground of its own, the other surfaces do not', async ($, on) => {
  const begin = jira(on)
  stage(on)

  await begin($)

  const terminal = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const mobile = await $.ui.mount({ ...PANE, surface: 'mobile' })
  const grounded = async (ui: typeof terminal | typeof mobile) =>
    (await ui.findAll({ type: 'Box' })).filter(found => found.props.backgroundColor === 'subtle').length

  expect(await grounded(terminal)).toBe(4)
  expect(await grounded(mobile)).toBe(0)
  await terminal.unmount()
  await mobile.unmount()
})

const BAND = {
  hasSurvey: false,
  isCollapsed: false,
  isWorking: false,
  maxRows: 10,
  bodyColumns: 80,
  scroll: { offset: 0, bodyRows: 10 },
  view: {},
} as const

test('the button is in the terminal’s footer and the desktop app’s band, and not in the terminal’s band, the desktop app’s footer or a band over a survey', async ($, on) => {
  const begin = jira(on)
  stage(on)
  on('prompt.read', () => ({ value: { text: '', cursor: 0 } }))
  on('ui.render', { component: 'AbovePrompt' }, (engine, e) => {
    const { Text } = engine.ui.resolve(e)

    return <Text>band</Text>
  })
  await begin($)

  const has = async (surface: 'terminal' | 'desktop', component: 'SessionMode' | 'AbovePrompt', hasSurvey = false) => {
    const ui = await $.ui.mount({
      plugin: 'ui-linkify',
      surface,
      component,
      props: component === 'SessionMode' ? { modes: [] } : { ...BAND, hasSurvey },
    })
    const found = await ui.find({ key: 'linkify' })

    await ui.unmount()

    return found !== undefined
  }

  expect(await has('terminal', 'SessionMode')).toBe(true)
  expect(await has('desktop', 'SessionMode')).toBe(false)
  expect(await has('desktop', 'AbovePrompt')).toBe(true)
  expect(await has('desktop', 'AbovePrompt', true)).toBe(false)
  expect(await has('terminal', 'AbovePrompt')).toBe(false)
})

test('the footer’s shared rows go in their numbers’ and places’ order, after the rest, a place-less item last', async ($, on) => {
  const begin = jira(on)

  // The engine's footer of this test, before the stage's own.
  on('ui.render', { component: 'SessionMode' }, (engine, e) => {
    const { Box, Button, Text } = engine.ui.resolve(e)

    return (
      <Box flexDirection="column">
        <Text>auto</Text>
        <Box width="100%">
          <Box key="slot:2.1:ui-other">
            <Button key="x2" plain label="second row" onPress={() => undefined} />
          </Box>
        </Box>
        <Box key="slot:1:ui-other">
          <Button key="x3" plain label="no place" onPress={() => undefined} />
        </Box>
        <Box key="slot:1.5:ui-other">
          <Button key="x1" plain label="fifth place" onPress={() => undefined} />
        </Box>
        <Box key="slot:1.3:ui-other">
          <Button key="x0" plain label="third place" onPress={() => undefined} />
        </Box>
      </Box>
    )
  })
  stage(on)
  await begin($)

  const footer = await $.ui.mount({
    plugin: 'ui-linkify',
    surface: 'terminal',
    component: 'SessionMode',
    props: { modes: [] },
  })
  const drawn = JSON.stringify(await footer.drawn())
  const rows = (await footer.findAll({ type: 'Box' })).filter(box => box.props.width === '100%')

  expect((await footer.findAll({ type: 'Button' })).map(button => button.props.label ?? button.text)).toEqual([
    'third place',
    '● linkify',
    'fifth place',
    'no place',
    'second row',
  ])
  // The box the shared items left empty is gone: the two rows alone are left.
  expect(rows).toHaveLength(2)
  expect(drawn.indexOf('auto')).toBeLessThan(drawn.indexOf('linkify'))
  await footer.unmount()
})

// A session on `root` (none when it tells none), whose store is `kept`, as it stands whenever it is read.
const withStore = (on: On, kept: Record<string, unknown>, root: string | null = '/repo') => {
  on('store.get', (_, e) => ({ value: kept[e.key] }))
  on('store.set', (_, e) => ((kept[e.key] = e.value), { value: undefined }))
  on('store.delete', (_, e) => (Reflect.deleteProperty(kept, e.key), { value: undefined }))
  mock.env(on, { HOME: '/home/me' })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.root', () => (root === null ? { deny: 'no root' } : { value: root }))

  return ($: Engine) => $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
}

const SOURCE = /^Ajustes/

test('a field saved as another type takes its default', async ($, on) => {
  const begin = withStore(on, { settings: { site: SITE, keys: 'ABC', columns: '90', rows: null } })

  stage(on)
  await begin($)

  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })

  expect((await pane.find({ key: 'columns' }))?.props.value).toBe('80')
  expect((await pane.find({ key: 'rows' }))?.props.value).toBe('20')
  expect((await pane.find({ key: 'keys' }))?.props.value).toBe('ABC')
  await pane.unmount()
})

test('a session that tells no project has no project settings, to load or to save', async ($, on) => {
  const kept: Record<string, unknown> = { 'settings:null': { keys: 'PRJ' }, settings: { keys: 'GLB' } }
  const begin = withStore(on, kept, null)
  const it = stage(on)

  await begin($)

  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })

  expect((await pane.find({ key: 'keys' }))?.props.value).toBe('GLB')
  await pane.press({ key: 'save-project' })
  expect(it.toasts).toEqual(['Esta sesión no dice cuál es su proyecto'])
  expect(Object.keys(kept).sort()).toEqual(['settings', 'settings:null'])
  expect(await pane.find({ key: 'forget-project' })).toBeUndefined()
  await pane.unmount()
})

test('a session starts with its project’s settings before the global ones, and the pane says so', async ($, on) => {
  const begin = withStore(on, { settings: { keys: 'GLB' }, 'settings:/repo': { keys: 'PRJ' } })

  stage(on)
  await begin($)

  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })

  expect((await pane.find({ key: 'keys' }))?.props.value).toBe('PRJ')
  expect((await pane.find({ type: 'Text', text: SOURCE }))?.text).toBe('Ajustes de este proyecto')
  expect(await pane.find({ key: 'forget-project' })).toBeDefined()
  await pane.unmount()
})

test('forgetting the project drops its saved settings, and the session takes the global ones', async ($, on) => {
  const kept: Record<string, unknown> = { settings: { keys: 'GLB' }, 'settings:/repo': { keys: 'PRJ' } }
  const begin = withStore(on, kept)

  stage(on)
  await begin($)

  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })

  await pane.press({ key: 'forget-project' })
  expect(Object.keys(kept)).toEqual(['settings'])
  expect((await pane.find({ key: 'keys' }))?.props.value).toBe('GLB')
  expect((await pane.find({ type: 'Text', text: SOURCE }))?.text).toBe('Ajustes globales')
  expect(await pane.find({ key: 'forget-project' })).toBeUndefined()
  await pane.unmount()
})

test('a session with only global settings says so, and one with none says it is on the defaults', async ($, on) => {
  const kept: Record<string, unknown> = {}
  const begin = withStore(on, kept)

  stage(on)
  await begin($)

  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const source = async () => (await pane.find({ type: 'Text', text: SOURCE }))?.text

  expect(await source()).toBe('Ajustes por defecto')
  expect(await pane.find({ key: 'forget-project' })).toBeUndefined()

  kept.settings = { keys: 'GLB' }
  await begin($)
  expect(await source()).toBe('Ajustes globales')
  expect(await pane.find({ key: 'forget-project' })).toBeUndefined()
  await pane.unmount()
})

test('the pane tells what changed since the settings were saved, against the project’s, the global ones or the defaults', async ($, on) => {
  const kept: Record<string, unknown> = { 'settings:/repo': { images: false } }
  const begin = withStore(on, kept)

  stage(on)
  await begin($)

  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const source = async () => (await pane.find({ type: 'Text', text: SOURCE }))?.text
  const projectSave = async () => (await pane.find({ key: 'save-project' }))?.props.variant

  // As the project saved them: changed and changed back, they are the project's again.
  expect(await source()).toBe('Ajustes de este proyecto')
  expect(await pane.find({ type: 'Text', text: /tiene los suyos/ })).toBeUndefined()
  await pane.press({ key: 'paths' })
  expect(await source()).toBe('Ajustes de este proyecto · cambios sin guardar')
  expect(await projectSave()).toBe('primary')
  await pane.press({ key: 'paths' })
  expect(await source()).toBe('Ajustes de este proyecto')
  expect(await projectSave()).toBe('secondary')

  // Saved as global, the session is on those, and the project's own are said to stand over them.
  await pane.press({ key: 'save-global' })
  expect(await source()).toBe('Ajustes globales')
  expect(
    await pane.find({ type: 'Text', text: 'Este proyecto tiene los suyos, que mandan al arrancar.' }),
  ).toBeDefined()
  await pane.unmount()
})

test('settings from the defaults are unsaved against the defaults, not against what the store holds now', async ($, on) => {
  const kept: Record<string, unknown> = {}
  const begin = withStore(on, kept)

  stage(on)
  await begin($)
  // Another session saved some global settings since this one started.
  kept.settings = { images: false }

  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })

  await pane.press({ key: 'images' })
  expect((await pane.find({ type: 'Text', text: SOURCE }))?.text).toBe('Ajustes por defecto · cambios sin guardar')
  await pane.unmount()
})

test('saved for the project, the settings are the project’s and it has some to forget', async ($, on) => {
  const begin = withStore(on, {})

  stage(on)
  await begin($)

  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })

  expect(await pane.find({ key: 'forget-project' })).toBeUndefined()
  await pane.press({ key: 'images' })
  await pane.press({ key: 'save-project' })
  expect((await pane.find({ type: 'Text', text: SOURCE }))?.text).toBe('Ajustes de este proyecto')
  expect(await pane.find({ key: 'forget-project' })).toBeDefined()
  await pane.unmount()
})
