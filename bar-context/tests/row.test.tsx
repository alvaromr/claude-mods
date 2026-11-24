import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

const PANE = {
  plugin: 'bar-context',
  component: 'Pane',
  requestId: 'bar-context',
  props: {
    title: 'Contexto',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const
const FOOTER = { plugin: 'bar-context', component: 'SessionMode', props: { modes: [] } } as const

// A session on Opus 5.5 at high effort, a fifth of its window used; the engine's
// footer holds its mode line and another mod's slot row; panes and toasts recorded.
const stage = (
  $: Engine,
  on: On,
  isStoreDown: boolean | 'unwritable' = false,
  /** What the store holds before the session starts. */
  saved: Record<string, unknown> = {},
) => {
  const open = new Set<string>()
  const it = {
    clock: mock.clock(on, { now: 1_700_000_000_000 }),
    open,
    toasts: [] as string[],
    /** The slash commands the row ran, as typed. */
    ran: [] as string[],
    /** Why a slash command cannot run, as a hook that denies it says; none when it can. */
    refusal: null as string | null,
    /** The state refuses to keep the settings, so a start fails. */
    isStateDown: false,
    /** What went to the debug log. */
    logged: [] as string[],
    start: () => $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true }),
    /** How long the next request takes to be answered, its output tokens, and what it reads from and writes to the cache. */
    answer: { ms: 0, tokens: 0, read: 0, write: 0 },
    /** The window's fill as the engine has it; none before a response of this session. */
    fill: { tokens: 38_000, window: 200_000, percent: 19 } as { tokens?: number; window: number; percent?: number },
    /** What the session has cost in dollars; none where the engine keeps no ledger. */
    cost: undefined as number | undefined,
    /** A request of the main conversation to that model, read to its end. */
    step: async (model = 'claude-opus-5-5') => {
      const stream = $.turn.step({ turnId: 't1', index: 0, model, effort: 'xhigh', messageCount: 1 })

      let next = await stream.next()

      while (next.done !== true) {
        next = await stream.next()
      }
    },
  }

  if (isStoreDown === 'unwritable') {
    // A project with saved settings, in a store that keeps and drops nothing.
    on('session.root', () => ({ value: '/repo' }))
    on('store.get', (_, e) => ({ value: e.key === 'settings:/repo' ? {} : undefined }))
    on('store.set', () => ({ deny: 'disk full' }))
    on('store.delete', () => ({ deny: 'disk full' }))
  } else if (isStoreDown) {
    on('store.get', () => ({ deny: 'store down' }))
  } else {
    // The store as `saved` stands whenever it is read.
    on('store.get', (_, e) => ({ value: saved[e.key] }))
    on('store.set', (_, e) => ((saved[e.key] = e.value), { value: undefined }))
    on('store.delete', (_, e) => (Reflect.deleteProperty(saved, e.key), { value: undefined }))
  }

  mock.env(on, {})
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('classic.SessionStart', () => ({}))
  on('classic.PostModelSwitch', () => ({}))
  on('session.measure', (_, e) => ({ context: e.context, rateLimits: e.rateLimits, changed: e.changed }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('settings.read', () => ({ value: { effortLevel: 'high' } }))
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: it.fill,
      rateLimits: [
        { kind: 'five_hour', percentUsed: 10 },
        { kind: 'seven_day', percentUsed: 10 },
      ],
      ...(it.cost === undefined ? {} : { cost: { usd: it.cost } }),
    },
  }))
  on('turn.step', async function* (_, e) {
    await it.clock.advance(it.answer.ms)

    return {
      turnId: e.turnId,
      index: e.index,
      answer: '',
      toolUses: [],
      stopReason: 'end_turn',
      usage: {
        model: e.model,
        input_tokens: 10,
        output_tokens: it.answer.tokens,
        cache_read_input_tokens: it.answer.read,
        cache_creation_input_tokens: it.answer.write,
      },
    }
  })
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
  on('ui.open', ($, e) =>
    pressing > 0 ? (open.add(e.id), { value: { isPlaced: true } }) : { value: { isPlaced: false, reason: 'unasked' } },
  )
  on('ui.close', ($, e) => (open.delete(e.id), { value: undefined }))
  on('ui.panes', () => ({
    value: [...open].map(id => ({ id, title: id, isShown: true, isFocused: false, isPlaced: true })),
  }))
  on('ui.toast', (_, e) => (it.toasts.push(e.text), { value: undefined }))
  on('ui.log', (_, e) => (it.logged.push(e.text), { value: undefined }))
  on('state.set', (_, e, next) => (it.isStateDown && e.key === 'settings' ? { deny: 'state down' } : next(e)))
  on('command.run', (_, e) => {
    if (it.refusal !== null) {
      throw new Error(it.refusal)
    }

    it.ran.push(`/${e.command} ${e.args}`)

    return { text: '' }
  })
  on('ui.render', { component: 'SessionMode' }, (engine, e) => {
    const { Box, Button, Text } = engine.ui.resolve(e)

    return (
      <Box flexDirection="column">
        <Text>auto mode on</Text>
        <Box width="100%">
          <Box key="slot:1.1:other">
            <Button key="other" plain label="other" onPress={() => undefined} />
          </Box>
        </Box>
      </Box>
    )
  })

  return it
}

