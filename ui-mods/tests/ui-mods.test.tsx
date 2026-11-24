import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

// /mods as the person types it in the composer.
const MODS = {
  command: 'mods',
  args: '',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 80 },
} as const
const DONE = { exitCode: 0, stderr: '', isStdoutTruncated: false, isStderrTruncated: false }

// As on a terminal too narrow for a pane nobody asked for: an open is placed
// only while the press or the command that asked for it is still running.
let asking = 0
const asked = async <T,>(run: () => Promise<T>) => {
  asking++
  try {
    return await run()
  } finally {
    asking--
  }
}
// A command the person runs, which asks for the panes it opens.
const command = ($: Engine, args: Parameters<Engine['command']['run']>[0]) => asked(() => $.command.run(args))

const PANE = {
  plugin: 'ui-mods',
  component: 'Pane',
  requestId: 'mods',
  props: {
    title: 'Mods',
    isFocused: false,
    bodyColumns: 40,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

// Two installed plugins, one of them a mod, the CLI switching them; the panes
// open, and the commands run, recorded. `author`: what the mod's plugin.json
// says of who wrote it, nothing when not given; `enabledPlugins`: the switches
// settings hold, which no built-in mod's is in unless given; `isInTwoScopes`:
// the mod installed in the project too, as a second plugin of the same id.
const stage = (on: On, author?: unknown, enabledPlugins: unknown = {}, isInTwoScopes = false) => {
  const installed = [
    { id: 'pet@market', scope: 'user', enabled: true, installPath: '/cache/pet' },
    ...(isInTwoScopes ? [{ id: 'pet@market', scope: 'project', enabled: true, installPath: '/cache/pet' }] : []),
    { id: 'skills@official', scope: 'user', enabled: true, installPath: '/cache/skills' },
  ]
  const runs: string[] = []
  const filled: string[] = []
  const switched: string[][] = []
  // The `--scope` each switch was given, in order.
  const scopes: (string | undefined)[] = []
  const open = new Set<string>()
  // While held, a list read answers late, with the switches as they were asked.
  // `reads` counts the lists read; `active` and `peak`, the switches running at once.
  // `during`: what happens while a reload runs; `refusal`: why the CLI refuses a switch.
  // `fails`: why the list cannot be read, nothing while it can.
  const list = { held: Promise.resolve(), fails: null as string | null }
  // What the mod's plugin.json says it does, the prompt box's answer to a fill, the toasts said and the commands registered.
  const meta = { description: 'A pet beside the prompt.', isFilled: true }
  const toasts: string[] = []
  const registered: string[] = []
  const cli = {
    /** While held, a switch is not answered. */
    held: Promise.resolve(),
    reads: 0,
    active: 0,
    peak: 0,
    refusal: null as string | null,
    /** A refusal that says nothing on stderr, its reason on stdout when it has one. */
    refusalOut: null as string | null,
    during: undefined as (() => Promise<void>) | undefined,
    /** Whether the commands the pane runs fail. */
    isUnavailable: false,
  }

  on('process.run', async ($, e) => {
    const [, , verb, id, , scope] = e.argv

    if (verb === 'list') {
      cli.reads++

      const stdout = JSON.stringify(installed)
      await list.held

      return {
        value: list.fails === null ? { ...DONE, stdout } : { ...DONE, exitCode: 1, stdout: '', stderr: list.fails },
      }
    }

    cli.active++
    cli.peak = Math.max(cli.peak, cli.active)
    // The CLI takes a while: another switch may start before this one is done.
    await cli.held
    cli.active--

    if (cli.refusal !== null) {
      return { value: { ...DONE, exitCode: 1, stdout: '', stderr: cli.refusal } }
    }

    if (cli.refusalOut !== null) {
      return { value: { ...DONE, exitCode: 1, stdout: cli.refusalOut, stderr: '' } }
    }

    switched.push([verb ?? '', id ?? ''])
    scopes.push(scope)
    installed.forEach(
      plugin =>
        plugin.id === id && (scope === undefined || plugin.scope === scope) && (plugin.enabled = verb === 'enable'),
    )

    return { value: { ...DONE, stdout: '' } }
  })
  on('fs.read', ($, e) => {
    if (e.path === '/cache/pet/hooks/hooks.json' || e.path === '/cache/extra/hooks/hooks.json') {
      return { value: '{ "modules": ["./register.tsx"] }' }
    }

    if (e.path === '/cache/pet/.claude-plugin/plugin.json') {
      return { value: JSON.stringify({ name: 'pet', description: meta.description, author }) }
    }

    return { deny: 'missing' }
  })
  on('settings.read', () => ({ value: { enabledPlugins } }))
  on('command.register', (_, e) => (registered.push(e.name), { value: { command: 'mods' } }))
  on('ui.press', { plugin: '*' }, (_, e, next) => asked(async () => next(e)))
  on('ui.open', ($, e) =>
    asking > 0 ? (open.add(e.id), { value: { isPlaced: true } }) : { value: { isPlaced: false, reason: 'unasked' } },
  )
  on('ui.close', ($, e) => (open.delete(e.id), { value: undefined }))
  on('ui.panes', () => ({
    value: [...open].map(id => ({ id, title: id, isShown: true, isFocused: false, isPlaced: true })),
  }))
  on('command.run', async ($, e, next) => {
    // Left to the engine, which has no command of its own here: the call fails.
    if (e.command === 'mods' || cli.isUnavailable) {
      return next(e)
    }

    runs.push(e.command)
    await cli.during?.()

    return { text: '' }
  })
  on('prompt.fill', ($, e) => (filled.push(e.text), { isFilled: meta.isFilled, text: e.text, cursor: e.text.length }))
  on('ui.toast', (_, e) => (toasts.push(e.text), { value: undefined }))

  return { runs, filled, switched, scopes, open, list, cli, installed, meta, toasts, registered }
}

test('/mods opens the pane with the mods alone, switches one and reloads, then closes it', async ($, on) => {
  const { runs, filled, switched, open } = stage(on)

  await command($, MODS)
  expect([...open]).toEqual(['mods'])

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const checkbox = async () => (await ui.find({ type: 'Text', text: /^[■□] $/, in: 'rows' }))?.text

  // The rows: the marketplace's heading, its author's, then its one mod; the
  // skills plugin is no mod.
  expect((await ui.find({ type: 'Text', text: /MARKET/, in: 'rows' }))?.text).toBe('MARKET')
  expect((await ui.find({ type: 'Text', text: /autor/, in: 'rows' }))?.text).toBe('sin autor')
  expect(await ui.find({ type: 'Text', text: /skills/, in: 'rows' })).toBeUndefined()
  expect(await checkbox()).toBe('■ ')

  await ui.pointer({ type: 'down', x: 1, y: 2, button: 'left', in: 'rows' })
  expect(switched).toEqual([['disable', 'pet@market']])
  expect(await checkbox()).toBe('□ ')
  expect((await ui.find({ type: 'Text', text: /•/, in: 'rows' }))?.text).toBe(' •')
  expect((await ui.find({ type: 'Text', text: /sin aplicar/ }))?.text).toBe('5 de 7 activos · 1 sin aplicar')
  expect((await ui.find({ type: 'Button', key: 'reload' }))?.props.variant).toBe('primary')

  // The desktop app refuses the command from a mod: it waits in the prompt box
  // for the person's Enter, and the switches stay pending until it runs.
  await ui.press({ key: 'reload' })
  expect(filled).toEqual(['/reload-plugins'])
  expect(runs).toEqual([])
  expect((await ui.find({ type: 'Text', text: /sin aplicar/ }))?.text).toBe('5 de 7 activos · 1 sin aplicar')

  await command($, { ...MODS, command: 'reload-plugins' })
  expect(runs).toEqual(['reload-plugins'])
  expect(await ui.find({ type: 'Text', text: /sin aplicar/ })).toBeUndefined()
  expect((await ui.find({ type: 'Button', key: 'reload' }))?.props.variant).toBe('secondary')

  await ui.unmount()
  await command($, MODS)
  expect([...open]).toEqual([])
})

test('a plugin whose hooks.json cannot be read is no mod, and why is in the debug log', async ($, on) => {
  stage(on)
  const logged: { text: string; to: string }[] = []
  on('ui.log', (_, e) => (logged.push(e), { value: undefined }))

  await command($, MODS)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

  expect(await ui.find({ type: 'Text', text: /skills/, in: 'rows' })).toBeUndefined()
  expect(logged).toContainEqual({
    text: 'reading /cache/skills/hooks/hooks.json failed: ui-mods: $.fs.read: missing',
    to: 'debug',
  })
  await ui.unmount()
})

test('in the terminal the buttons run /reload-plugins and /restart themselves', async ($, on) => {
  const { runs, filled } = stage(on)
  await command($, MODS)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'reload' })
  await ui.press({ key: 'restart' })
  expect(runs).toEqual(['reload-plugins', 'restart'])
  expect(filled).toEqual([])
  await ui.unmount()
})

