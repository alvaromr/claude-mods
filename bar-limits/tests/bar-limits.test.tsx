import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

// 22-10-2026 08:07 UTC: the session's window has run 1h07m of its 5h, the week 5d17h07m of its 7d.
const NOW = Date.parse('2026-10-22T08:07:00Z')

const PANE = {
  plugin: 'bar-limits',
  component: 'Pane',
  requestId: 'bar-limits',
  props: {
    title: 'Límites de uso',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const
const FOOTER = { plugin: 'bar-limits', component: 'SessionMode', props: { modes: [] } } as const
const BAND = {
  plugin: 'bar-limits',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isCollapsed: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 120,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

// The engine's windows, the usage endpoint's Fable, the panes open and the toasts, recorded.
// `isResumed`: a session that has had no response yet, so the engine has no
// windows; the last session left them in the store.
// `broken` is a part of the world that fails: the store that cannot be read or
// written, the state that cannot keep the settings.
const stage = (on: On, isResumed = false, broken: 'unreadable' | 'unwritable' | 'state' | null = null) => {
  const sevenDay = { kind: 'seven_day', percentUsed: 19.4, resetsAt: '2026-10-23T15:00:00Z' }
  const windows = [{ kind: 'five_hour', percentUsed: 2, resetsAt: '2026-10-22T12:00:00Z' }, sevenDay]
  const open = new Set<string>()
  const toasts: string[] = []
  /** The usage endpoint's answer status. */
  const endpoint = { status: 200 }
  const fable = {
    kind: 'weekly_scoped',
    percent: 0,
    resets_at: '2026-10-23T15:00:00+00:00',
    scope: { model: { display_name: 'Fable' } },
  }
  const usage: { limits: unknown[] } = {
    limits: [{ kind: 'session', percent: 2, resets_at: '2026-10-22T12:00:00.142083+00:00', scope: null }, fable],
  }

  const logged: string[] = []
  /** What the store holds, by key, in a store that works: the last readings, and the settings saved. */
  const saved: Record<string, unknown> = isResumed
    ? { limits: windows.map(({ kind, percentUsed, resetsAt }) => ({ kind, percentUsed, resetsAt })) }
    : {}
  /** What the usage endpoint was asked, by each read. */
  const fetched: { url: string; init: unknown }[] = []
  const world = {
    /** Why the session's project root cannot be read, as a hook that denies it says. */
    rootRefusal: null as string | null,
    /** The credential the engine holds; none off a subscription. */
    handle: 'handle' as string | null,
    /** The state cannot keep the settings, so a start fails. */
    isStateDown: broken === 'state',
    /** The times the footer was asked to be drawn again. */
    invalidations: 0,
    /** Whether the engine has measured the windows yet. */
    hasWindows: !isResumed,
    /** The slots of other mods in the footer, as drawn beneath this one's, in the order drawn. */
    slots: [] as { key: string; label: string }[],
  }

  const clock = mock.clock(on, { now: NOW })

  if (broken === 'unreadable' || broken === 'unwritable') {
    on('store.get', (_, e) =>
      broken === 'unreadable' ? { deny: 'store down' } : { value: e.key === 'settings:/repo' ? {} : undefined },
    )
    on('store.set', () => (broken === 'unwritable' ? { deny: 'store down' } : { value: undefined }))
    on('store.delete', () => (broken === 'unwritable' ? { deny: 'store down' } : { value: undefined }))
  } else {
    on('store.get', (_, e) => ({ value: saved[e.key] }))
    on('store.set', (_, e) => {
      saved[e.key] = e.value

      return { value: undefined }
    })
    on('store.delete', (_, e) => {
      Reflect.deleteProperty(saved, e.key)

      return { value: undefined }
    })
  }

  on('session.root', () => (world.rootRefusal === null ? { value: '/repo' } : { deny: world.rootRefusal }))

  on('state.set', (_, e, next) => (world.isStateDown && e.key === 'settings' ? { deny: 'state down' } : next(e)))
  on('ui.invalidate', (_, e, next) => {
    world.invalidations++

    return next(e)
  })
  on('ui.log', (_, e) => (logged.push(e.text), { value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({
    value: { startedAt: NOW, context: { window: 200_000 }, rateLimits: world.hasWindows ? windows : [] },
  }))
  on('session.measure', (_, e) => ({ context: e.context, rateLimits: e.rateLimits, changed: e.changed }))
  on('session.authorize', () => ({
    value: world.handle === null ? null : { handle: world.handle, kind: 'bearer' },
  }))
  on('http.fetch', (_, e) => {
    fetched.push({ url: e.url, init: e.init })

    return { value: { status: endpoint.status, ok: endpoint.status === 200, headers: {}, text: JSON.stringify(usage) } }
  })
  on('ui.open', ($, e) => (open.add(e.id), { value: { isPlaced: true } }))
  on('ui.close', ($, e) => (open.delete(e.id), { value: undefined }))
  on('ui.panes', () => ({
    value: [...open].map(id => ({ id, title: id, isShown: true, isFocused: false, isPlaced: true })),
  }))
  on('ui.toast', ($, e) => (toasts.push(e.text), { value: undefined }))
  // The engine's own footer and band: a line of its own and the other mods' slots.
  on('ui.render', (engine, e) => {
    const { Box, Button, Text } = engine.ui.resolve(e)

    return (
      <Box flexDirection="column">
        <Text>engine</Text>
        <Box width="100%">
          {world.slots.map(({ key, label }) => (
            <Box key={key}>
              <Button key={label} plain label={label} onPress={() => undefined} />
            </Box>
          ))}
        </Box>
      </Box>
    )
  })

  return { clock, open, toasts, logged, endpoint, windows, fable, sevenDay, usage, saved, fetched, world }
}

const line = async (footer: { find: (q: { type: 'Text'; text: RegExp }) => Promise<{ text: string } | undefined> }) =>
  (await footer.find({ type: 'Text', text: / · / }))?.text

test('the footer draws the line the status line drew, and ⚙ opens and closes the pane', async ($, on) => {
  const { clock, open } = stage(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  // The endpoint is read unawaited, after the session has started.
  await clock.settle()

  const footer = await $.ui.mount({ ...FOOTER, surface: 'terminal' })
  expect(await line(footer)).toBe(
    'Session ▱▱◇▱▱▱▱▱▱▱ 2% ↓ sobra 91% (3h53m) · Week ▰▱▱▱▱▱▱▱◇▱ 19% ↓ sobra 77% (1d6h) · Fable ▱▱▱▱▱▱▱▱◇▱ 0% (1d6h)',
  )

  await footer.press({ key: 'bar-limits-settings' })
  expect([...open]).toEqual(['bar-limits'])
  await footer.press({ key: 'bar-limits-settings' })
  expect([...open]).toEqual([])
  await footer.unmount()
})

test('a change of the windows too soon after the last read is read once the wait is over', async ($, on) => {
  const { clock, fable, windows } = stage(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await clock.settle()

  // Ten seconds on, Fable is at 40%: the endpoint was read under a minute ago.
  fable.percent = 40
  await clock.advance(10_000)
  await $.session.measure({ context: { window: 200_000 }, rateLimits: windows, changed: ['rateLimits'] })

  const footer = await $.ui.mount({ ...FOOTER, surface: 'terminal' })
  expect(await line(footer)).toMatch(/Fable ▱▱▱▱▱▱▱▱◇▱ 0%/)

  await clock.advance(50_000)
  expect(await line(footer)).toMatch(/Fable ▰▰▰▰▱▱▱▱◇▱ 40%/)
  await footer.unmount()
})

test('an endpoint that refuses leaves the models out, and why in the debug log', async ($, on) => {
  const { clock, endpoint, logged } = stage(on)

  endpoint.status = 401
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await clock.settle()

  const footer = await $.ui.mount({ ...FOOTER, surface: 'terminal' })
  expect(await line(footer)).toBe('Session ▱▱◇▱▱▱▱▱▱▱ 2% ↓ sobra 91% (3h53m) · Week ▰▱▱▱▱▱▱▱◇▱ 19% ↓ sobra 77% (1d6h)')
  expect(logged).toContain('reading the usage endpoint failed: status 401')
  await footer.unmount()
})

test('a resumed session drawn before session.start reached the mod: the line fills in from the last readings', async ($, on) => {
  const { clock } = stage(on, true)
  const footer = await $.ui.mount({ ...FOOTER, surface: 'terminal' })

  await clock.settle()
  expect(await line(footer)).toBe(
    'Session ▱▱◇▱▱▱▱▱▱▱ 2% ↓ sobra 91% (3h53m) · Week ▰▱▱▱▱▱▱▱◇▱ 19% ↓ sobra 77% (1d6h) · Fable ▱▱▱▱▱▱▱▱◇▱ 0% (1d6h)',
  )
  await footer.unmount()
})

test('a change holds for the session; saved as global, the next one starts with it', async ($, on) => {
  const { clock } = stage(on)
  const start = async () => {
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    await clock.settle()
  }

  await start()

  const footer = await $.ui.mount({ ...FOOTER, surface: 'terminal' })
  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })

  await pane.press({ key: 'showModels' })
  expect(await line(footer)).not.toMatch(/Fable/)
  await start()
  expect(await line(footer)).toMatch(/Fable/)

  await pane.press({ key: 'showModels' })
  await pane.press({ key: 'save-global' })
  await start()
  expect(await line(footer)).not.toMatch(/Fable/)
  await pane.unmount()
  await footer.unmount()
})

test('the pane hides parts and windows, recolors, and turns the line into one window a click passes on', async ($, on) => {
  const { clock, toasts } = stage(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await clock.settle()

  for (const surface of ['terminal', 'desktop'] as const) {
    const pane = await $.ui.mount({ ...PANE, surface })
    // In the desktop app the row is in the band above the prompt.
    const footer = await $.ui.mount(surface === 'desktop' ? { ...BAND, surface } : { ...FOOTER, surface })

    await pane.press({ key: 'showPace' })
    await pane.press({ key: 'showCursor' })
    await pane.press({ key: 'showModels' })
    // The terminal's run moved the clock 8 seconds on: the desktop's reads a minute less.
    expect(await line(footer)).toMatch(/^Session ▱{10} 2% \(3h5[23]m\) · Week ▰▱{9} 19% \(1d6h\)$/)

    await pane.input({ key: 'sessionLabel', text: 'x'.repeat(25) })
    expect(toasts.at(-1)).toBe('Entre 1 y 24 caracteres')
    await pane.input({ key: 'lowColor', text: 'nope!' })
    expect(toasts.at(-1)).toMatch(/no es un color/)
    await pane.input({ key: 'lowColor', text: '#00ff00' })
    expect((await footer.find({ type: 'Text', text: /^Session $/ }))?.props.color).toBe('#00ff00')

    await pane.press({ key: 'cycle' })
    const shown = async () => (await footer.find({ type: 'Button', key: 'bar-limits-next' }))?.text
    expect(await shown()).toMatch(/^Session ▱{10} 2% \(3h5[23]m\)$/)
    await footer.press({ key: 'bar-limits-next' })
    expect(await shown()).toBe('Week ▰▱▱▱▱▱▱▱▱▱ 19% (1d6h)')
    // Every 8 seconds by default, back to the first of the two.
    await clock.advance(8000)
    expect(await shown()).toMatch(/^Session/)

    await pane.press({ key: 'reset' })
    expect(await line(footer)).toMatch(/^Session ▱▱◇/)
    await footer.unmount()
    await pane.unmount()
  }
})

test('a number takes plain digits only: not an empty text, 0x10 or 1e2', async ($, on) => {
  const { clock, toasts } = stage(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await clock.settle()

  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })

  // The seconds of the cycle may be 0, which an empty text must not be taken for.
  for (const text of ['', '  ', '0x10', '1e2', '-5', '12.5', '3601']) {
    await pane.input({ key: 'cycleSeconds', text })
  }

  await pane.input({ key: 'paceFast', text: '99' })
  expect(toasts).toEqual([...Array<string>(7).fill('Un número entero de 0 a 3600'), 'Un número entero de 100 a 1000'])

  await pane.input({ key: 'cycleSeconds', text: ' 0 ' })
  await pane.input({ key: 'cycleSeconds', text: '12' })
  expect(toasts).toHaveLength(8)
  expect(await pane.find({ type: 'Input', key: 'cycleSeconds' })).toMatchObject({ props: { value: '12' } })
  await pane.unmount()
})

test('changes pressed together all land', async ($, on) => {
  const { clock } = stage(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await clock.settle()

  const footer = await $.ui.mount({ ...FOOTER, surface: 'terminal' })
  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })

  await Promise.all([
    pane.press({ key: 'showModels' }),
    pane.press({ key: 'showPace' }),
    pane.press({ key: 'showCursor' }),
  ])
  expect(await line(footer)).toMatch(/^Session ▱{10} 2% \(3h5[23]m\) · Week ▰▱{9} 19% \(1d6h\)$/)
  await pane.unmount()
  await footer.unmount()
})

test('a store that cannot keep the reading leaves it on screen, and the measure goes on', async ($, on) => {
  const { clock, logged, sevenDay, windows } = stage(on, false, 'unwritable')
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await clock.settle()

  const footer = await $.ui.mount({ ...FOOTER, surface: 'terminal' })
  sevenDay.percentUsed = 30

  // The measure reaches the hooks beneath, and the new reading is drawn.
  const measured = await $.session.measure({ context: { window: 200_000 }, rateLimits: windows, changed: ['context'] })

  expect(measured.changed).toEqual(['context'])
  expect(await line(footer)).toMatch(/Week ▰▰▰/)
  expect(logged).toContain('keeping the last reading failed: bar-limits: $.store.set: store down')
  await footer.unmount()
})

test('a store that cannot be read leaves the session on its defaults, and says why in the debug log', async ($, on) => {
  const { clock, logged } = stage(on, false, 'unreadable')
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await clock.settle()

  const footer = await $.ui.mount({ ...FOOTER, surface: 'terminal' })

  expect(await line(footer)).toMatch(/^Session ▱▱◇▱▱▱▱▱▱▱ 2%/)
  expect(logged).toContain('reading the saved settings failed: bar-limits: $.store.get: store down')
  expect(logged).toContain('reading the last readings failed: bar-limits: $.store.get: store down')
  await footer.unmount()
})

test('a save or a forget the store refuses says so, and the pane does not mark it done', async ($, on) => {
  const { clock, toasts, logged } = stage(on, false, 'unwritable')
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await clock.settle()

  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const source = async () => (await pane.find({ type: 'Text', text: /^Ajustes/ }))?.text

  await pane.press({ key: 'showWeek' })
  await pane.press({ key: 'save-project' })
  await pane.press({ key: 'save-global' })
  await pane.press({ key: 'forget-project' })
  expect(toasts).toEqual([
    'No se pudieron guardar los ajustes: bar-limits: $.store.set: store down',
    'No se pudieron guardar los ajustes: bar-limits: $.store.set: store down',
    'No se pudieron olvidar los ajustes del proyecto: bar-limits: $.store.delete: store down',
  ])
  expect(logged).toContain('saving the settings failed: bar-limits: $.store.set: store down')
  expect(logged).toContain("forgetting the project's settings failed: bar-limits: $.store.delete: store down")
  // Still the project's, still unsaved, and the project's settings still there to forget.
  expect(await source()).toBe('Ajustes de este proyecto · cambios sin guardar')
  expect(await pane.find({ key: 'forget-project' })).toBeDefined()
  await pane.unmount()
})

test('a start that fails says why in the debug log, and does not fail the session', async ($, on) => {
  const { clock, logged } = stage(on, false, 'state')

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await clock.settle()
  expect(logged).toContain('starting failed: bar-limits: $.state.set: state down')
})

test('the pane shows its fields in the mobile app too', async ($, on) => {
  const { clock } = stage(on)
  await $.session.start({ cwd: '/', surface: 'mobile', isInteractive: true })
  await clock.settle()

  const pane = await $.ui.mount({ ...PANE, surface: 'mobile' })

  expect(await pane.find({ type: 'Input', key: 'sessionLabel' })).toBeDefined()
  await pane.unmount()
})

type Mounted = {
  findAll: (q: {
    type: string
  }) => Promise<readonly { text: string; props: Record<string, unknown>; children: readonly unknown[] }[]>
}

// The texts of the row, each a run of one look, past what the engine draws.
const runs = async (footer: Mounted) =>
  (await footer.findAll({ type: 'Text' }))
    .filter(found => found.children.every(child => typeof child === 'string') && found.text !== 'engine')
    .map(found => ({ text: found.text, color: found.props.color, weight: found.props.weight }))

// A session started in the terminal, with only the session's window shown, on a pane and a footer.
const sessionOnly = async ($: Engine, on: On, setUp: (it: ReturnType<typeof stage>) => void = () => undefined) => {
  const it = stage(on)

  setUp(it)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await it.clock.settle()

  const footer = await $.ui.mount({ ...FOOTER, surface: 'terminal' })
  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })

  await pane.press({ key: 'showWeek' })
  await pane.press({ key: 'showModels' })

  // The session's window used `percent` of its limit, a fifth of its time run, as a measure reports it.
  const use = async (percent: number, resetsAt = '2026-10-22T12:07:00Z') => {
    Object.assign(it.windows[0] ?? {}, { percentUsed: percent, resetsAt })
    await $.session.measure({ context: { window: 200_000 }, rateLimits: it.windows, changed: ['context'] })

    return runs(footer)
  }

  return { ...it, footer, pane, use }
}

test('a use is drawn in the color of its tier, bold from the high one, over a bar with its empty part dim', async ($, on) => {
  const { footer, pane, use } = await sessionOnly($, on)

  await pane.press({ key: 'showPace' })
  await pane.press({ key: 'showReset' })

  const first = async (percent: number) => (await use(percent))[0]

  expect(await first(49)).toEqual({ text: 'Session ▰▰◆▰', color: '#8a8a8a', weight: undefined })
  expect(await first(50)).toMatchObject({ color: '#d78700', weight: undefined })
  expect(await first(70)).toMatchObject({ color: '#d78700', weight: undefined })
  expect(await first(71)).toMatchObject({ color: 'red', weight: 'semibold' })
  // The bar's empty cells have their own color.
  expect(await use(20)).toEqual([
    { text: 'Session ▰▰◇', color: '#8a8a8a', weight: undefined },
    { text: '▱▱▱▱▱▱▱', color: '#5f5f5f', weight: undefined },
    { text: ' 20%', color: '#8a8a8a', weight: undefined },
  ])
  await pane.unmount()
  await footer.unmount()
})

test('a pace is slack up to half the fair one, fast from a quarter over it, and says so with its own color', async ($, on) => {
  const { footer, pane, use } = await sessionOnly($, on)
  const arrows = async (percent: number) => (await use(percent)).filter(run => / [↑↓]|agota|sobra/.test(run.text))

  await pane.press({ key: 'showReset' })
  // A fifth of the time run: 10% is the half of the fair pace, 25% a quarter over it.
  expect(await arrows(10)).toEqual([
    { text: ' ↓', color: 'red', weight: undefined },
    { text: ' sobra 50%', color: '#8a8a8a', weight: undefined },
  ])
  expect(await arrows(11)).toEqual([])
  expect(await arrows(24)).toEqual([])
  expect(await arrows(25)).toEqual([
    { text: ' ↑', color: 'red', weight: undefined },
    { text: ' agota en 3h0m', color: '#8a8a8a', weight: undefined },
  ])
  expect((await use(25))[0]?.text).toBe('Session ▰▰◆')

  // A limit already spent runs out now; the arrow is not merged into the bold run before it.
  expect(await arrows(100)).toContainEqual({ text: ' ↑', color: 'red', weight: undefined })
  expect(await arrows(100)).toContainEqual({ text: ' agota en now', color: '#8a8a8a', weight: undefined })
  await pane.unmount()
  await footer.unmount()
})

test('a pace is judged only once a few percent of the window has run, and the cursor starts at its first cell', async ($, on) => {
  const { footer, pane, use } = await sessionOnly($, on)

  await pane.press({ key: 'showReset' })
  // 3 minutes of 5 hours run (1%): too soon to judge.
  expect((await use(50, '2026-10-22T13:04:00Z')).map(run => run.text).join('')).toBe('Session ◇▰▰▰▰▱▱▱▱▱ 50%')
  // A reset further than the window's length: nothing has run, and the cursor is on its first cell.
  expect((await use(0, '2026-10-22T13:40:20Z')).map(run => run.text).join('')).toBe('Session ◇▱▱▱▱▱▱▱▱▱ 0%')
  await pane.unmount()
  await footer.unmount()
})

test('a window past its reset counts as unused until a response reports the new one', async ($, on) => {
  const { footer, pane, use } = await sessionOnly($, on)

  expect((await use(80, '2026-10-22T08:00:00Z')).map(run => run.text).join('')).toBe('Session ▱▱▱▱▱▱▱▱▱▱ 0%')
  await pane.unmount()
  await footer.unmount()
})

test('the time to reset reads in days and hours, hours and minutes, or minutes', async ($, on) => {
  const { footer, pane, use } = await sessionOnly($, on)

  await pane.press({ key: 'showPace' })
  await pane.press({ key: 'showBar' })
  await pane.press({ key: 'showPercent' })

  const reset = async (at: string) =>
    (await use(0, at))
      .map(run => run.text)
      .join('')
      .replace('Session ', '')

  expect(await reset('2026-10-22T09:00:00Z')).toBe('(53m)')
  expect(await reset('2026-10-22T12:00:00Z')).toBe('(3h53m)')
  expect(await reset('2026-10-23T14:08:00Z')).toBe('(1d6h)')
  await pane.unmount()
  await footer.unmount()
})

test('the pane hides the bar, the share, the pace and the time to reset one by one', async ($, on) => {
  const { footer, pane, use } = await sessionOnly($, on)
  const text = async () => (await use(30)).map(run => run.text).join('')

  expect(await text()).toBe('Session ▰▰◆▱▱▱▱▱▱▱ 30% ↑ agota en 2h20m (4h0m)')
  await pane.press({ key: 'showBar' })
  expect(await text()).toBe('Session 30% ↑ agota en 2h20m (4h0m)')
  await pane.press({ key: 'showPercent' })
  expect(await text()).toBe('Session ↑ agota en 2h20m (4h0m)')
  await pane.press({ key: 'showPace' })
  expect(await text()).toBe('Session (4h0m)')
  await pane.press({ key: 'showReset' })
  expect(await text()).toBe('Session')
  await pane.unmount()
  await footer.unmount()
})

const BASE = 'Session ▱▱◇▱▱▱▱▱▱▱ 2% ↓ sobra 91% (3h53m) · Week ▰▱▱▱▱▱▱▱◇▱ 19% ↓ sobra 77% (1d6h)'
const FABLE = ' · Fable ▱▱▱▱▱▱▱▱◇▱ 0% (1d6h)'
const begin = async ($: Engine, it: ReturnType<typeof stage>) => {
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await it.clock.settle()
}

test('only a weekly limit with a model’s name and a percent is a model', async ($, on) => {
  const it = stage(on)

  it.usage.limits.push(
    { kind: 'weekly_scoped', percent: 10, resets_at: '2026-10-23T15:00:00+00:00', scope: null },
    { kind: 'weekly_scoped', percent: '5', scope: { model: { display_name: 'NoPercent' } } },
    { kind: 'other', percent: 5, scope: { model: { display_name: 'Other' } } },
    { kind: 'weekly_scoped', percent: 30, resets_at: '', scope: { model: { display_name: 'NoReset' } } },
  )
  await begin($, it)

  const footer = await $.ui.mount({ ...FOOTER, surface: 'terminal' })

  expect(await line(footer)).toBe(`${BASE}${FABLE} · NoReset ▰▰▰▱▱▱▱▱▱▱ 30%`)
  await footer.unmount()
})

test('the usage endpoint is read with the session’s credential and its beta header, and not without a credential', async ($, on) => {
  const it = stage(on)

  await begin($, it)
  expect(it.fetched).toEqual([
    {
      url: 'https://api.anthropic.com/api/oauth/usage',
      init: { auth: 'handle', headers: { 'anthropic-beta': 'oauth-2025-04-20' } },
    },
  ])
})

test('off a subscription, with no credential, the endpoint is not read', async ($, on) => {
  const it = stage(on)

  it.world.handle = null
  await begin($, it)
  expect(it.fetched).toEqual([])
})

test('the endpoint is read once for the changes within a minute of the last read', async ($, on) => {
  const it = stage(on)

  await begin($, it)
  expect(it.fetched).toHaveLength(1)

  await it.clock.advance(10_000)
  for (let n = 0; n < 2; n++) {
    await $.session.measure({ context: { window: 200_000 }, rateLimits: it.windows, changed: ['rateLimits'] })
  }

  expect(it.fetched).toHaveLength(1)
  await it.clock.advance(50_000)
  expect(it.fetched).toHaveLength(2)
  await it.clock.advance(120_000)
  expect(it.fetched).toHaveLength(2)
})

test('the last readings and models are kept for the next session, and a measure with no windows keeps them', async ($, on) => {
  const it = stage(on)

  await begin($, it)
  expect(it.saved.models).toMatchObject([{ kind: 'model', name: 'Fable' }])
  expect(it.saved.limits).toMatchObject([{ kind: 'five_hour' }, { kind: 'seven_day' }])

  const footer = await $.ui.mount({ ...FOOTER, surface: 'terminal' })

  await $.session.measure({ context: { window: 200_000 }, rateLimits: [], changed: ['context'] })
  expect(await line(footer)).toBe(`${BASE}${FABLE}`)

  // The next session has no windows measured yet, and the endpoint refuses.
  it.world.hasWindows = false
  it.endpoint.status = 401
  await it.clock.advance(70_000)
  await begin($, it)
  expect(await line(footer)).toMatch(/^Session ▱▱◇▱▱▱▱▱▱▱ 2% ↓ sobra 91% \(3h5\dm\) · Week .* · Fable /)
  await footer.unmount()
})

test('what the store holds as the last readings or models, if it is no list, is ignored', async ($, on) => {
  const it = stage(on)

  it.saved.limits = 'junk'
  it.saved.models = 'junk'
  it.world.hasWindows = false
  it.endpoint.status = 401
  await begin($, it)

  const footer = await $.ui.mount({ ...FOOTER, surface: 'terminal' })

  expect(await runs(footer)).toEqual([])
  await footer.unmount()
})

test('a start that fails is tried again at the next drawing', async ($, on) => {
  const it = stage(on, false, 'state')

  await begin($, it)
  expect(it.logged).toContain('starting failed: bar-limits: $.state.set: state down')

  it.world.isStateDown = false

  const footer = await $.ui.mount({ ...FOOTER, surface: 'terminal' })

  await it.clock.settle()
  expect(await line(footer)).toMatch(/^Session/)
  await footer.unmount()
})

test('a new start replaces the old redraw, which draws the line again each minute', async ($, on) => {
  const it = stage(on)

  await begin($, it)
  await begin($, it)
  it.world.invalidations = 0
  await it.clock.advance(60_000)
  expect(it.world.invalidations).toBe(1)
})

test('the pane picks the windows by their own switches, and with none shown only the ⚙ is drawn', async ($, on) => {
  const it = stage(on)

  await begin($, it)

  const footer = await $.ui.mount({ ...FOOTER, surface: 'terminal' })
  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })

  // A long line is cut at its end.
  expect((await footer.find({ type: 'Text', text: / · / }))?.props.wrap).toBe('truncate-end')

  await pane.press({ key: 'showSession' })
  expect(await line(footer)).toBe(`${BASE.slice(BASE.indexOf('Week'))}${FABLE}`)
  await pane.press({ key: 'showSession' })
  await pane.press({ key: 'showWeek' })
  expect(await line(footer)).toBe(`${BASE.slice(0, BASE.indexOf(' · Week'))}${FABLE}`)

  await pane.press({ key: 'showWeek' })
  await pane.press({ key: 'showSession' })
  await pane.press({ key: 'showWeek' })
  await pane.press({ key: 'showModels' })
  expect(await runs(footer)).toEqual([])
  expect((await footer.findAll({ type: 'Button' })).map(button => button.props.label)).toEqual(['⚙'])
  await pane.unmount()
  await footer.unmount()
})