type Drawn = {
  findAll: (query: { type: 'Text' }) => Promise<readonly { text: string; children: readonly unknown[] }[]>
}

// The words drawn, each once, a Text that holds others told by them: the
// engine's mode line, then the row as it reads, its buttons' words in it.
const texts = async (ui: Drawn) => {
  const words = (await ui.findAll({ type: 'Text' }))
    .filter(found => found.children.every(child => typeof child === 'string'))
    .map(found => found.text)

  return [words[0], words.slice(1).join('')]
}

test('the row shows model, effort, context and speed after the mode line and before the slot rows', async ($, on) => {
  const it = stage($, on)

  await it.start()

  const footer = await $.ui.mount({ ...FOOTER, surface: 'terminal' })
  expect((await texts(footer)).slice(0, 2)).toEqual(['auto mode on', 'Opus 5.5 high · Context ▰▱▱▱▱▱▱▱▱▱ 19%'])
  expect((await footer.findAll({ type: 'Button' })).map(button => button.props.label)).toEqual([
    'Opus 5.5',
    'high',
    '⚙',
    'other',
  ])

  // 500 tokens in 2 s, then 300 in 10 s: the last one's speed, and the session's.
  it.answer = { ms: 2000, tokens: 500, read: 0, write: 0 }
  await it.step()
  it.answer = { ms: 10_000, tokens: 300, read: 0, write: 0 }
  await it.step()
  expect((await texts(footer))[1]).toBe('Opus 5.5 xhigh · Context ▰▱▱▱▱▱▱▱▱▱ 19% · ⚡ 30 tok/s (ø 66)')
  await footer.unmount()
})

test('the model shown is the one switched to, before the session has it, and the one each request runs on', async ($, on) => {
  const it = stage($, on)

  await it.start()

  const footer = await $.ui.mount({ ...FOOTER, surface: 'terminal' })
  // The session still says Opus 5.5 when the switch to Fable 5.2 is told.
  await $.classic.PostModelSwitch({
    session_id: 'abc',
    cwd: '/repo',
    transcript_path: '/repo/abc.jsonl',
    from_model: 'claude-opus-5-5',
    to_model: 'claude-fable-5-2',
    requested_model: 'fable',
    source: 'command',
    context_tokens: 0,
    prompt_cache_warm: false,
    cache_ttl: '1h',
    estimated_cache_write_usd: 0,
    pricing: 'catalog',
  })
  expect((await texts(footer))[1]).toMatch(/^Fable 5\.2 high · /)

  // A switch no event told of: the next request's model.
  await it.step('claude-sonnet-5-5')
  expect((await texts(footer))[1]).toMatch(/^Sonnet 5\.5 xhigh · /)
  await footer.unmount()
})