test('a mod whose plugin.json names its author is listed under them, in its marketplace', async ($, on) => {
  stage(on, { name: 'someone-else' })
  await command($, MODS)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  expect((await ui.find({ type: 'Text', text: /MARKET/, in: 'rows' }))?.text).toBe('MARKET')
  expect((await ui.find({ type: 'Text', text: /someone/, in: 'rows' }))?.text).toBe('someone-else')
  await ui.unmount()
})

test('a press on the name unfolds and folds its description; every surface draws the square', async ($, on) => {
  const { switched } = stage(on)
  await command($, MODS)

  for (const [surface, box] of [
    ['desktop', '■ '],
    ['terminal', '■ '],
  ] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    const description = () => ui.find({ type: 'Text', text: /A pet beside/, in: 'rows' })
    const press = (y: number) => ui.pointer({ type: 'down', x: 12, y, button: 'left', in: 'rows' })
    await ui.resize({ columns: 40, rows: 20, in: 'rows' })

    expect((await ui.find({ type: 'Text', text: /pet/, in: 'rows' }))?.text).toBe('pet')
    expect((await ui.find({ type: 'Text', text: /■ /, in: 'rows' }))?.text).toBe(box)
    expect(await description()).toBeUndefined()

    await press(2)
    expect((await description())?.text).toBe('A pet beside the prompt.')

    // A press on the description folds it as well.
    await press(3)
    expect(await description()).toBeUndefined()
    await ui.unmount()
  }

  expect(switched).toEqual([])
})