test('a cycle runs only while the line shows one window at a time, for as many seconds as set, and the old one stops', async ($, on) => {
  const it = stage(on)

  await begin($, it)

  const footer = await $.ui.mount({ ...FOOTER, surface: 'terminal' })
  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const shown = async () => (await footer.find({ type: 'Button', key: 'bar-limits-next' }))?.text

  // All in a line, nothing cycles behind the scenes.
  await it.clock.advance(8000)
  await pane.press({ key: 'cycle' })
  expect(await shown()).toMatch(/^Session/)

  // The 8 seconds' cycle gives way to one of 100.
  await pane.input({ key: 'cycleSeconds', text: '100' })
  await it.clock.advance(8000)
  expect(await shown()).toMatch(/^Session/)
  await it.clock.advance(92_000)
  expect(await shown()).toMatch(/^Week/)

  // With 0 seconds only a click passes on.
  await pane.input({ key: 'cycleSeconds', text: '0' })
  await it.clock.advance(300_000)
  expect(await shown()).toMatch(/^Week/)
  await pane.unmount()
  await footer.unmount()
})

test('the row is in the footer outside the desktop app, and in the band above the prompt inside it unless a survey is there', async ($, on) => {
  const it = stage(on)

  await begin($, it)

  const drawn = async (props: object) => {
    const mounted = await $.ui.mount(props as never)
    const found = [(await runs(mounted)).length > 0, (await mounted.findAll({ type: 'Button' })).length > 0]

    await mounted.unmount()

    return found
  }

  expect(await drawn({ ...FOOTER, surface: 'terminal' })).toEqual([true, true])
  expect(await drawn({ ...FOOTER, surface: 'desktop' })).toEqual([false, false])
  expect(await drawn({ ...BAND, surface: 'terminal' })).toEqual([false, false])
  expect(await drawn({ ...BAND, props: { ...BAND.props, hasSurvey: true }, surface: 'desktop' })).toEqual([
    false,
    false,
  ])
  expect(await drawn({ ...BAND, surface: 'desktop' })).toEqual([true, true])
})