test('the cache counts down, turns red near its end and cold after, and a miss tells its cause', async ($, on) => {
  const it = stage($, on)
  const cachePart = async (footer: Parameters<typeof texts>[0]) => (await texts(footer))[1]?.split(' · ')[2]

  await it.start()

  // An hour on a subscription within its plan, by the rules; 261k tokens in it.
  it.answer = { ms: 0, tokens: 0, read: 250_990, write: 10_000 }
  await it.step()

  const footer = await $.ui.mount({ ...FOOTER, surface: 'terminal' })
  expect(await cachePart(footer)).toBe('Cache 1h0m (261k)')
  await it.clock.advance(55 * 60_000)
  expect(await cachePart(footer)).toBe('Cache 5m (261k)')
  expect((await footer.find({ type: 'Text', text: /^Cache 5m$/ }))?.props.color).toBe('red')
  await it.clock.advance(5 * 60_000)
  expect(await cachePart(footer)).toBe('Cache fría (261k)')

  // The next request writes it all again: lapsed by the clock.
  it.answer = { ms: 0, tokens: 0, read: 0, write: 261_000 }
  await it.step()
  expect(await cachePart(footer)).toBe('Cache 1h0m (261k) ⚠ miss ttl_expired_1h')

  // A request that reads it back is no miss; the last one stays ten minutes.
  it.answer = { ms: 0, tokens: 0, read: 260_000, write: 1000 }
  await it.step()
  await it.clock.advance(10 * 60_000)
  expect(await cachePart(footer)).toBe('Cache 50m (261k)')

  // Another model has no cache of its own.
  it.answer = { ms: 0, tokens: 0, read: 0, write: 261_000 }
  await it.step('claude-sonnet-5-5')
  expect(await cachePart(footer)).toBe('Cache 1h0m (261k) ⚠ miss model_changed')
  await footer.unmount()
})

test('a resumed session drawn before session.start reached the mod: the row fills in at the start, its window as the resume left it', async ($, on) => {
  const it = stage($, on)

  it.fill = { window: 200_000 }
  await $.classic.SessionStart({
    session_id: 'abc',
    cwd: '/repo',
    transcript_path: '/repo/abc.jsonl',
    source: 'resume',
    seconds_since_last_response: 60,
    context_tokens: 50_000,
  })

  const footer = await $.ui.mount({ ...FOOTER, surface: 'terminal' })

  await it.clock.settle()
  await it.start()
  expect((await texts(footer))[1]).toBe('Opus 5.5 high · Context ▰▰▱▱▱▱▱▱▱▱ 25% · Cache 59m (50k)')

  // A response of this session reports the window again.
  it.fill = { tokens: 52_000, window: 200_000, percent: 26 }
  await $.session.measure({ context: it.fill, rateLimits: [], changed: ['context'] })
  expect((await texts(footer))[1]).toMatch(/Context ▰▰▱▱▱▱▱▱▱▱ 26%/)
  await footer.unmount()
})

test('the pane takes a label of 1 to 24 characters and a color it can paint, and says why it refuses others', async ($, on) => {
  const it = stage($, on)

  await it.start()

  const footer = await $.ui.mount({ ...FOOTER, surface: 'terminal' })
  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const typed = (key: string, text: string) => $.ui.input({ plugin: 'bar-context', key, text })

  await typed('contextLabel', '   ')
  await typed('contextLabel', 'x'.repeat(25))
  await typed('lowColor', 'not a color')
  expect(it.toasts).toEqual([
    'Entre 1 y 24 caracteres',
    'Entre 1 y 24 caracteres',
    '«not a color» no es un color: usa #rrggbb, red o warning',
  ])

  await typed('contextLabel', ' Ctx ')
  await typed('lowColor', '#00ff00')
  expect(it.toasts).toHaveLength(3)
  expect((await texts(footer))[1]).toBe('Opus 5.5 high · Ctx ▰▱▱▱▱▱▱▱▱▱ 19%')
  await pane.unmount()
  await footer.unmount()
})

test('⚙ opens the pane, whose changes hold for the session, and saved as global, for the next one', async ($, on) => {
  const it = stage($, on)

  await it.start()

  const footer = await $.ui.mount({ ...FOOTER, surface: 'terminal' })
  await footer.press({ key: 'bar-context-settings' })
  expect([...it.open]).toEqual(['bar-context'])

  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await pane.press({ key: 'showModel' })
  await pane.press({ key: 'showTokens' })
  expect((await texts(footer))[1]).toBe('high · Context ▰▱▱▱▱▱▱▱▱▱ 19% (38k/200k)')

  // Unsaved, the next session starts from the defaults again.
  await it.start()
  expect((await texts(footer))[1]).toBe('Opus 5.5 high · Context ▰▱▱▱▱▱▱▱▱▱ 19%')

  // Saved as global, the next session starts with it.
  await pane.press({ key: 'showModel' })
  await pane.press({ key: 'save-global' })
  await it.start()
  expect((await texts(footer))[1]).toBe('high · Context ▰▱▱▱▱▱▱▱▱▱ 19%')

  await pane.press({ key: 'reset' })
  expect((await texts(footer))[1]).toBe('Opus 5.5 high · Context ▰▱▱▱▱▱▱▱▱▱ 19%')
  await pane.unmount()
  await footer.press({ key: 'bar-context-settings' })
  expect([...it.open]).toEqual([])
  await footer.unmount()
})