test('the row under the pointer is lit, and nothing once it leaves', async ($, on) => {
  stage(on)
  await command($, MODS)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const lit = async () =>
    (await ui.findAll({ type: 'Box', in: 'rows' })).filter(box => box.props.backgroundColor !== undefined).length

  expect(await lit()).toBe(0)
  await ui.pointer({ type: 'move', x: 5, y: 2, in: 'rows' })
  expect(await lit()).toBe(1)
  await ui.pointer({ type: 'leave', x: 5, y: 2, in: 'rows' })
  expect(await lit()).toBe(0)
  await ui.unmount()
})

test("the footer's button goes before the companion's and opens and closes the pane", async ($, on) => {
  const { open } = stage(on)
  on('ui.render', { component: 'SessionMode' }, (engine, e) => {
    const { Box, Button, Text } = engine.ui.resolve(e)

    return (
      <Box flexDirection="column">
        <Text>auto</Text>
        <Box width="100%">
          <Box key="slot:1.2:ui-companion">
            <Button key="consejero" plain label="companion" onPress={() => undefined} />
          </Box>
        </Box>
      </Box>
    )
  })

  const footer = await $.ui.mount({
    plugin: 'ui-mods',
    component: 'SessionMode',
    props: { modes: [] },
    surface: 'terminal',
  })
  expect((await footer.findAll({ type: 'Button' })).map(button => button.props.label)).toEqual(['mods', 'companion'])

  await footer.press({ key: 'mods' })
  expect([...open]).toEqual(['mods'])
  await footer.press({ key: 'mods' })
  expect([...open]).toEqual([])
  await footer.unmount()
})

test('a list read before a switch was pressed does not undo it', async ($, on) => {
  const { list } = stage(on)

  await command($, MODS)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const checkbox = async () => (await ui.find({ type: 'Text', text: /^[■□] $/, in: 'rows' }))?.text
  let release = () => {}

  expect(await checkbox()).toBe('■ ')
  list.held = new Promise(resolve => (release = resolve))
  await command($, { ...MODS, command: 'reload-plugins' })
  await ui.pointer({ type: 'down', x: 1, y: 2, button: 'left', in: 'rows' })
  release()

  // The late read lands: a few turns of the event loop.
  for (let turn = 0; turn < 50; turn++) {
    await Promise.resolve()
  }

  expect(await checkbox()).toBe('□ ')
  await ui.unmount()
})

test('a reload with the pane up reads the list again', async ($, on) => {
  const { open } = stage(on)
  open.add('mods')
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

  expect((await ui.find({ type: 'Text', text: /activos/ }))?.text).toBe('6 de 7 activos')
  await ui.unmount()
})

test('the built-in mods follow the installed ones, switched as settings hold, sec-default with no switch', async ($, on) => {
  const { switched } = stage(on, undefined, {
    'cc-plugin-diff@builtin': false,
    'cc-plugin-you-should-know@builtin': true,
  })
  await command($, MODS)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const names = async () =>
    (await ui.findAll({ type: 'Text', in: 'rows' })).map(text => text.text).filter(text => /^(pet|cc-)/.test(text))
  const boxes = async () => (await ui.findAll({ type: 'Text', text: /^[■□] $/, in: 'rows' })).map(box => box.text)
  // The lines: the installed marketplace's heading, its author, its mod, a
  // gap, then the built-in heading, its author and its six mods.
  const press = (y: number) => ui.pointer({ type: 'down', x: 1, y, button: 'left', in: 'rows' })
  await ui.resize({ columns: 60, rows: 20, in: 'rows' })

  expect((await ui.find({ type: 'Text', text: /BUILTIN/, in: 'rows' }))?.text).toBe('BUILTIN')
  expect((await ui.find({ type: 'Text', text: /Claude Code/, in: 'rows' }))?.text).toBe('Claude Code')
  expect(await names()).toEqual([
    'pet',
    'cc-plugin-agents-md',
    'cc-plugin-diff',
    'cc-plugin-plugin-authoring',
    'cc-plugin-sec-default',
    'cc-plugin-telemetry',
    'cc-plugin-you-should-know',
  ])
  // On unless settings say otherwise, but you-should-know, off unless they do.
  expect(await boxes()).toEqual(['■ ', '■ ', '□ ', '■ ', '■ ', '■ ', '■ '])

  await press(7)
  expect(switched).toEqual([['enable', 'cc-plugin-diff@builtin']])

  // Its checkbox switches nothing: the press unfolds why.
  await press(9)
  expect(switched).toEqual([['enable', 'cc-plugin-diff@builtin']])
  expect((await ui.find({ type: 'Text', text: /No se puede/, in: 'rows' }))?.text).toMatch(/No se puede apagar/)
  await ui.unmount()
})