test('the other mods’ slots are laid in their rows’ and places’ order, with the limits in the first row', async ($, on) => {
  const it = stage(on)

  it.world.slots = [
    { key: 'slot:0.3:late', label: 'late' },
    { key: 'slot:0:none', label: 'none' },
    { key: 'slot:1.1:below', label: 'below' },
    { key: 'slot:0.0:early', label: 'early' },
    { key: 'x-slot:2.1:not-a-slot', label: 'plain' },
  ]
  await begin($, it)

  const footer = await $.ui.mount({ ...FOOTER, surface: 'terminal' })

  expect((await footer.findAll({ type: 'Button' })).map(button => button.props.label)).toEqual([
    'plain',
    'early',
    '⚙',
    'late',
    'none',
    'below',
  ])
  // What the engine drew stays, and the Box that held the other mods' slots is gone with them.
  expect(await footer.find({ type: 'Text', text: 'engine' })).toBeDefined()
  expect((await footer.findAll({ type: 'Box' })).filter(box => box.children.length === 0)).toEqual([])
  await footer.unmount()
})

test('the Box that held another mod’s slot is taken out with it', async ($, on) => {
  const it = stage(on)

  it.world.slots = [{ key: 'slot:5.1:other', label: 'other' }]
  await begin($, it)

  const footer = await $.ui.mount({ ...FOOTER, surface: 'terminal' })

  expect((await footer.findAll({ type: 'Box' })).filter(box => box.children.length === 0)).toEqual([])
  await footer.unmount()
})