test('the pane shows its fields in the mobile app too', async ($, on) => {
  await stage($, on).start()

  const pane = await $.ui.mount({ ...PANE, surface: 'mobile' })

  expect(await pane.find({ type: 'Input', key: 'contextLabel' })).toBeDefined()
  await pane.unmount()
})

type Pressable = {
  findAll: (query: { type: 'Button' }) => Promise<readonly { props: { label?: string } }[]>
}

const labels = async (ui: Pressable) => (await ui.findAll({ type: 'Button' })).map(found => found.props.label)

// What Claude Code tells once /model has switched the session.
const SWITCHED = {
  session_id: 'abc',
  cwd: '/repo',
  transcript_path: '/repo/abc.jsonl',
  from_model: 'claude-opus-5-5',
  to_model: 'claude-sonnet-5-5',
  requested_model: 'sonnet',
  source: 'command',
  context_tokens: 0,
  prompt_cache_warm: false,
  cache_ttl: '1h',
  estimated_cache_write_usd: 0,
  pricing: 'catalog',
} as const

test('a click on the model offers the models, and the one picked is switched to as /model does', async ($, on) => {
  const it = stage($, on)

  await it.start()

  const footer = await $.ui.mount({ ...FOOTER, surface: 'terminal' })

  expect(await labels(footer)).toEqual(['Opus 5.5', 'high', '⚙', 'other'])
  await footer.press({ key: 'bar-context-model' })
  // The current model a pill, the others and a way out to press; the effort stays.
  expect(await labels(footer)).toEqual(['default', 'sonnet', 'haiku', 'fable', '✕', 'high', '⚙', 'other'])
  expect((await texts(footer))[1]).toMatch(/^Modelo opus {2}high · Context/)
  expect(it.ran).toEqual([])

  await footer.press({ key: 'pick-model-sonnet' })
  expect(it.ran).toEqual(['/model sonnet'])
  // Closed at once; the name follows the switch, which tells it before the session does.
  expect(await labels(footer)).toEqual(['Opus 5.5', 'high', '⚙', 'other'])
  await $.classic.PostModelSwitch(SWITCHED)
  expect((await texts(footer))[1]).toMatch(/^Sonnet 5\.5 high · /)
  expect(it.toasts).toEqual([])
  await footer.unmount()
})

test('a click on the effort offers the levels, and the one picked is switched to as /effort does', async ($, on) => {
  const it = stage($, on)

  await it.start()

  const footer = await $.ui.mount({ ...FOOTER, surface: 'terminal' })

  await footer.press({ key: 'bar-context-effort' })
  expect(await labels(footer)).toEqual(['Opus 5.5', 'low', 'medium', 'xhigh', 'max', '✕', '⚙', 'other'])
  expect((await texts(footer))[1]).toMatch(/^Opus 5\.5 Esfuerzo high {2}· Context/)

  await footer.press({ key: 'pick-effort-low' })
  expect(it.ran).toEqual(['/effort low'])
  // The row shows the level asked for at once, before a request tells.
  expect((await texts(footer))[1]).toMatch(/^Opus 5\.5 low · /)
  expect(await labels(footer)).toEqual(['Opus 5.5', 'low', '⚙', 'other'])
  await footer.unmount()
})

test('the options go away with ✕ or a second click, and a click on the other one moves them', async ($, on) => {
  const it = stage($, on)

  await it.start()

  const footer = await $.ui.mount({ ...FOOTER, surface: 'terminal' })

  await footer.press({ key: 'bar-context-model' })
  await footer.press({ key: 'bar-context-pick-close' })
  expect(await labels(footer)).toEqual(['Opus 5.5', 'high', '⚙', 'other'])

  await footer.press({ key: 'bar-context-model' })
  await footer.press({ key: 'bar-context-effort' })
  expect((await labels(footer)).slice(0, 3)).toEqual(['Opus 5.5', 'low', 'medium'])
  await footer.press({ key: 'bar-context-pick-close' })
  expect(it.ran).toEqual([])
  await footer.unmount()
})

test('a switch Claude Code refuses says so, and the row stays as it was', async ($, on) => {
  const it = stage($, on)

  it.refusal = 'a turn is running'
  await it.start()

  const footer = await $.ui.mount({ ...FOOTER, surface: 'terminal' })

  await footer.press({ key: 'bar-context-effort' })
  await footer.press({ key: 'pick-effort-max' })
  expect(it.toasts).toHaveLength(1)
  expect(it.toasts[0]).toMatch(/^No se pudo ejecutar \/effort max: /)
  expect((await texts(footer))[1]).toMatch(/^Opus 5\.5 high · /)
  await footer.unmount()
})