// Lets what a press started run to its end: a few turns of the event loop.
const settle = async () => {
  for (let turn = 0; turn < 300; turn++) {
    await Promise.resolve()
  }
}

test('quick switches reach the CLI one at a time, and the list is read back once the last has', async ($, on) => {
  const { switched, cli } = stage(on)
  await command($, MODS)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const press = (y: number) => ui.pointer({ type: 'down', x: 1, y, button: 'left', in: 'rows' })
  await ui.resize({ columns: 60, rows: 20, in: 'rows' })
  const opened = cli.reads

  // The second is pressed before the CLI has answered the first.
  let release = () => {}

  cli.held = new Promise(resolve => (release = resolve))
  await press(2)
  await press(7)
  await settle()
  release()
  await settle()

  expect(switched).toEqual([
    ['disable', 'pet@market'],
    ['disable', 'cc-plugin-diff@builtin'],
  ])
  expect(cli.peak).toBe(1)
  expect(cli.reads).toBe(opened + 1)
  await ui.unmount()
})

test('a switch the CLI refuses is put back, its reason said, and the list read again', async ($, on) => {
  const { switched, cli } = stage(on)
  await command($, MODS)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const checkbox = async () => (await ui.find({ type: 'Text', text: /^[■□] $/, in: 'rows' }))?.text

  cli.refusal = 'settings.json is read-only'
  await ui.pointer({ type: 'down', x: 1, y: 2, button: 'left', in: 'rows' })
  await settle()

  expect(switched).toEqual([])
  expect(await checkbox()).toBe('■ ')
  expect(await ui.find({ type: 'Text', text: /•/, in: 'rows' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /sin aplicar/ })).toBeUndefined()
  expect((await ui.find({ type: 'Text', text: /read-only/ }))?.text).toBe('settings.json is read-only')
  await ui.unmount()
})

test('a list read while a switch was pressed is read again, not left as it was', async ($, on) => {
  const { list, installed } = stage(on)
  await command($, MODS)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  let release = () => {}

  list.held = new Promise(resolve => (release = resolve))
  await command($, { ...MODS, command: 'reload-plugins' })
  // Installed after the read began, which its answer does not hold.
  installed.push({ id: 'extra@market', scope: 'user', enabled: true, installPath: '/cache/extra' })
  await ui.pointer({ type: 'down', x: 1, y: 2, button: 'left', in: 'rows' })
  list.held = Promise.resolve()
  release()
  await settle()

  expect((await ui.find({ type: 'Text', text: /activos/ }))?.text).toBe('6 de 8 activos · 1 sin aplicar')
  expect((await ui.find({ type: 'Text', text: /^extra$/, in: 'rows' }))?.text).toBe('extra')
  await ui.unmount()
})

test('a plugin installed in two scopes is two rows, each switched in its own scope', async ($, on) => {
  const { switched, scopes } = stage(on, undefined, {}, true)
  await command($, MODS)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const boxes = async () =>
    (await ui.findAll({ type: 'Text', text: /^[■□] $/, in: 'rows' })).map(box => box.text).slice(0, 2)
  const names = async () => (await ui.findAll({ type: 'Text', text: /^pet/, in: 'rows' })).map(name => name.text)
  await ui.resize({ columns: 60, rows: 20, in: 'rows' })

  expect(await names()).toEqual(['pet (proyecto)', 'pet (usuario)'])
  expect(await boxes()).toEqual(['■ ', '■ '])

  await ui.pointer({ type: 'down', x: 1, y: 2, button: 'left', in: 'rows' })
  await settle()
  expect(switched).toEqual([['disable', 'pet@market']])
  expect(scopes).toEqual(['project'])
  expect(await boxes()).toEqual(['□ ', '■ '])

  // The mark and the unfolding are each row's own.
  expect(await ui.findAll({ type: 'Text', text: /•/, in: 'rows' })).toHaveLength(1)
  await ui.pointer({ type: 'down', x: 12, y: 3, button: 'left', in: 'rows' })
  expect(await ui.findAll({ type: 'Text', text: /A pet beside/, in: 'rows' })).toHaveLength(1)
  await ui.unmount()
})

