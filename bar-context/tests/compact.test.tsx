import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

const SURFACES = ['terminal', 'desktop'] as const
const PROPS = { modes: ['focus'] }
const BAND = {
  hasSurvey: false,
  isCollapsed: false,
  isWorking: false,
  maxRows: 10,
  bodyColumns: 80,
  scroll: { offset: 0, bodyRows: 10 },
  view: {},
}

// The session as the mod reads it: how full its context window is, undefined
// while it has no figure, and whether it can be compacted now.
const stage = ($: Engine, on: On, surface: (typeof SURFACES)[number] = 'terminal', settings: object = {}) => {
  const footer = () => $.ui.mount({ plugin: 'bar-context', surface, component: 'SessionMode', props: PROPS })
  const band = () => $.ui.mount({ plugin: 'bar-context', surface, component: 'AbovePrompt', props: BAND })
  const it = {
    percent: 40 as number | undefined,
    compactions: 0,
    /** A turn is running: the engine refuses to compact. */
    isBusy: false,
    /** Why a hook vetoes the compaction, none for no veto. */
    veto: null as string | null,
    toasts: [] as string[],
    /**
     * Where the row is in a session started now, with the figure of the
     * moment: the terminal's footer, the desktop app's band above the prompt,
     * its footer being one short line that hides what does not fit.
     */
    row: async () => {
      await $.session.start({ cwd: '/repo', surface, isInteractive: true })

      return surface === 'desktop' ? band() : footer()
    },
    /** The other one. */
    away: () => (surface === 'desktop' ? footer() : band()),
    /** The engine measures the window again, as after a response. */
    measure: () =>
      $.session.measure({
        context: { window: 200_000, ...(it.percent === undefined ? {} : { percent: it.percent }) },
        rateLimits: [],
        changed: ['context'],
      }),
  }

  mock.clock(on, { now: 1_700_000_000_000 })
  mock.env(on, {})
  mock.store(on, { settings })
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: { window: 200_000, ...(it.percent === undefined ? {} : { percent: it.percent }) },
      rateLimits: [],
    },
  }))
  on('session.measure', (_, e) => ({ context: e.context, rateLimits: e.rateLimits, changed: e.changed }))
  on('session.compact', () => {
    if (it.isBusy) {
      throw new Error('a turn is running')
    }

    // A hook that vetoes it: the window stays as it is.
    if (it.veto !== null) {
      return { skip: it.veto }
    }

    it.compactions += 1
    // A window just compacted has no figure until its next response.
    it.percent = undefined

    return { messages: [{ role: 'user', text: 'The summary.', toolUses: [] }] }
  })
  on('ui.toast', (_, e) => {
    it.toasts.push(e.text)

    return { value: undefined }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.render', { component: 'SessionMode' }, (engine, e) => {
    const { Text } = engine.ui.resolve(e)

    return <Text>beneath</Text>
  })
  on('ui.render', { component: 'AbovePrompt' }, (engine, e) => {
    const { Text } = engine.ui.resolve(e)

    return <Text>beneath</Text>
  })

  return it
}

const COMPACT = { type: 'Button', key: 'compact' } as const

for (const surface of SURFACES) {
  test(`${surface}: offers to compact once the context is filling up, in the row after what is drawn beneath`, async ($, on) => {
    const it = stage($, on, surface)
    const roomy = await it.row()

    expect(await roomy.find(COMPACT)).toBeUndefined()
    // Beneath the footer's row is what the chain drew; the band's row is the
    // mod's own, core stacking the other mods' rows, so beneath it is core's.
    const laid = JSON.stringify(await roomy.find({ type: 'Box' }))
    const beneath = laid.indexOf(surface === 'desktop' ? '"type":"engine"' : '["beneath"]')

    expect(beneath).toBeGreaterThan(-1)
    expect(laid.indexOf('["Context')).toBeGreaterThan(beneath)
    await roomy.unmount()

    it.percent = 74

    const filling = await it.row()

    expect((await filling.findAll({ type: 'Box' })).map(found => found.props.backgroundColor)).toContain('#cc0000')
    expect((await filling.find(COMPACT))?.props.label).toBe('compactar 74%')
    expect(await (await it.away()).find(COMPACT)).toBeUndefined()

    await filling.press({ key: 'compact' })
    expect(it.compactions).toBe(1)
    expect(it.toasts).toEqual([])
    // Compacted: the button is gone from the same drawing.
    expect(await filling.find(COMPACT)).toBeUndefined()
    await filling.unmount()
  })
}

test('the button is offered from 65% of the window, and follows each measure', async ($, on) => {
  const it = stage($, on)

  it.percent = 64

  const footer = await it.row()

  expect(await footer.find(COMPACT)).toBeUndefined()

  it.percent = 65
  await it.measure()
  expect((await footer.find(COMPACT))?.props.label).toBe('compactar 65%')

  it.percent = 12
  await it.measure()
  expect(await footer.find(COMPACT)).toBeUndefined()

  await footer.unmount()
})

test('pressed while a turn runs, it says it cannot compact and stays', async ($, on) => {
  const it = stage($, on)

  it.percent = 90
  it.isBusy = true

  const footer = await it.row()

  await footer.press({ key: 'compact' })
  expect(it.compactions).toBe(0)
  expect(it.toasts).toEqual(['No se puede compactar mientras hay un turno en marcha.'])
  expect((await footer.find(COMPACT))?.props.label).toBe('compactar 90%')

  await footer.unmount()
})

test('vetoed by a hook, it says so and leaves the window as it was', async ($, on) => {
  const it = stage($, on)

  it.percent = 90
  it.veto = 'a PreCompact hook said no'

  const footer = await it.row()

  // The window shrinks behind the veto's back: a measure after it would show.
  it.percent = 20
  await footer.press({ key: 'compact' })
  expect(it.compactions).toBe(0)
  expect(it.toasts).toEqual(['No se ha compactado: a PreCompact hook said no'])
  expect((await footer.find(COMPACT))?.props.label).toBe('compactar 90%')

  await footer.unmount()
})

test('the pane sets its threshold, label and color', async ($, on) => {
  const it = stage($, on, 'terminal', { compactFrom: 80, compactLabel: 'compact', compactColor: '#0000cc' })

  it.percent = 74

  const footer = await it.row()

  expect(await footer.find(COMPACT)).toBeUndefined()

  it.percent = 85
  await it.measure()
  expect((await footer.find(COMPACT))?.props.label).toBe('compact 85%')
  expect((await footer.findAll({ type: 'Box' })).map(found => found.props.backgroundColor)).toContain('#0000cc')
  await footer.unmount()
})

test('the pane hides it, however full the window', async ($, on) => {
  const it = stage($, on, 'terminal', { showCompact: false })

  it.percent = 95
  expect(await (await it.row()).find(COMPACT)).toBeUndefined()
})