test('with the model hidden, only the effort is a click', async ($, on) => {
  const it = stage($, on)

  await it.start()

  const footer = await $.ui.mount({ ...FOOTER, surface: 'terminal' })
  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })

  await pane.press({ key: 'showModel' })
  expect(await labels(footer)).toEqual(['high', '⚙', 'other'])
  await pane.press({ key: 'showEffort' })
  expect(await labels(footer)).toEqual(['⚙', 'other'])
  await pane.unmount()
  await footer.unmount()
})

test('a model id with its window, claude-opus-4-6[1m], reads as Opus 4.6', async ($, on) => {
  const it = stage($, on)

  await it.start()

  const footer = await $.ui.mount({ ...FOOTER, surface: 'terminal' })

  await it.step('claude-opus-4-6[1m]')
  expect((await texts(footer))[1]).toMatch(/^Opus 4\.6 xhigh · /)
  // Ids with a date, or with no minor, still read as they did.
  await it.step('claude-sonnet-4-5-20250929')
  expect((await texts(footer))[1]).toMatch(/^Sonnet 4\.5 xhigh · /)
  await it.step('claude-opus-4-20250514')
  expect((await texts(footer))[1]).toMatch(/^Opus 4 xhigh · /)
  await footer.unmount()
})

test('a threshold takes plain digits only: not an empty text, 0x10 or 1e2', async ($, on) => {
  const it = stage($, on)

  await it.start()

  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const typed = (key: string, text: string) => $.ui.input({ plugin: 'bar-context', key, text })

  await typed('midFrom', '')
  await typed('midFrom', '   ')
  await typed('midFrom', '0x10')
  await typed('midFrom', '1e2')
  await typed('midFrom', '-5')
  await typed('midFrom', '101')
  await typed('midFrom', '12.5')
  expect(it.toasts).toEqual(Array(7).fill('Un número entero de 0 a 100'))

  await typed('midFrom', ' 0 ')
  await typed('midFrom', '40')
  expect(it.toasts).toHaveLength(7)
  expect(await pane.find({ type: 'Input', key: 'midFrom' })).toMatchObject({ props: { value: '40' } })
  await pane.unmount()
})

test('changes pressed together all land', async ($, on) => {
  const it = stage($, on)

  await it.start()

  const footer = await $.ui.mount({ ...FOOTER, surface: 'terminal' })
  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })

  await Promise.all([
    pane.press({ key: 'showModel' }),
    pane.press({ key: 'showEffort' }),
    pane.press({ key: 'showBar' }),
  ])
  expect((await texts(footer))[1]).toBe('Context 19%')
  await pane.unmount()
  await footer.unmount()
})

test('a save or a forget the store refuses says so, and the pane does not mark it done', async ($, on) => {
  const it = stage($, on, 'unwritable')

  await it.start()

  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const source = async () => (await pane.find({ type: 'Text', text: /^Ajustes/ }))?.text

  await pane.press({ key: 'showTokens' })
  await pane.press({ key: 'save-project' })
  await pane.press({ key: 'save-global' })
  await pane.press({ key: 'forget-project' })
  expect(it.toasts).toEqual([
    'No se pudieron guardar los ajustes: bar-context: $.store.set: disk full',
    'No se pudieron guardar los ajustes: bar-context: $.store.set: disk full',
    'No se pudieron olvidar los ajustes del proyecto: bar-context: $.store.delete: disk full',
  ])
  expect(it.logged).toContain('saving the settings failed: bar-context: $.store.set: disk full')
  expect(it.logged).toContain("forgetting the project's settings failed: bar-context: $.store.delete: disk full")
  // Still the project's, still unsaved, and the project's settings still there to forget.
  expect(await source()).toBe('Ajustes de este proyecto · cambios sin guardar')
  expect(await pane.find({ key: 'forget-project' })).toBeDefined()
  await pane.unmount()
})

