import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, SessionRateLimit, TurnUsage } from 'claude-code'

const SURFACES = ['terminal', 'desktop'] as const
const PROPS = {
  hasSurvey: false,
  isCollapsed: false,
  isWorking: false,
  maxRows: 10,
  bodyColumns: 80,
  scroll: { offset: 0, bodyRows: 10 },
  view: {},
}

/** What a response that read and wrote the cache cost, its input so many tokens in all. */
const cached = (tokens = 470_259): TurnUsage => ({
  model: 'm',
  input_tokens: 9,
  output_tokens: 5_000,
  cache_read_input_tokens: tokens - 259,
  cache_creation_input_tokens: 250,
})
const UNCACHED: TurnUsage = { ...cached(), cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

// What every classic event says of the session.
const SESSION = { session_id: 'abc', cwd: '/repo', transcript_path: '/home/me/.claude/projects/repo/abc.jsonl' }
const NOW = 1_700_000_000_000
const EVERY_MS = 15_000
const FIVE_MINUTES_MS = 300_000
const HOUR_MS = 3_600_000
const WARNING = '⚠ Caché caducada'
const COLD = [`${WARNING} · el próximo prompt vuelve a cachear 470k tokens`, 'engine']

// The plan windows a subscription reports, with room left or spent.
const WITHIN_PLAN: readonly SessionRateLimit[] = [
  { kind: 'five_hour', percentUsed: 40 },
  { kind: 'seven_day', percentUsed: 12.5 },
]
const ON_CREDITS: readonly SessionRateLimit[] = [
  { kind: 'five_hour', percentUsed: 100 },
  { kind: 'seven_day', percentUsed: 12.5 },
]

/** A response that wrote the cache, the API telling how much of the write lives an hour and how much five minutes. */
const wrote = (parts: { hour?: number; fiveMinutes?: number }): TurnUsage => ({
  ...cached(),
  ephemeral_1h_input_tokens: parts.hour ?? 0,
  ephemeral_5m_input_tokens: parts.fiveMinutes ?? 0,
})

// A session as the mod reads it (an account on a subscription within its plan,
// so by the rules the cache lives an hour; no response yet) and the band
// above the prompt with what the engine draws there. The model, the speed and
// the cache's part of the row are hidden, so the desktop app's band, which holds the mod's
// row too, draws the warning alone; `cacheTtl` is the pane's choice of lifetime.
const stage = (
  $: Engine,
  on: On,
  surface: (typeof SURFACES)[number] = 'terminal',
  env: Readonly<Record<string, string>> = {},
  cacheTtl = 'auto',
  /** Settings over those that hide the row's parts. */
  more: Readonly<Record<string, unknown>> = {},
) => {
  mock.env(on, env)
  mock.store(on, {
    settings: { showModel: false, showSpeed: false, showCache: false, showMiss: false, cacheTtl, ...more },
  })

  const it = {
    clock: mock.clock(on, { now: NOW }),
    usage: cached() as TurnUsage | null,
    /** How long a request takes to be answered. */
    answeredInMs: 0,
    rateLimits: WITHIN_PLAN,
    settings: {} as Record<string, unknown>,
    start: () => $.session.start({ cwd: '/repo', surface, isInteractive: true }),
    /** A request of the main conversation, or of that subagent, read to its end. */
    step: async (agentId?: string) => {
      const stream = $.turn.step({ turnId: 't1', index: 0, model: 'm', messageCount: 1, agentId })

      let next = await stream.next()

      while (next.done !== true) {
        next = await stream.next()
      }
    },
    /** The texts of the band, drawn with those props over the usual ones. */
    drawn: async (props: Partial<typeof PROPS> = {}) => {
      const ui = await $.ui.mount({
        plugin: 'bar-context',
        surface,
        component: 'AbovePrompt',
        props: { ...PROPS, ...props },
      })
      const texts = (await ui.findAll({ type: 'Text' })).map(found => found.text)

      await ui.unmount()

      return texts
    },
  }

  on('session.usage', () => ({
    value: { startedAt: 0, context: { window: 1_000_000 }, rateLimits: [...it.rateLimits] },
  }))
  on('settings.read', () => ({ value: it.settings }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('classic.SessionStart', () => ({}))
  on('turn.step', async function* (_, e) {
    await it.clock.advance(it.answeredInMs)

    return { turnId: e.turnId, index: e.index, answer: 'Done.', toolUses: [], stopReason: 'end_turn', usage: it.usage }
  })
  on('ui.render', { component: 'AbovePrompt' }, (engine, e) => {
    const { Text } = engine.ui.resolve(e)

    return <Text>engine</Text>
  })

  return it
}

for (const surface of SURFACES) {
  test(`${surface}: warns above the prompt once a lifetime has passed since the last response`, async ($, on) => {
    const it = stage($, on, surface)

    await it.start()
    await it.clock.advance(2 * HOUR_MS)
    expect(await it.drawn(), 'before any request').toEqual(['engine'])

    // The lifetime runs from the response's end, not from the request.
    it.answeredInMs = 2 * EVERY_MS
    await it.step()
    await it.clock.advance(HOUR_MS - EVERY_MS)
    expect(await it.drawn()).toEqual(['engine'])

    // What is drawn beneath stays, after the warning.
    await it.clock.advance(EVERY_MS)
    expect(await it.drawn()).toEqual(COLD)

    // The next request warms it again, at once.
    await it.step()
    expect(await it.drawn()).toEqual(['engine'])
    await it.clock.advance(HOUR_MS - EVERY_MS)
    expect(await it.drawn()).toEqual(['engine'])
  })
}

test('a request that lands while the warning is up takes it down in the drawing that shows it', async ($, on) => {
  const it = stage($, on)

  await it.start()
  await it.step()
  await it.clock.advance(HOUR_MS)

  const band = await $.ui.mount({ plugin: 'bar-context', surface: 'terminal', component: 'AbovePrompt', props: PROPS })
  const texts = async () => (await band.findAll({ type: 'Text' })).map(found => found.text)

  expect(await texts()).toEqual(COLD)
  // Worked out as it is drawn from the last request: no stale check can bring it back.
  await it.step()
  expect(await texts()).toEqual(['engine'])
  await it.clock.advance(EVERY_MS)
  expect(await texts()).toEqual(['engine'])
  await band.unmount()
})

test('says how much the next prompt caches again: all the input of the last response', async ($, on) => {
  const it = stage($, on)
  const CASES: readonly (readonly [tokens: number, said: string])[] = [
    [999, '999'],
    [436_291, '436k'],
    [1_250_000, '1.2M'],
  ]

  await it.start()

  for (const [tokens, said] of CASES) {
    it.usage = cached(tokens)
    await it.step()
    await it.clock.advance(HOUR_MS)
    expect(await it.drawn(), `${tokens}`).toEqual([
      `${WARNING} · el próximo prompt vuelve a cachear ${said} tokens`,
      'engine',
    ])
  }
})

test('keeps quiet while a turn runs or a survey is up', async ($, on) => {
  const it = stage($, on)

  await it.start()
  await it.step()
  await it.clock.advance(HOUR_MS)
  expect(await it.drawn({ isWorking: true })).toEqual(['engine'])
  expect(await it.drawn({ hasSurvey: true })).toEqual(['engine'])
  expect(await it.drawn()).toEqual(COLD)
})

test('the warning is in the color set', async ($, on) => {
  const colored = stage($, on, 'terminal', {}, 'auto', { warningColor: '#ff00ff' })

  await colored.start()
  await colored.step()
  await colored.clock.advance(HOUR_MS)

  const band = await $.ui.mount({ plugin: 'bar-context', surface: 'terminal', component: 'AbovePrompt', props: PROPS })

  expect((await band.find({ type: 'Text', text: /^⚠ Caché caducada/ }))?.props.color).toBe('#ff00ff')
  await band.unmount()
})

test('the warning is left out when hidden', async ($, on) => {
  const it = stage($, on, 'terminal', {}, 'auto', { showCacheWarning: false })

  await it.start()
  await it.step()
  await it.clock.advance(HOUR_MS)
  expect(await it.drawn()).toEqual(['engine'])
})

test('in the desktop app a survey up keeps the band free of the row, and in the terminal the band never has it', async ($, on) => {
  const row = async (surface: 'terminal' | 'desktop', props: Partial<typeof PROPS> = {}) => {
    const band = await $.ui.mount({
      plugin: 'bar-context',
      surface,
      component: 'AbovePrompt',
      props: { ...PROPS, ...props },
    })
    const found = await band.find({ key: 'bar-context-settings' })

    await band.unmount()

    return found !== undefined
  }

  stage($, on)
  expect(await row('desktop')).toBe(true)
  expect(await row('desktop', { hasSurvey: true })).toBe(false)
  expect(await row('terminal')).toBe(false)
})

test('only a request of the main conversation that meets the cache starts its lifetime over', async ($, on) => {
  const it = stage($, on)

  await it.start()

  // A session that never cached has nothing to lose.
  it.usage = UNCACHED
  await it.step()
  it.usage = null
  await it.step()
  await it.clock.advance(2 * HOUR_MS)
  expect(await it.drawn()).toEqual(['engine'])

  // A subagent's cache is its own.
  it.usage = cached()
  await it.step()
  await it.clock.advance(HOUR_MS - EVERY_MS)
  await it.step('a1')
  await it.clock.advance(EVERY_MS)
  expect(await it.drawn()).toEqual(COLD)

  // A request sent reads the cache, though no response comes back to say so.
  await it.step()
  await it.clock.advance(HOUR_MS - EVERY_MS)
  it.usage = null
  await it.step()
  await it.clock.advance(HOUR_MS - EVERY_MS)
  expect(await it.drawn()).toEqual(['engine'])
  await it.clock.advance(EVERY_MS)
  expect(await it.drawn()).toEqual(COLD)
})

type Setup = {
  ttl?: string
  env?: Record<string, string>
  settings?: Record<string, unknown>
  rateLimits?: readonly SessionRateLimit[]
}

// What settles the cache's lifetime while no response names it, each over the
// ones before it.
const LIFETIMES: readonly (readonly [said: string, setup: Setup, lifetimeMs: number])[] = [
  ['a subscription within its plan', {}, HOUR_MS],
  ['a subscription on usage credits', { rateLimits: ON_CREDITS }, FIVE_MINUTES_MS],
  ['an account with no plan', { rateLimits: [] }, FIVE_MINUTES_MS],
  ['ENABLE_PROMPT_CACHING_1H', { rateLimits: [], env: { ENABLE_PROMPT_CACHING_1H: '1' } }, HOUR_MS],
  [
    'the promptCacheTtl setting',
    { rateLimits: [], env: { ENABLE_PROMPT_CACHING_1H: '1' }, settings: { promptCacheTtl: '5m' } },
    FIVE_MINUTES_MS,
  ],
  [
    'CLAUDE_CODE_PROMPT_CACHE_TTL',
    { env: { CLAUDE_CODE_PROMPT_CACHE_TTL: '5m' }, settings: { promptCacheTtl: '1h' } },
    FIVE_MINUTES_MS,
  ],
  [
    'a value that is no lifetime',
    { env: { CLAUDE_CODE_PROMPT_CACHE_TTL: '2h' }, settings: { promptCacheTtl: 7 } },
    HOUR_MS,
  ],
  [
    'FORCE_PROMPT_CACHING_5M',
    { env: { FORCE_PROMPT_CACHING_5M: '1', CLAUDE_CODE_PROMPT_CACHE_TTL: '1h' } },
    FIVE_MINUTES_MS,
  ],
  ['the pane’s choice', { ttl: '1h', env: { FORCE_PROMPT_CACHING_5M: '1' } }, HOUR_MS],
  ['the choice left on auto', { ttl: 'auto', rateLimits: [] }, FIVE_MINUTES_MS],
]

for (const [said, setup, lifetimeMs] of LIFETIMES) {
  test(`the cache lives as long as Claude Code asks for: ${said}`, async ($, on) => {
    const it = stage($, on, 'terminal', setup.env, setup.ttl)

    it.settings = setup.settings ?? {}
    it.rateLimits = setup.rateLimits ?? WITHIN_PLAN

    await it.start()
    await it.step()
    await it.clock.advance(lifetimeMs - EVERY_MS)
    expect(await it.drawn()).toEqual(['engine'])
    await it.clock.advance(EVERY_MS)
    expect(await it.drawn()).toEqual(COLD)
  })
}

// What the API says of a response's cache write counts before the rules, wherever
// they would put the lifetime.
const WRITTEN: readonly (readonly [
  said: string,
  usage: TurnUsage,
  rateLimits: readonly SessionRateLimit[],
  ms: number,
])[] = [
  ['five minutes on a subscription within its plan', wrote({ fiveMinutes: 250 }), WITHIN_PLAN, FIVE_MINUTES_MS],
  ['an hour on usage credits', wrote({ hour: 250 }), ON_CREDITS, HOUR_MS],
  ['an hour when it wrote for both', wrote({ hour: 1, fiveMinutes: 249 }), ON_CREDITS, HOUR_MS],
]

for (const [said, usage, rateLimits, lifetimeMs] of WRITTEN) {
  test(`the lifetime is the one the API said it wrote: ${said}`, async ($, on) => {
    const it = stage($, on)

    it.rateLimits = rateLimits
    it.usage = usage
    await it.start()
    await it.step()
    await it.clock.advance(lifetimeMs - EVERY_MS)
    expect(await it.drawn()).toEqual(['engine'])
    await it.clock.advance(EVERY_MS)
    expect(await it.drawn()).toEqual(COLD)
  })
}

test('a response that wrote nothing keeps the lifetime the cache has, and one that writes another changes it', async ($, on) => {
  const it = stage($, on)

  await it.start()
  it.usage = wrote({ fiveMinutes: 250 })
  await it.step()
  // A response that only read the cache, or told no lifetime, says nothing new.
  it.usage = wrote({})
  await it.step()
  it.usage = cached()
  await it.step()
  await it.clock.advance(FIVE_MINUTES_MS - EVERY_MS)
  expect(await it.drawn()).toEqual(['engine'])
  await it.clock.advance(EVERY_MS)
  expect(await it.drawn()).toEqual(COLD)

  it.usage = wrote({ hour: 250 })
  await it.step()
  await it.clock.advance(HOUR_MS - EVERY_MS)
  expect(await it.drawn()).toEqual(['engine'])
})

test('a subagent’s write does not name the conversation’s lifetime', async ($, on) => {
  const it = stage($, on)

  await it.start()
  await it.step()
  it.usage = wrote({ fiveMinutes: 250 })
  await it.step('a1')
  await it.clock.advance(HOUR_MS - EVERY_MS)
  expect(await it.drawn()).toEqual(['engine'])
})

test('the pane’s choice counts before what the API said', async ($, on) => {
  const it = stage($, on, 'terminal', {}, '1h')

  await it.start()
  it.usage = wrote({ fiveMinutes: 250 })
  await it.step()
  await it.clock.advance(HOUR_MS - EVERY_MS)
  expect(await it.drawn()).toEqual(['engine'])
})

test('a resumed conversation has the cache its last response left', async ($, on) => {
  const it = stage($, on)
  const begin = (fields: object) => $.classic.SessionStart({ ...SESSION, source: 'resume', ...fields })
  const LEFT = [`${WARNING} · el próximo prompt vuelve a cachear 287k tokens`, 'engine']

  await it.start()

  // Fifty minutes into its hour.
  await begin({ seconds_since_last_response: 3000, context_tokens: 287_974 })
  expect(await it.drawn()).toEqual(['engine'])
  await it.clock.advance(10 * 60_000)
  expect(await it.drawn()).toEqual(LEFT)

  // The next response tells what it wrote the cache for, which counts from then on.
  await begin({ seconds_since_last_response: 360 })
  it.usage = wrote({ fiveMinutes: 250 })
  await it.step()
  await it.clock.advance(FIVE_MINUTES_MS)
  expect(await it.drawn()).toEqual(COLD)

  // Claude Code's own word that it has lapsed counts before the sum.
  await begin({
    source: 'fork',
    seconds_since_last_response: 400,
    context_tokens: 287_974,
    prompt_cache_likely_expired: true,
  })
  expect(await it.drawn()).toEqual(LEFT)

  // Nothing is known of one it says nothing of.
  await begin({})
  expect(await it.drawn()).toEqual(['engine'])
})

for (const source of ['startup', 'clear', 'compact'] as const) {
  test(`a conversation that starts over has no cache to lose: ${source}`, async ($, on) => {
    const it = stage($, on)

    await it.start()
    await it.step()
    await it.clock.advance(HOUR_MS)
    expect(await it.drawn()).toEqual(COLD)

    await $.classic.SessionStart({ ...SESSION, source })
    expect(await it.drawn()).toEqual(['engine'])
    await it.clock.advance(2 * HOUR_MS)
    expect(await it.drawn()).toEqual(['engine'])
  })
}