test('the ⚙ button opens the pane while another pane is open', async ($, on) => {
  const it = stage(on)

  await begin($, it)
  it.open.add('other')

  const footer = await $.ui.mount({ ...FOOTER, surface: 'terminal' })

  await footer.press({ key: 'bar-limits-settings' })
  expect([...it.open]).toEqual(['other', 'bar-limits'])
  await footer.unmount()
})

test('the pane shows a switch on as a full square and off dim, the mode picked as a pill, and a swatch per color', async ($, on) => {
  const it = stage(on)

  await begin($, it)

  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const bar = async () => {
    const found = await pane.find({ type: 'Button', key: 'showBar' })

    return [found?.text, found?.props.dimColor]
  }

  expect(await bar()).toEqual(['■ Barra', false])
  await pane.press({ key: 'showBar' })
  expect(await bar()).toEqual(['□ Barra', true])

  expect(await pane.find({ type: 'Text', text: ' Todas en una línea ' })).toBeDefined()
  expect(await pane.find({ key: 'all' })).toBeUndefined()
  expect(await pane.find({ key: 'cycle' })).toBeDefined()
  await pane.press({ key: 'cycle' })
  expect(await pane.find({ type: 'Text', text: ' Una cada vez; un clic pasa a la siguiente ' })).toBeDefined()
  expect(await pane.find({ key: 'all' })).toBeDefined()
  expect(await pane.find({ key: 'cycle' })).toBeUndefined()

  expect((await pane.findAll({ type: 'Text', text: '■' })).map(swatch => swatch.props.color)).toEqual([
    '#8a8a8a',
    '#d78700',
    'red',
    '#5f5f5f',
    'red',
    '#8a8a8a',
  ])
  await pane.unmount()
})