test('the switches are no longer pending by the time the reload runs', async ($, on) => {
  const { cli } = stage(on)
  await command($, MODS)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const unapplied = () => ui.find({ type: 'Text', text: /sin aplicar/ })
  let during: unknown = 'not run'

  await ui.pointer({ type: 'down', x: 1, y: 2, button: 'left', in: 'rows' })
  await settle()
  expect(await unapplied()).toBeDefined()

  cli.during = async () => {
    during = await unapplied()
  }
  await command($, { ...MODS, command: 'reload-plugins' })
  expect(during).toBeUndefined()
  await ui.unmount()
})

// The texts of the list, as the pane draws it for a mod whose plugin.json names `author`.
const textsFor = async ($: Engine, on: On, author: unknown) => {
  stage(on, author)
  await command($, MODS)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const texts = (await ui.findAll({ type: 'Text', in: 'rows' })).map(text => text.text)

  await ui.unmount()

  return texts
}

test('an author written as a plain name is the mod’s author', async ($, on) => {
  expect(await textsFor($, on, 'someone-else')).toContain('someone-else')
})

test('an author with no name is no author', async ($, on) => {
  expect(await textsFor($, on, '')).toContain('sin autor')
})

test('an author object with an empty name is no author', async ($, on) => {
  expect(await textsFor($, on, { name: '' })).toContain('sin autor')
})

test('the installed mods are listed by their id, not as they were installed', async ($, on) => {
  const { installed } = stage(on)

  installed.push({ id: 'extra@market', scope: 'user', enabled: true, installPath: '/cache/extra' })
  await command($, MODS)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const names = (await ui.findAll({ type: 'Text', text: /^(pet|extra)$/, in: 'rows' })).map(text => text.text)

  expect(names).toEqual(['extra', 'pet'])
  await ui.unmount()
})

// The checkboxes of the built-in mods, as the pane draws them when settings hold `enabledPlugins`.
const builtinBoxes = async ($: Engine, on: On, enabledPlugins: unknown) => {
  stage(on, undefined, enabledPlugins)
  await command($, MODS)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const boxes = (await ui.findAll({ type: 'Text', text: /^[■□] $/, in: 'rows' })).map(box => box.text)

  await ui.unmount()

  return boxes
}

// The built-in mods on their defaults: pet, then the six, `you-should-know` off.
const DEFAULT_BOXES = ['■ ', '■ ', '■ ', '■ ', '■ ', '■ ', '□ ']

test('the built-in mod nothing can switch off is on whatever settings say', async ($, on) => {
  expect(await builtinBoxes($, on, { 'cc-plugin-sec-default@builtin': false })).toEqual(DEFAULT_BOXES)
})

test('a built-in mod’s setting that is no boolean leaves it on its default', async ($, on) => {
  expect(
    await builtinBoxes($, on, { 'cc-plugin-diff@builtin': 0, 'cc-plugin-you-should-know@builtin': 'yes' }),
  ).toEqual(DEFAULT_BOXES)
})

test('settings that hold no switches leave the built-in mods on their defaults', async ($, on) => {
  expect(await builtinBoxes($, on, null)).toEqual(DEFAULT_BOXES)
})

test('a switch the CLI refuses says what it printed, whichever stream it was, or that it failed', async ($, on) => {
  const { cli } = stage(on)
  await command($, MODS)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const press = () => ui.pointer({ type: 'down', x: 1, y: 2, button: 'left', in: 'rows' })
  const error = async () => (await ui.find({ type: 'Text', text: /plugin|terminó/ }))?.text

  cli.refusalOut = 'plugin is managed'
  await press()
  await settle()
  expect(await error()).toBe('plugin is managed')

  cli.refusalOut = ''
  await press()
  await settle()
  expect(await error()).toBe('claude plugin disable terminó con 1')
  await ui.unmount()
})

test('a list read that ends after the list read back from a switch does not leave the list older than it', async ($, on) => {
  const { list, installed } = stage(on)
  await command($, MODS)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  let release = () => {}

  list.held = new Promise(resolve => (release = resolve))
  await command($, { ...MODS, command: 'reload-plugins' })
  await settle()
  // The first read waits on the promise it began with; the ones after it do not wait.
  list.held = Promise.resolve()
  installed.push({ id: 'extra@market', scope: 'user', enabled: true, installPath: '/cache/extra' })
  await ui.pointer({ type: 'down', x: 1, y: 2, button: 'left', in: 'rows' })
  await settle()
  expect((await ui.find({ type: 'Text', text: /activos/ }))?.text).toBe('6 de 8 activos · 1 sin aplicar')

  // The first read answers last, with the list as it was before the switch.
  release()
  await settle()
  expect((await ui.find({ type: 'Text', text: /activos/ }))?.text).toBe('6 de 8 activos · 1 sin aplicar')
  await ui.unmount()
})