test('a start that fails says why in the debug log, and the next start fills the row in', async ($, on) => {
  const it = stage($, on)

  it.isStateDown = true
  await it.start()
  expect(it.logged).toContain('starting failed: bar-context: $.state.set: state down')

  it.isStateDown = false

  // Drawing writes no state, so it starts nothing: the row waits.
  const footer = await $.ui.mount({ ...FOOTER, surface: 'terminal' })

  await it.clock.settle()
  expect((await texts(footer))[1]).not.toMatch(/^Opus 5\.5 high · Context/)

  await it.start()
  expect((await texts(footer))[1]).toMatch(/^Opus 5\.5 high · Context/)
  await footer.unmount()
})

test('a store that cannot be read leaves the session on its defaults, and says why in the debug log', async ($, on) => {
  const it = stage($, on, true)

  await it.start()

  const footer = await $.ui.mount({ ...FOOTER, surface: 'terminal' })

  expect((await texts(footer))[1]).toMatch(/^Opus 5\.5 high · Context/)
  expect(it.logged).toContain('reading the saved settings failed: bar-context: $.store.get: store down')
  await footer.unmount()
})

test('the row is drawn again every 15 seconds, by one timer however often the session starts', async ($, on) => {
  const it = stage($, on)
  let invalidated = 0

  on('ui.invalidate', (_, e, next) => {
    invalidated++

    return next(e)
  })
  await it.start()
  await it.start()
  invalidated = 0
  await it.clock.advance(14_999)
  expect(invalidated).toBe(0)
  await it.clock.advance(1)
  expect(invalidated).toBe(1)
  await it.clock.advance(15_000)
  expect(invalidated).toBe(2)
})

const SOURCE = /^Ajustes/

test('a session that tells no project has no project settings, to load or to save', async ($, on) => {
  const it = stage($, on, false, { 'settings:null': { showBar: false }, settings: { showPercent: false } })

  await it.start()

  const footer = await $.ui.mount({ ...FOOTER, surface: 'terminal' })
  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })

  expect((await texts(footer))[1]).toBe('Opus 5.5 high · Context ▰▱▱▱▱▱▱▱▱▱')
  await pane.press({ key: 'save-project' })
  expect(it.toasts).toEqual(['Esta sesión no dice cuál es su proyecto'])
  expect(await pane.find({ key: 'forget-project' })).toBeUndefined()
  await pane.unmount()
  await footer.unmount()
})

test('a session starts with its project’s settings before the global ones', async ($, on) => {
  const it = stage($, on, false, { settings: { showBar: false }, 'settings:/repo': { showPercent: false } })

  on('session.root', () => ({ value: '/repo' }))
  await it.start()

  const footer = await $.ui.mount({ ...FOOTER, surface: 'terminal' })

  expect((await texts(footer))[1]).toBe('Opus 5.5 high · Context ▰▱▱▱▱▱▱▱▱▱')
  await footer.unmount()
})

test('the pane tells where the settings came from, and what changed in them or was saved', async ($, on) => {
  const it = stage($, on, false, { 'settings:/repo': { showTokens: true } })

  on('session.root', () => ({ value: '/repo' }))
  await it.start()

  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const source = async () => (await pane.find({ type: 'Text', text: SOURCE }))?.text
  const projectSave = async () => (await pane.find({ key: 'save-project' }))?.props.variant

  // As the project saved them, whatever the global ones are.
  expect(await source()).toBe('Ajustes de este proyecto')
  expect(await projectSave()).toBe('secondary')
  expect(await pane.find({ key: 'forget-project' })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: /tiene los suyos/ })).toBeUndefined()

  // Changed, they are unsaved; changed back to what the project saved, they are not.
  await pane.press({ key: 'showModel' })
  expect(await source()).toBe('Ajustes de este proyecto · cambios sin guardar')
  expect(await projectSave()).toBe('primary')
  await pane.press({ key: 'showModel' })
  expect(await source()).toBe('Ajustes de este proyecto')

  // Saved as global, the session is on those, and the project's own are said to stand over them.
  await pane.press({ key: 'save-global' })
  expect(await source()).toBe('Ajustes globales')
  expect(
    await pane.find({ type: 'Text', text: 'Este proyecto tiene los suyos, que mandan al arrancar.' }),
  ).toBeDefined()
  await pane.unmount()
})

test('saved for the project, the settings are the project’s and it has some to forget', async ($, on) => {
  const it = stage($, on)

  on('session.root', () => ({ value: '/repo' }))
  await it.start()

  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })

  expect(await pane.find({ key: 'forget-project' })).toBeUndefined()
  await pane.press({ key: 'showTokens' })
  await pane.press({ key: 'save-project' })
  expect((await pane.find({ type: 'Text', text: SOURCE }))?.text).toBe('Ajustes de este proyecto')
  expect(await pane.find({ key: 'forget-project' })).toBeDefined()
  await pane.unmount()
})