test('only the terminal marks a field with a ground', async ($, on) => {
  const it = stage(on)

  await begin($, it)

  const grounds = async (surface: 'terminal' | 'mobile') => {
    const pane = await $.ui.mount({ ...PANE, surface })
    const found = (await pane.findAll({ type: 'Box' })).filter(box => box.props.backgroundColor === 'subtle')

    await pane.unmount()

    return found.length > 0
  }

  expect(await grounds('terminal')).toBe(true)
  expect(await grounds('mobile')).toBe(false)
})

test('a label of 1 to 24 characters, a color of three or six digits or a name, trimmed, and a number in its range', async ($, on) => {
  const it = stage(on)

  await begin($, it)

  const footer = await $.ui.mount({ ...FOOTER, surface: 'terminal' })
  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const refusals = async (key: string, texts: string[]) => {
    const before = it.toasts.length

    for (const text of texts) {
      await pane.input({ key, text })
    }

    return it.toasts.length - before
  }

  expect(await refusals('sessionLabel', ['', 'x'.repeat(25)])).toBe(2)
  expect(await refusals('sessionLabel', ['x'.repeat(24), '  Hola  '])).toBe(0)
  expect((await runs(footer))[0]?.text).toMatch(/^Hola /)
  expect(await refusals('lowColor', ['#123456789', '#12345', 'not a color!'])).toBe(3)
  expect(await refusals('lowColor', ['  #0f0  ', '#00ff00', 'warning'])).toBe(0)
  expect(await refusals('highFrom', ['101', '-1'])).toBe(2)
  expect(await refusals('highFrom', ['100', '0', ' 71 '])).toBe(0)
  expect(await refusals('midFrom', ['0', '100'])).toBe(0)
  expect(await refusals('paceFast', ['99', '1001'])).toBe(2)
  expect(await refusals('paceFast', ['100', '1000'])).toBe(0)
  await pane.unmount()
  await footer.unmount()
})