test('a list that cannot be read says why, and a good read takes it away', async ($, on) => {
  const clock = mock.clock(on)
  const { list } = stage(on)
  list.fails = 'not logged in'
  await command($, MODS)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const activos = async () => (await ui.find({ type: 'Text', text: /activos/ }))?.text

  await clock.settle()
  await ui.redraw()
  expect((await ui.find({ type: 'Text', text: /logged in/ }))?.text).toBe('not logged in')
  expect(await ui.find({ type: 'Text', text: /Buscando/ })).toBeUndefined()

  list.fails = null
  await command($, { ...MODS, command: 'reload-plugins' })
  await clock.settle()
  await ui.redraw()
  expect(await ui.find({ type: 'Text', text: /logged in/ })).toBeUndefined()
  expect(await activos()).toBe('6 de 7 activos')
  await ui.unmount()
})

test('the pane says it is searching until the list arrives', async ($, on) => {
  const { list } = stage(on)
  let release = () => {}

  list.held = new Promise(resolve => (release = resolve))
  await command($, MODS)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

  expect((await ui.find({ type: 'Text', text: /Buscando/ }))?.text).toBe('Buscando mods…')
  release()
  await settle()
  expect(await ui.find({ type: 'Text', text: /Buscando/ })).toBeUndefined()
  await ui.unmount()
})

test('a plugin of a scope the CLI does not take is switched with no scope', async ($, on) => {
  const { installed, scopes, switched } = stage(on)

  installed.forEach(plugin => plugin.id === 'pet@market' && (plugin.scope = 'managed'))
  await command($, MODS)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

  await ui.pointer({ type: 'down', x: 1, y: 2, button: 'left', in: 'rows' })
  await settle()
  expect(switched).toEqual([['disable', 'pet@market']])
  expect(scopes).toEqual([undefined])
  await ui.unmount()
})

test('a switch is drawn at once, in its own scope’s row alone, before the CLI answers', async ($, on) => {
  const { cli } = stage(on, undefined, {}, true)
  await command($, MODS)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const boxes = async () =>
    (await ui.findAll({ type: 'Text', text: /^[■□] $/, in: 'rows' })).map(box => box.text).slice(0, 2)
  let release = () => {}

  await ui.resize({ columns: 60, rows: 20, in: 'rows' })
  cli.held = new Promise(resolve => (release = resolve))
  await ui.pointer({ type: 'down', x: 1, y: 2, button: 'left', in: 'rows' })
  expect(await boxes()).toEqual(['□ ', '■ '])
  release()
  await settle()
  expect(await boxes()).toEqual(['□ ', '■ '])
  await ui.unmount()
})

test('refusals are said once: the next one does not repeat the last', async ($, on) => {
  const { cli } = stage(on)
  await command($, MODS)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  cli.refusal = 'settings.json is read-only'
  await ui.pointer({ type: 'down', x: 1, y: 2, button: 'left', in: 'rows' })
  await settle()
  await ui.pointer({ type: 'down', x: 1, y: 2, button: 'left', in: 'rows' })
  await settle()
  expect((await ui.find({ type: 'Text', text: /read-only/ }))?.text).toBe('settings.json is read-only')
  await ui.unmount()
})

test('the desktop app’s toast says what the command it leaves in the prompt box does, or to type it', async ($, on) => {
  const { toasts, meta } = stage(on)
  await command($, MODS)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  await ui.press({ key: 'reload' })
  await ui.press({ key: 'restart' })
  expect(toasts).toEqual(['Pulsa Enter para recargar los mods', 'Pulsa Enter para reiniciar Claude Code'])

  meta.isFilled = false
  toasts.length = 0
  await ui.press({ key: 'reload' })
  await ui.press({ key: 'restart' })
  expect(toasts).toEqual([
    'Escribe /reload-plugins para recargar los mods',
    'Escribe /restart para reiniciar Claude Code',
  ])
  await ui.unmount()
})

test('a reload that fails says why and keeps the switches as not applied yet', async ($, on) => {
  const clock = mock.clock(on)
  const { cli, toasts } = stage(on)
  await command($, MODS)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

  await ui.pointer({ type: 'down', x: 1, y: 2, button: 'left', in: 'rows' })
  await settle()
  cli.isUnavailable = true
  await ui.press({ key: 'reload' })
  await clock.settle()
  expect(toasts).toEqual([expect.stringMatching(/^No se pudo recargar los mods: /)])
  expect((await ui.find({ type: 'Text', text: /sin aplicar/ }))?.text).toBe('5 de 7 activos · 1 sin aplicar')
  await ui.unmount()
})