test('settings that came from the defaults are unsaved against the defaults, not against what the store holds now', async ($, on) => {
  const saved: Record<string, unknown> = {}
  const it = stage($, on, false, saved)

  await it.start()
  // Another session saved some global settings since this one started.
  saved.settings = { showTokens: true }

  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })

  await pane.press({ key: 'showTokens' })
  expect((await pane.find({ type: 'Text', text: SOURCE }))?.text).toBe('Ajustes por defecto · cambios sin guardar')
  await pane.unmount()
})

test('the options of the effort or the model close on a second click, and the effort already known stays through a start', async ($, on) => {
  const it = stage($, on)

  await it.start()

  const footer = await $.ui.mount({ ...FOOTER, surface: 'terminal' })

  // Two clicks that land together: the second finds the options up.
  await Promise.all([footer.press({ key: 'bar-context-model' }), footer.press({ key: 'bar-context-model' })])
  expect(await labels(footer)).toEqual(['Opus 5.5', 'high', '⚙', 'other'])

  // The request's effort is the one shown; a start does not take it back to the settings'.
  await it.step()
  await it.start()
  expect((await texts(footer))[1]).toMatch(/^Opus 5\.5 xhigh · /)
  await footer.unmount()
})

test('the tier of the window turns bold from the high share', async ($, on) => {
  const it = stage($, on)

  await it.start()

  const footer = await $.ui.mount({ ...FOOTER, surface: 'terminal' })
  const context = async () => (await footer.find({ type: 'Text', text: /^Context/ }))?.props.weight

  expect(await context()).toBeUndefined()
  it.fill = { tokens: 160_000, window: 200_000, percent: 80 }
  await $.session.measure({ context: it.fill, rateLimits: [], changed: ['context'] })
  expect(await context()).toBe('semibold')
  await footer.unmount()
})

test('a measure with no fill keeps the one a resume told', async ($, on) => {
  const it = stage($, on)

  it.fill = { window: 200_000 }
  await $.classic.SessionStart({
    session_id: 'abc',
    cwd: '/repo',
    transcript_path: '/repo/abc.jsonl',
    source: 'resume',
    seconds_since_last_response: 60,
    context_tokens: 50_000,
  })
  await it.start()

  const footer = await $.ui.mount({ ...FOOTER, surface: 'terminal' })

  await $.session.measure({ context: { window: 200_000 }, rateLimits: [], changed: ['context'] })
  expect((await texts(footer))[1]).toMatch(/Context ▰▰▱▱▱▱▱▱▱▱ 25%/)
  await footer.unmount()
})

test('a conversation that starts has no cache and no fill of a last response to take up', async ($, on) => {
  const it = stage($, on)

  it.fill = { window: 200_000 }
  await $.classic.SessionStart({
    session_id: 'abc',
    cwd: '/repo',
    transcript_path: '/repo/abc.jsonl',
    source: 'startup',
    seconds_since_last_response: 60,
    context_tokens: 50_000,
  })
  await it.start()

  const footer = await $.ui.mount({ ...FOOTER, surface: 'terminal' })

  expect((await texts(footer))[1]).toBe('Opus 5.5 high')
  await footer.unmount()
})

test('a resumed conversation brings no miss of the one before, and keeps the window size it knows', async ($, on) => {
  const it = stage($, on)

  await it.start()
  it.answer = { ms: 0, tokens: 0, read: 0, write: 10_000 }
  await it.step()
  await it.clock.advance(2 * 60 * 60_000)
  await it.step()

  const footer = await $.ui.mount({ ...FOOTER, surface: 'terminal' })

  expect((await texts(footer))[1]).toContain('⚠ miss')

  // A window of another size, which the session now reports, is not the one known.
  it.fill = { window: 1_000_000 }
  await $.classic.SessionStart({
    session_id: 'abc',
    cwd: '/repo',
    transcript_path: '/repo/abc.jsonl',
    source: 'resume',
    seconds_since_last_response: 60,
    context_tokens: 100_000,
  })
  expect((await texts(footer))[1]).not.toContain('⚠ miss')
  expect((await texts(footer))[1]).toContain('Context ▰▰▰▰▰▱▱▱▱▱ 50%')
  await footer.unmount()
})