test('a session that tells no project root saves nothing for a project, and says so', async ($, on) => {
  const it = stage(on)

  it.world.rootRefusal = 'no root'
  await begin($, it)

  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })

  await pane.press({ key: 'showWeek' })
  await pane.press({ key: 'save-project' })
  expect(it.toasts).toEqual(['Esta sesión no dice cuál es su proyecto'])
  expect(it.saved['settings:null']).toBeUndefined()
  expect((await pane.find({ type: 'Text', text: /^Ajustes/ }))?.text).toBe('Ajustes por defecto · cambios sin guardar')
  await pane.unmount()
})

test('a session starts with its project’s saved settings, else the global ones, and the pane says which', async ($, on) => {
  const it = stage(on)

  it.saved['settings:/repo'] = { showWeek: false }
  it.saved.settings = { showSession: false }
  await begin($, it)

  const footer = await $.ui.mount({ ...FOOTER, surface: 'terminal' })
  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const source = async () => (await pane.find({ type: 'Text', text: /^Ajustes/ }))?.text
  const note = () => pane.find({ type: 'Text', text: 'Este proyecto tiene los suyos, que mandan al arrancar.' })

  expect(await line(footer)).toBe(`${BASE.slice(0, BASE.indexOf(' · Week'))}${FABLE}`)
  expect(await source()).toBe('Ajustes de este proyecto')
  expect(await note()).toBeUndefined()

  // Forgotten, the session takes the global ones.
  await pane.press({ key: 'forget-project' })
  expect(it.saved['settings:/repo']).toBeUndefined()
  expect(await source()).toBe('Ajustes globales')
  expect(await line(footer)).toBe(`${BASE.slice(BASE.indexOf('Week'))}${FABLE}`)

  // A project with no settings of its own says nothing of them.
  expect(await note()).toBeUndefined()
  await pane.unmount()
  await footer.unmount()
})