// A reload that fails once the switches pending were taken off as it ran; `during` is what happens
// meanwhile, given a press on the first row's checkbox.
const failedReload = async ($: Engine, on: On, during?: (press: () => Promise<void>) => Promise<void>) => {
  const { cli } = stage(on)
  await command($, MODS)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const press = async () => {
    await ui.pointer({ type: 'down', x: 1, y: 2, button: 'left', in: 'rows' })
    await settle()
  }

  await press()
  cli.during = async () => {
    await during?.(press)

    throw new Error('recarga rechazada')
  }
  await command($, { ...MODS, command: 'reload-plugins' }).catch(() => undefined)
  await settle()

  return { ui, unapplied: async () => (await ui.find({ type: 'Text', text: /activos/ }))?.text }
}

test('a reload that fails puts the switches back as not applied yet', async ($, on) => {
  const { ui, unapplied } = await failedReload($, on)

  expect(await unapplied()).toMatch(/ · 1 sin aplicar$/)
  await ui.unmount()
})

test('a switch pressed again while a reload that fails ran is pending once, not twice', async ($, on) => {
  const { ui, unapplied } = await failedReload($, on, async press => press())

  expect(await unapplied()).toMatch(/ · 1 sin aplicar$/)
  await ui.unmount()
})

test('a session starts with the pane down reading no list, and registers /mods', async ($, on) => {
  const { cli, registered } = stage(on)
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  expect(cli.reads).toBe(0)
  expect(registered).toEqual(['mods'])
})

test('a reload reads the list again, a plugin installed since', async ($, on) => {
  const { installed } = stage(on)
  await command($, MODS)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

  await settle()
  installed.push({ id: 'extra@market', scope: 'user', enabled: true, installPath: '/cache/extra' })
  await command($, { ...MODS, command: 'reload-plugins' })
  await settle()
  expect((await ui.find({ type: 'Text', text: /^extra$/, in: 'rows' }))?.text).toBe('extra')
  await ui.unmount()
})

test('/mods says whether it opened the pane or closed it', async ($, on) => {
  const clock = mock.clock(on)
  stage(on)

  expect(await command($, MODS)).toEqual({ text: 'Panel de mods abierto.' })
  // The list the opening reads must be read before the test ends.
  await clock.settle()
  expect(await command($, MODS)).toEqual({ text: 'Panel de mods cerrado.' })
})

// What the engine gives the band above the prompt.
const BAND = {
  hasSurvey: false,
  isCollapsed: false,
  isWorking: false,
  maxRows: 10,
  bodyColumns: 80,
  scroll: { offset: 0, bodyRows: 10 },
  view: {},
}

test('the button is in the desktop app’s band and the terminal’s footer, and not over a survey', async ($, on) => {
  stage(on)

  const buttons = async (
    component: 'SessionMode' | 'AbovePrompt',
    surface: 'terminal' | 'desktop',
    hasSurvey = false,
  ) => {
    const ui = await $.ui.mount(
      component === 'SessionMode'
        ? { plugin: 'ui-mods', component, surface, props: { modes: [] } }
        : { plugin: 'ui-mods', component, surface, props: { ...BAND, hasSurvey } },
    )
    const labels = (await ui.findAll({ type: 'Button' })).map(button => button.props.label)

    await ui.unmount()

    return labels
  }

  expect(await buttons('SessionMode', 'terminal')).toEqual(['mods'])
  expect(await buttons('SessionMode', 'desktop')).toEqual([])
  expect(await buttons('AbovePrompt', 'desktop')).toEqual(['mods'])
  expect(await buttons('AbovePrompt', 'desktop', true)).toEqual([])
  expect(await buttons('AbovePrompt', 'terminal')).toEqual([])
})

test('the row’s checkbox of a mod that cannot be switched off switches nothing, the others’ do', async ($, on) => {
  const { switched } = stage(on)
  await command($, MODS)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

  await ui.post({ toggle: 'cc-plugin-sec-default@builtin' }, { in: 'rows' })
  await settle()
  expect(switched).toEqual([])

  await ui.post({ toggle: 'cc-plugin-diff@builtin' }, { in: 'rows' })
  await settle()
  expect(switched).toEqual([['disable', 'cc-plugin-diff@builtin']])
  await ui.unmount()
})