test('a response that put out nothing, or took no time, says no speed', async ($, on) => {
  const it = stage($, on)

  await it.start()

  const footer = await $.ui.mount({ ...FOOTER, surface: 'terminal' })

  it.answer = { ms: 2000, tokens: 0, read: 0, write: 0 }
  await it.step()
  expect((await texts(footer))[1]).not.toContain('⚡')
  it.answer = { ms: 0, tokens: 500, read: 0, write: 0 }
  await it.step()
  expect((await texts(footer))[1]).not.toContain('⚡')
  await footer.unmount()
})

test('the session’s cost is off until the pane turns it on, then follows the ledger in the muted color', async ($, on) => {
  const it = stage($, on)

  it.cost = 0.4
  await it.start()

  const footer = await $.ui.mount({ ...FOOTER, surface: 'terminal' })
  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })

  expect((await texts(footer))[1]).toBe('Opus 5.5 high · Context ▰▱▱▱▱▱▱▱▱▱ 19%')
  expect((await pane.find({ key: 'showCost' }))?.text).toBe('□ Coste estimado de la sesión ($0.42)')

  await pane.press({ key: 'showCost' })
  expect((await texts(footer))[1]).toBe('Opus 5.5 high · Context ▰▱▱▱▱▱▱▱▱▱ 19% · $0.40')
  expect((await footer.find({ type: 'Text', text: /^\$0\.40$/ }))?.props.color).toBe('#8a8a8a')

  // The ledger's total as each measurement tells it.
  await $.session.measure({ context: it.fill, rateLimits: [], cost: { usd: 12.345 }, changed: ['cost'] })
  expect((await texts(footer))[1]).toMatch(/ · \$12\.35$/)
  await $.session.measure({ context: it.fill, rateLimits: [], cost: { usd: 0 }, changed: ['cost'] })
  expect((await texts(footer))[1]).toMatch(/ · \$0\.00$/)

  // An engine with no ledger has none to show.
  await $.session.measure({ context: it.fill, rateLimits: [], changed: ['context'] })
  expect((await texts(footer))[1]).toBe('Opus 5.5 high · Context ▰▱▱▱▱▱▱▱▱▱ 19%')
  await pane.unmount()
  await footer.unmount()
})

test('a session that starts with its cost on shows what the engine has spent so far', async ($, on) => {
  const it = stage($, on, false, { settings: { showCost: true } })

  it.cost = 1.5
  await it.start()

  const footer = await $.ui.mount({ ...FOOTER, surface: 'terminal' })

  expect((await texts(footer))[1]).toBe('Opus 5.5 high · Context ▰▱▱▱▱▱▱▱▱▱ 19% · $1.50')
  await footer.unmount()
})

test('a click on the lifetime in the pane sets the one the cache is given', async ($, on) => {
  const it = stage($, on)

  await it.start()

  const footer = await $.ui.mount({ ...FOOTER, surface: 'terminal' })
  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })

  await pane.press({ key: 'cacheTtl-5m' })
  it.answer = { ms: 0, tokens: 0, read: 0, write: 10_000 }
  await it.step()
  expect((await texts(footer))[1]).toContain('Cache 5m (10k)')
  await pane.unmount()
  await footer.unmount()
})

test('the pane marks each switch with a square, each color with a swatch, and each field with a ground in the terminal', async ($, on) => {
  const it = stage($, on)

  await it.start()

  const terminal = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const mobile = await $.ui.mount({ ...PANE, surface: 'mobile' })
  const grounded = async (ui: typeof terminal | typeof mobile) =>
    (await ui.findAll({ type: 'Box' })).filter(found => found.props.backgroundColor === 'subtle').length

  expect((await terminal.find({ key: 'showBar' }))?.text).toBe('■ Barra del contexto')
  await terminal.press({ key: 'showBar' })
  expect((await terminal.find({ key: 'showBar' }))?.text).toBe('□ Barra del contexto')
  expect((await terminal.findAll({ type: 'Text', text: '■' })).map(found => found.props.color)).toEqual(COLOR_DEFAULTS)
  expect(await grounded(terminal)).toBe(20)
  expect(await grounded(mobile)).toBe(0)
  await terminal.unmount()
  await mobile.unmount()
})

const COLOR_DEFAULTS = [
  '#8787d7',
  '#8787d7',
  '#8a8a8a',
  '#d78700',
  'red',
  '#5f5f5f',
  '#d7af5f',
  '#8a8a8a',
  'red',
  '#8a8a8a',
  'error',
  '#cc0000',
]