test('a change saved for the project is the project’s at once, and unsaved against it', async ($, on) => {
  const it = stage(on)

  await begin($, it)

  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const source = async () => (await pane.find({ type: 'Text', text: /^Ajustes/ }))?.text
  const variant = async () => (await pane.find({ type: 'Button', key: 'save-project' }))?.props.variant

  expect(await variant()).toBe('secondary')
  await pane.press({ key: 'showSession' })
  expect(await variant()).toBe('primary')
  await pane.press({ key: 'save-project' })
  expect(await source()).toBe('Ajustes de este proyecto')
  expect(await variant()).toBe('secondary')
  expect(await pane.find({ key: 'forget-project' })).toBeDefined()
  expect(it.saved['settings:/repo']).toMatchObject({ showSession: false })
  expect(it.saved.settings).toBeUndefined()

  // Changed and changed back, it is the saved one again.
  await pane.press({ key: 'showWeek' })
  expect(await source()).toBe('Ajustes de este proyecto · cambios sin guardar')
  await pane.press({ key: 'showWeek' })
  expect(await source()).toBe('Ajustes de este proyecto')
  expect(it.toasts).toEqual([])
  await pane.unmount()
})

test('settings from the defaults are unsaved against the defaults, whatever another session saved since', async ($, on) => {
  const it = stage(on)

  await begin($, it)

  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })

  it.saved.settings = { showSession: false }
  await pane.press({ key: 'showWeek' })
  await pane.press({ key: 'showWeek' })
  expect((await pane.find({ type: 'Text', text: /^Ajustes/ }))?.text).toBe('Ajustes por defecto')
  await pane.unmount()
})

test('saved globally, the settings are every project’s, and the project’s own are said to rule', async ($, on) => {
  const it = stage(on)

  await begin($, it)

  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const note = () => pane.find({ type: 'Text', text: 'Este proyecto tiene los suyos, que mandan al arrancar.' })

  await pane.press({ key: 'showSession' })
  await pane.press({ key: 'save-global' })
  expect(it.saved.settings).toMatchObject({ showSession: false })
  expect(it.saved['settings:/repo']).toBeUndefined()
  expect(await note()).toBeUndefined()

  // Saved for the project, they are the session's own, which needs no note; saved globally again, the project's rule.
  await pane.press({ key: 'save-project' })
  expect(await note()).toBeUndefined()
  await pane.press({ key: 'save-global' })
  expect(await note()).toBeDefined()
  await pane.unmount()
})