test('the footer’s shared rows go in their numbers’ and places’ order, after the rest, a place-less item last', async ($, on) => {
  stage(on)
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
      </Box>
    )
  })

  const footer = await $.ui.mount({
    plugin: 'ui-mods',
    component: 'SessionMode',
    props: { modes: [] },
    surface: 'terminal',
  })
  const drawn = JSON.stringify(await footer.drawn())
  const rows = (await footer.findAll({ type: 'Box' })).filter(box => box.props.width === '100%')

  expect((await footer.findAll({ type: 'Button' })).map(button => button.props.label)).toEqual([
    'mods',
    'fifth place',
    'no place',
    'second row',
  ])
  // The box the shared items left empty is gone: the two rows alone are left.
  expect(rows).toHaveLength(2)
  expect(drawn.indexOf('auto')).toBeLessThan(drawn.indexOf('mods'))
  await footer.unmount()
})

test('the row under the pointer is lit with the surface’s ground', async ($, on) => {
  stage(on)
  await command($, MODS)

  for (const [surface, ground] of [
    ['desktop', '#8080801f'],
    ['terminal', '#3a3f4b'],
  ] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })

    await ui.pointer({ type: 'move', x: 5, y: 2, in: 'rows' })

    const lit = (await ui.findAll({ type: 'Box', in: 'rows' })).filter(box => box.props.backgroundColor !== undefined)

    expect(lit.map(box => box.props.backgroundColor)).toEqual([ground])
    await ui.unmount()
  }
})

test('the marketplace and the author count their mods', async ($, on) => {
  stage(on)
  await command($, MODS)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const counts = (await ui.findAll({ type: 'Text', text: /^\d+$/, in: 'rows' })).map(count => count.text)

  expect(counts).toEqual(['1', '1', '6', '6'])
  await ui.unmount()
})

test('a description is wrapped to the room, one that is wider than it cut, and the room is at least 20', async ($, on) => {
  const { meta } = stage(on)
  meta.description = 'one two three four five six supercalifragilisticexpialidocious'
  await command($, MODS)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const lines = async () =>
    (await ui.findAll({ type: 'Text', in: 'rows' })).map(text => text.text).filter(text => /one|five|super/.test(text))

  await ui.resize({ columns: 20, rows: 20, in: 'rows' })
  await ui.pointer({ type: 'down', x: 12, y: 2, button: 'left', in: 'rows' })
  expect(await lines()).toEqual(['one two three four', 'five six', 'supercalifragilistic'])
  await ui.unmount()
})

test('only a press of the left button on the row acts, and a pointer that only moves does not', async ($, on) => {
  const { switched } = stage(on)
  await command($, MODS)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const checkbox = async () => (await ui.find({ type: 'Text', text: /^[■□] $/, in: 'rows' }))?.text
  const description = () => ui.find({ type: 'Text', text: /A pet beside/, in: 'rows' })

  await ui.pointer({ type: 'down', x: 1, y: 2, button: 'right', in: 'rows' })
  await ui.pointer({ type: 'move', x: 1, y: 2, in: 'rows' })
  await ui.pointer({ type: 'move', x: 12, y: 2, in: 'rows' })
  await settle()
  expect(switched).toEqual([])
  expect(await checkbox()).toBe('■ ')
  expect(await description()).toBeUndefined()
  await ui.unmount()
})

test('a press on the left of a description unfolds, it does not switch its mod', async ($, on) => {
  const { switched } = stage(on)
  await command($, MODS)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const checkbox = async () => (await ui.find({ type: 'Text', text: /^[■□] $/, in: 'rows' }))?.text

  await ui.pointer({ type: 'down', x: 12, y: 2, button: 'left', in: 'rows' })
  await ui.pointer({ type: 'down', x: 1, y: 3, button: 'left', in: 'rows' })
  await settle()
  expect(switched).toEqual([])
  expect(await checkbox()).toBe('■ ')
  expect(await ui.find({ type: 'Text', text: /A pet beside/, in: 'rows' })).toBeUndefined()
  await ui.unmount()
})

test('a disabled mod is dimmed with an inactive checkbox, and an unfolded row shows an open arrow', async ($, on) => {
  stage(on)
  await command($, MODS)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const name = async () => (await ui.find({ type: 'Text', text: /^pet$/, in: 'rows' }))?.props.dimColor
  const checkbox = async () => (await ui.find({ type: 'Text', text: /^[■□] $/, in: 'rows' }))?.props.color
  const arrow = async () => (await ui.find({ type: 'Text', text: /^[▸▾]$/, in: 'rows' }))?.text

  expect([await name(), await checkbox(), await arrow()]).toEqual([false, 'suggestion', '▸'])
  await ui.pointer({ type: 'down', x: 1, y: 2, button: 'left', in: 'rows' })
  await settle()
  await ui.pointer({ type: 'down', x: 12, y: 2, button: 'left', in: 'rows' })
  expect([await name(), await checkbox(), await arrow()]).toEqual([true, 'inactive', '▾'])
  await ui.unmount()
})
