import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { ModelCompleteInput, On, SessionMessage } from 'claude-code'

const SURFACES = ['terminal', 'desktop'] as const

// As on a terminal too narrow for a pane nobody asked for: an open is placed
// only while the press or the command that asked for it is still running.
let requests = 0
const requested = async <T,>(run: () => Promise<T>) => {
  requests++
  try {
    return await run()
  } finally {
    requests--
  }
}
const USAGE = {
  input_tokens: 0,
  output_tokens: 0,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
}
const PANE = {
  plugin: 'ui-companion',
  component: 'Pane',
  requestId: 'consejero',
  props: {
    title: 'Compañero',
    isFocused: false,
    bodyColumns: 46,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const
const FOOTER = { plugin: 'ui-companion', component: 'SessionMode', props: { modes: [] } } as const
const BAND = {
  plugin: 'ui-companion',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isCollapsed: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const
const TURN = { answer: 'Hecho.', durationMs: 10, isAborted: false, turnId: 't1', reason: 'answer' } as const
const UP = [{ id: 'consejero', title: 'Compañero', isShown: true, isFocused: false, isPlaced: true }]
const PROMPT: SessionMessage = { role: 'user', text: 'arregla el parser', toolUses: [] }
const ANSWER: SessionMessage = { role: 'assistant', text: 'Hecho.', toolUses: [] }

/**
 * The world beneath the mod, mocked: what the session holds and the model
 * answers, each a field the test sets, and what the mod asked of it.
 *
 * `isUp` starts with the pane up, which is the mod on; `stored` is what the
 * store holds from an earlier session, by key.
 */
const stage = ($: Engine, on: On, given: { isUp?: boolean; stored?: Record<string, unknown> } = {}) => {
  const clock = mock.clock(on)
  const asked: ModelCompleteInput[] = []
  const opened: string[] = []
  const closed: string[] = []
  const stored: Record<string, unknown> = { ...given.stored }
  const sent: string[] = []
  const notices: string[] = []
  // The lines for the debug log alone, which no one sees on screen.
  const debugged: string[] = []
  const world = {
    clock,
    asked,
    opened,
    closed,
    stored,
    sent,
    notices,
    debugged,
    conversation: [PROMPT, ANSWER],
    reply: '- Falta un test para el caso vacío.',
    /** How long the model takes to answer, in ms of the mocked clock. */
    latency: 0,
    /** `empty`: the model answers nothing; `api`: the API refuses the call. */
    failure: null as 'empty' | 'api' | null,
    /** What a compaction does: by default it is vetoed; a test sets what the engine would leave. */
    compaction: (): { messages: SessionMessage[] } | { skip: string } => ({ skip: 'the test compacts nothing' }),
    /** A model the engine refuses: asking it rejects, as an allowlist's denial does. */
    blocked: null as string | null,
    /** The reason a plugin above refuses a note put in the conversation. */
    refusal: null as string | null,
    start: () => $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true }),
    /** The comment is not awaited by the turn: let it land before looking. */
    turn: async (said?: SessionMessage) => {
      world.conversation = [...world.conversation, said ?? ANSWER]
      await $.turn.complete(TURN)
      await clock.settle()
    },
  }

  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('store.get', (_, e) => ({ value: stored[e.key] }))
  on('store.set', (_, e) => {
    stored[e.key] = e.value

    return { value: undefined }
  })
  on('store.delete', (_, e) => {
    Reflect.deleteProperty(stored, e.key)

    return { value: undefined }
  })
  on('ui.panes', () => ({ value: given.isUp === true ? UP : [] }))
  on('ui.press', { plugin: '*' }, (_, e, next) => requested(async () => next(e)))
  on('ui.open', (_, e) => {
    if (requests === 0) return { value: { isPlaced: false, reason: 'unasked' } }
    opened.push(`${e.id}: ${e.title}`)

    return { value: { isPlaced: true } }
  })
  on('ui.close', (_, e) => {
    closed.push(e.origin.kind)

    return { value: undefined }
  })
  on('ui.log', (_, e) => {
    const lines = e.to === 'debug' ? debugged : notices
    lines.push(e.text)

    return { value: undefined }
  })
  on('session.messages', () => ({ value: world.conversation }))
  on('session.compact', () => world.compaction())
  on('session.append', (_, e, next) => {
    if (world.refusal !== null) {
      return { deny: world.refusal }
    }

    sent.push(e.message.content.map(block => (block.type === 'text' ? block.text : '')).join(''))

    return next(e)
  })
  on('model.complete', async (_, e) => {
    const { failure, reply } = world

    asked.push(e)

    if (e.model === world.blocked) {
      return { deny: `model ${e.model} is not allowed` }
    }

    if (world.latency > 0) {
      await clock.sleep(world.latency)
    }

    if (failure === 'empty') {
      return { value: { isAnswered: false, reason: 'empty-reply', usage: USAGE } }
    }

    return {
      value:
        failure === 'api'
          ? { isAnswered: false, reason: 'api-error', status: 529, error: 'overloaded', usage: USAGE }
          : { isAnswered: true, text: reply, usage: USAGE },
    }
  })
  on('turn.complete', (_, e) => ({ text: e.answer }))

  on('ui.render', { component: 'SessionMode' }, (engine, e) => {
    const { Text } = engine.ui.resolve(e)

    return <Text>auto</Text>
  })
  on('ui.render', { component: 'AbovePrompt' }, (engine, e) => {
    const { Text } = engine.ui.resolve(e)

    return <Text>auto</Text>
  })

  return world
}

test('the button goes second in the first slot row, before another mod laid beneath', async ($, on) => {
  on('ui.render', { component: 'SessionMode' }, (engine, e) => {
    const { Box, Button, Text } = engine.ui.resolve(e)

    return (
      <Box flexDirection="column">
        <Text>auto</Text>
        <Box width="100%">
          <Box key="slot:1.3:other">
            <Button key="other" plain label="otro" onPress={() => undefined} />
          </Box>
        </Box>
      </Box>
    )
  })

  const footer = await $.ui.mount({ ...FOOTER, surface: 'terminal' })
  const rows = (await footer.findAll({ type: 'Box' })).filter(box => box.props.width === '100%')

  // The row it was laid in is gone, empty: one row holds both.
  expect(rows).toHaveLength(1)
  expect((await footer.findAll({ type: 'Button' })).map(button => button.text)).toEqual(['○ companion', 'otro'])
  expect((await footer.find({ type: 'Text' }))?.text).toBe('auto')
})

/** The mod on with its pane up, as most of what it does needs it. */
const opened = async ($: Engine, on: On, stored?: Record<string, unknown>) => {
  const world = stage($, on, { isUp: true, stored })

  await world.start()
  await world.clock.settle()

  return { world, pane: await $.ui.mount({ ...PANE, surface: 'terminal' }) }
}

type Opened = Awaited<ReturnType<typeof opened>>

/** Shows a mode in the pane, unless shown already: that one is a pill, nothing to press. */
const showMode = async ({ pane }: Opened, chosen: string) => {
  if ((await pane.find({ key: `mode-${chosen}` })) !== undefined) {
    await pane.press({ key: `mode-${chosen}` })
  }
}

/** Shows a mode in the pane and turns it on or off, unless it is already. */
const turn = async (it: Opened, chosen: string, isOn: boolean) => {
  await showMode(it, chosen)

  if (((await it.pane.find({ key: 'state' }))?.text === '■ encendido') !== isOn) {
    await it.pane.press({ key: 'state' })
  }
}

/** Shows a mode in the pane and turns it on, as the person does; it answers at once. */
const turnOn = async (it: Opened, chosen: string) => {
  await turn(it, chosen, true)
  await it.world.clock.settle()
}

/** Shows a mode in the pane and turns it off. */
const turnOff = (it: Opened, chosen: string) => turn(it, chosen, false)

for (const surface of SURFACES) {
  test(`${surface}: the footer's button opens the pane, puts it away and brings it back`, async ($, on) => {
    const world = stage($, on)

    await world.start()

    // Off until the person opens it: a turn asks no model.
    await world.turn()
    expect(world.asked).toHaveLength(0)

    // The terminal's footer; the desktop app's band above the prompt, its
    // footer being one short line that hides what does not fit.
    const band = () => $.ui.mount({ ...BAND, surface })
    const bottom = () => $.ui.mount({ ...FOOTER, surface })
    const footer = await (surface === 'desktop' ? band() : bottom())
    const away = await (surface === 'desktop' ? bottom() : band())

    expect(await away.find({ key: 'consejero' })).toBeUndefined()
    await away.unmount()

    // What is drawn there beneath stays, the button on the row under it.
    expect(await footer.find({ type: 'Text', text: 'auto' })).toBeDefined()
    // Its dot hollow and gray while it does not comment, full and green while it does.
    const dot = async (glyph: string) => (await footer.find({ type: 'Text', text: glyph }))?.props.color
    expect((await footer.find({ key: 'consejero' }))?.text).toBe('○ companion')
    expect(await dot('○')).toBe('inactive')
    await footer.press({ key: 'consejero' })
    expect(world.opened).toEqual(['consejero: Compañero'])
    expect(await dot('●')).toBe('success')

    const pane = await $.ui.mount({ ...PANE, surface })

    await world.turn()
    expect(world.asked).toHaveLength(1)
    expect(await pane.find({ type: 'Markdown', text: 'Falta un test' })).toBeDefined()

    await footer.press({ key: 'consejero' })
    expect(world.closed).toEqual(['plugin'])
    await footer.press({ key: 'consejero' })
    expect(world.opened).toEqual(['consejero: Compañero', 'consejero: Compañero'])

    await pane.unmount()
    await footer.unmount()
  })

  test(`${surface}: each option is a button, the one picked a pill, and the pick is asked with and kept`, async ($, on) => {
    const world = stage($, on, { isUp: true })

    await world.start()

    const pane = await $.ui.mount({ ...PANE, surface })

    expect(await pane.find({ type: 'Text', text: ' vigilante ' })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: ' sonnet ' })).toBeDefined()
    expect(await pane.find({ key: 'model-sonnet' })).toBeUndefined()
    await pane.press({ key: 'model-haiku' })
    await pane.press({ key: 'effort-high' })
    expect(await pane.find({ type: 'Text', text: ' haiku ' })).toBeDefined()
    expect((await pane.find({ key: 'model-sonnet' }))?.text).toBe('sonnet')
    expect(await pane.find({ type: 'Text', text: ' high ' })).toBeDefined()
    // The model and effort are the shown mode's own, kept once saved.
    expect((await pane.find({ type: 'Text', text: /^Ajustes/ }))?.text).toBe(
      'Ajustes por defecto · cambios sin guardar',
    )
    await pane.press({ key: 'save-global' })
    expect((await pane.find({ type: 'Text', text: /^Ajustes/ }))?.text).toBe('Ajustes globales')
    expect(world.stored.settings).toMatchObject({
      isOn: true,
      setups: {
        vigilante: { isOn: true, alert: 'minimized', model: 'haiku', effort: 'high' },
        asesor: { isOn: false, alert: 'minimized', model: 'sonnet', effort: 'auto' },
      },
    })

    await world.turn()
    expect(world.asked[0]?.model).toBe('haiku')
    expect(world.asked[0]?.effort).toBe('high')

    // An effort of auto is left to the model: none is asked for.
    await pane.press({ key: 'effort-auto' })
    await world.turn()
    expect(world.asked[1]?.effort).toBeUndefined()

    await pane.unmount()
  })
}

test('a choice kept before each mode had its own: the mode it showed on, alone, with the model and effort it had, now the global settings', async ($, on) => {
  const { world, pane } = await opened($, on, {
    choice: { isOn: true, mode: 'asesor', model: 'opus', effort: 'max', hasAlerts: false },
    prompts: { vigilante: 'Avisa solo de lo grave.' },
  })

  expect(world.stored).toEqual({
    settings: expect.objectContaining({
      setups: expect.objectContaining({
        asesor: { isOn: true, alert: 'never', model: 'opus', effort: 'max' },
        vigilante: { isOn: false, alert: 'never', model: 'opus', effort: 'max' },
      }),
      prompts: { vigilante: 'Avisa solo de lo grave.' },
    }),
  })
  expect((await pane.find({ type: 'Text', text: /^Ajustes/ }))?.text).toBe('Ajustes globales')

  await pane.unmount()
})

test('a session that tells no project starts from the global settings, and why is in the debug log', async ($, on) => {
  on('session.root', () => ({ deny: 'no root' }))
  const { world, pane } = await opened($, on, { settings: { isOn: false } })

  expect((await pane.find({ key: 'power' }))?.text).toBe('□ Activo')
  expect(world.debugged).toContain('reading the project root failed: ui-companion: $.session.root: no root')

  await pane.unmount()
})

test('the choice kept from an earlier session is taken up, one it does not know left out', async ($, on) => {
  const { world, pane } = await opened($, on, {
    settings: { isOn: false, setups: { vigilante: { model: 'opus', effort: 'max' }, claude: { isOn: true } } },
  })

  expect(await pane.find({ type: 'Text', text: ' vigilante ' })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: ' opus ' })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: ' max ' })).toBeDefined()
  expect((await pane.find({ key: 'power' }))?.text).toBe('□ Activo')

  // Kept off, it reads no turn.
  await world.turn()
  expect(world.asked).toHaveLength(0)

  await pane.unmount()
})

test('set to, a new session starts it minimized, commenting with the pane away, not one with a conversation already', async ($, on) => {
  const world = stage($, on, { stored: { settings: { startsOpen: true } } })
  const footer = await $.ui.mount({ ...FOOTER, surface: 'terminal' })

  await world.start()
  expect((await footer.find({ type: 'Text', text: '○' }))?.props.color).toBe('inactive')

  world.conversation = []
  await world.start()
  expect(world.opened).toEqual([])
  expect((await footer.find({ type: 'Text', text: '●' }))?.props.color).toBe('success')
  await world.turn()
  expect(world.asked).toHaveLength(1)
  await footer.unmount()

  // Turned off in the pane, and saved, a new session starts with it off.
  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })

  expect((await pane.find({ key: 'starts-open' }))?.text).toBe('■ activar en sesiones nuevas')
  await pane.press({ key: 'starts-open' })
  await pane.press({ key: 'save-global' })
  expect(world.stored.settings).toMatchObject({ startsOpen: false })
  await pane.unmount()
})

test('a pane that stayed up while the state started over is the mod on, its kept text caught up', async ($, on) => {
  const { world, pane } = await opened($, on, { choice: { mode: 'resumen' } })

  expect(world.asked).toHaveLength(1)
  expect(world.asked[0]?.system).toContain('cuatro líneas')
  expect(world.asked[0]?.prompt).toContain('PERSONA: arregla el parser')

  await pane.unmount()
})

test('the model reads the turn whole, with what each tool was given and the error it gave', async ($, on) => {
  const { world, pane } = await opened($, on)

  await world.turn({
    role: 'assistant',
    text: 'Listo.',
    toolUses: [
      {
        tool_use_id: 'a',
        tool: 'Edit',
        input: { file_path: 'parser.ts' },
        isError: true,
        text: 'no existe',
      },
      { tool_use_id: 'b', tool: 'Bash', input: { command: 'pnpm test' }, text: 'ok' },
    ],
  })
  expect(world.asked[0]?.system).toContain('Eres un vigilante')
  expect(world.asked[0]?.prompt).toContain('PERSONA: arregla el parser')
  expect(world.asked[0]?.prompt).toContain('[herramienta] Edit {"file_path":"parser.ts"} (falló: no existe)')
  // A call that did not fail says nothing of how it went.
  expect(world.asked[0]?.prompt.endsWith('[herramienta] Bash {"command":"pnpm test"}')).toBe(true)

  // A turn longer than the tail is read from the person's prompt, and no
  // further back.
  world.conversation = [
    { role: 'user', text: 'lo de antes', toolUses: [] },
    ...Array.from({ length: 13 }, () => ANSWER),
    { role: 'user', text: 'ahora los tests', toolUses: [] },
    ...Array.from({ length: 14 }, () => ANSWER),
  ]
  await world.turn()
  expect(world.asked[1]?.prompt).toContain('PERSONA: ahora los tests')
  expect(world.asked[1]?.prompt).not.toContain('PERSONA: lo de antes')

  // A short turn is read with what came before it, twelve messages in all.
  world.conversation = [
    { role: 'user', text: 'lo primero', toolUses: [] },
    ...Array.from({ length: 12 }, () => ANSWER),
    { role: 'user', text: 'y esto', toolUses: [] },
  ]
  await world.turn()
  expect(world.asked[2]?.prompt).toContain('PERSONA: y esto')
  expect(world.asked[2]?.prompt).not.toContain('PERSONA: lo primero')
  expect(world.asked[2]?.prompt.match(/ASISTENTE: Hecho\./g)).toHaveLength(11)

  await pane.unmount()
})

test('only the main loop’s own answer is read: no subagent’s turn, none cut short', async ($, on) => {
  const { world, pane } = await opened($, on)

  await $.turn.complete({ ...TURN, agentId: 'sub1' })
  await $.turn.complete({ ...TURN, reason: 'aborted', isAborted: true })
  await $.turn.complete({ ...TURN, reason: 'error' })
  await world.clock.settle()
  expect(world.asked).toHaveLength(0)

  await pane.unmount()
})

test('a note is a card, the newest first; a dash alone, or nothing, adds none', async ($, on) => {
  const { world, pane } = await opened($, on)

  await world.turn()
  world.reply = '- Otra cosa.'
  await world.turn()
  expect(await pane.find({ type: 'Text', text: 'nota 1' })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: 'nota 2' })).toBeDefined()
  expect((await pane.find({ type: 'Markdown' }))?.text).toContain('Otra cosa')
  // The notes before are what it is told not to repeat.
  expect(world.asked[1]?.prompt).toContain('TUS NOTAS ANTERIORES:\n- Falta un test')

  world.reply = '—'
  await world.turn()
  world.reply = '  '
  await world.turn()
  expect(world.asked).toHaveLength(4)
  expect(await pane.find({ type: 'Text', text: 'nota 3' })).toBeUndefined()

  await pane.unmount()
})

test('a note is discarded alone, all of the mode at once, and a kept text dropped is written anew', async ($, on) => {
  const it = await opened($, on)
  const { world, pane } = it

  await world.turn()
  world.reply = '- Otra cosa.'
  await world.turn()
  await pane.press({ key: 'discard-1' })
  expect(await pane.find({ type: 'Text', text: 'nota 1' })).toBeUndefined()
  expect(await pane.find({ type: 'Text', text: 'nota 2' })).toBeDefined()

  await pane.press({ key: 'discard-all' })
  expect(await pane.find({ type: 'Text', text: 'nota 2' })).toBeUndefined()
  expect(await pane.find({ key: 'discard-all' })).toBeUndefined()
  // Numbered from 1 again, and not read as told before.
  await world.turn()
  expect(await pane.find({ type: 'Text', text: 'nota 1' })).toBeDefined()
  expect(world.asked.at(-1)?.prompt).toContain('TUS NOTAS ANTERIORES:\n(ninguna)')

  world.reply = '- Se arregla el parser.'
  await turnOn(it, 'resumen')
  expect(await pane.find({ key: 'discard-all' })).toBeUndefined()
  await pane.press({ key: 'discard' })
  expect(await pane.find({ type: 'Markdown', text: 'Se arregla el parser' })).toBeUndefined()
  await world.turn()
  expect(world.asked.at(-1)?.prompt).toContain('LO QUE TENÍAS ESCRITO:\n(nada)')

  await pane.unmount()
})

test("⚙ prompts shows each mode's prompt to edit: the one written is what the model reads, kept for the next session, until reset", async ($, on) => {
  const { world, pane } = await opened($, on)

  await pane.press({ key: 'prompts' })
  expect((await pane.find({ key: 'prompt-vigilante' }))?.props.value).toContain('Eres un vigilante')
  expect(await pane.find({ key: 'prompt-reset-vigilante' })).toBeUndefined()

  await pane.input({ key: 'prompt-vigilante', text: 'Avisa solo de lo grave.' })
  expect(await pane.find({ type: 'Text', text: 'vigilante · editado' })).toBeDefined()
  await pane.press({ key: 'save-global' })
  expect(world.stored.settings).toMatchObject({ prompts: { vigilante: 'Avisa solo de lo grave.' } })

  await pane.press({ key: 'prompts' })
  await world.turn()
  expect(world.asked.at(-1)?.system).toBe('Avisa solo de lo grave.')

  await pane.press({ key: 'prompts' })
  await pane.press({ key: 'prompt-reset-vigilante' })
  await pane.press({ key: 'save-global' })
  expect(world.stored.settings).toMatchObject({ prompts: {} })
  await world.turn()
  expect(world.asked.at(-1)?.system).toContain('Eres un vigilante')

  await pane.unmount()
})

test('a prompt written in an earlier session is the one read; one of a mode no longer known is left out', async ($, on) => {
  const { world, pane } = await opened($, on, {
    settings: { prompts: { vigilante: 'Avisa solo de lo grave.', otro: 'x' } },
  })

  await world.turn()
  expect(world.asked.at(-1)?.system).toBe('Avisa solo de lo grave.')
  await pane.press({ key: 'prompts' })
  expect(await pane.find({ type: 'Text', text: 'vigilante · editado' })).toBeDefined()

  await pane.unmount()
})

test('each mode keeps, numbers and reads its own notes alone, twenty at most', async ($, on) => {
  const it = await opened($, on)
  const { world, pane } = it

  await world.turn()
  world.reply = '- Extrae el parser a un módulo.'
  await turnOn(it, 'asesor')

  const comment = world.asked.at(-1)

  expect(comment?.system).toContain('Eres un consejero')
  expect(comment?.prompt).toContain('TUS NOTAS ANTERIORES:\n(ninguna)')
  expect(await pane.find({ type: 'Text', text: 'nota 1' })).toBeDefined()
  expect(await pane.find({ type: 'Markdown', text: 'Extrae el parser' })).toBeDefined()
  expect(await pane.find({ type: 'Markdown', text: 'Falta un test' })).toBeUndefined()

  // The asesor alone from here.
  await turnOff(it, 'vigilante')
  await pane.press({ key: 'mode-asesor' })

  for (let n = 2; n <= 22; n += 1) {
    world.reply = `- Idea ${n}.`
    await world.turn()
  }

  expect(await pane.find({ type: 'Text', text: 'nota 22' })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: 'nota 3' })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: /^nota 2$/ })).toBeUndefined()

  // The vigilante's own note is still its own.
  await pane.press({ key: 'mode-vigilante' })
  expect(await pane.find({ type: 'Markdown', text: 'Falta un test' })).toBeDefined()
  expect(await pane.find({ type: 'Markdown', text: 'Idea 22' })).toBeUndefined()

  await pane.unmount()
})

test('the pane’s switch: off, the pane stays up and no turn is read; on, a kept text catches up', async ($, on) => {
  const { world, pane } = await opened($, on, { choice: { mode: 'resumen' } })

  expect(world.asked).toHaveLength(1)
  await pane.press({ key: 'power' })
  expect((await pane.find({ key: 'power' }))?.text).toBe('□ Activo')
  expect(await pane.find({ key: 'redo' })).toBeUndefined()
  expect(await pane.find({ type: 'Text', text: 'Apagado' })).toBeDefined()
  await world.turn()
  expect(world.asked).toHaveLength(1)

  await pane.press({ key: 'power' })
  await world.clock.settle()
  expect((await pane.find({ key: 'power' }))?.text).toBe('■ Activo')
  expect(world.asked).toHaveLength(2)
  expect(world.asked[1]?.prompt).toContain('ASISTENTE: Hecho.')

  await pane.unmount()
})

test('resumen keeps one text: each turn reads only what it lacks, a compacted transcript whole', async ($, on) => {
  const it = await opened($, on)
  const { world, pane } = it

  await turnOff(it, 'vigilante')
  world.reply = '- Se arregla el parser.'
  await turnOn(it, 'resumen')
  expect(world.asked[0]?.system).toContain('cuatro líneas')
  expect(world.asked[0]?.prompt).toContain('LO QUE TENÍAS ESCRITO:\n(nada)')
  expect(world.asked[0]?.prompt).toContain('PERSONA: arregla el parser')
  expect(await pane.find({ type: 'Text', text: 'resumen' })).toBeDefined()
  expect(await pane.find({ type: 'Markdown', text: 'Se arregla el parser' })).toBeDefined()

  world.reply = '- Compila ya.'
  await world.turn({ role: 'assistant', text: 'Compila.', toolUses: [] })
  expect(world.asked[1]?.prompt).toContain('LO QUE TENÍAS ESCRITO:\n- Se arregla el parser.')
  expect(world.asked[1]?.prompt).toContain('ASISTENTE: Compila.')
  expect(world.asked[1]?.prompt).not.toContain('PERSONA: arregla el parser')
  // One text, the new in the old one's place.
  expect(await pane.find({ type: 'Markdown', text: 'Compila ya' })).toBeDefined()
  expect(await pane.find({ type: 'Markdown', text: 'Se arregla el parser' })).toBeUndefined()

  // Shorter than what the text covers, the transcript was compacted.
  world.conversation = [{ role: 'user', text: 'resumen de lo anterior', toolUses: [] }]
  await world.turn()
  expect(world.asked[2]?.prompt).toContain('PERSONA: resumen de lo anterior')

  await pane.unmount()
})

test('a compaction that the transcript outgrows again is still read whole, not from what the text covered', async ($, on) => {
  const it = await opened($, on)
  const { world, pane } = it

  await turnOff(it, 'vigilante')
  world.reply = '- Se arregla el parser.'
  await turnOn(it, 'resumen')

  // The compaction is the engine's: its summary and what it kept stand in the
  // old messages' place.
  const summary: SessionMessage = { role: 'user', text: 'resumen de lo compactado', toolUses: [] }

  world.compaction = () => {
    world.conversation = [summary]

    return { messages: world.conversation }
  }
  await $.session.compact({ trigger: 'manual', messages: world.conversation })

  // Two messages covered before; four now, past the count, but not the same four.
  world.conversation = [summary, ANSWER, ANSWER]
  await world.turn()
  expect(world.asked.at(-1)?.prompt).toContain('PERSONA: resumen de lo compactado')

  // What the next turn lacks is only what it added.
  await world.turn({ role: 'assistant', text: 'Otra cosa.', toolUses: [] })
  expect(world.asked.at(-1)?.prompt).toContain('ASISTENTE: Otra cosa.')
  expect(world.asked.at(-1)?.prompt).not.toContain('PERSONA: resumen de lo compactado')

  await pane.unmount()
})

test('a compaction that is skipped leaves what the text covers as it was', async ($, on) => {
  const it = await opened($, on)
  const { world, pane } = it

  await turnOff(it, 'vigilante')
  await turnOn(it, 'resumen')
  await $.session.compact({ trigger: 'manual', messages: world.conversation })
  await world.turn()
  expect(world.asked.at(-1)?.prompt).toContain('ASISTENTE: Hecho.')
  expect(world.asked.at(-1)?.prompt).not.toContain('PERSONA: arregla el parser')

  await pane.unmount()
})

test('a mode turned on in a conversation under way answers at once, from a summary of it; after a turn every mode on does, each its own model', async ($, on) => {
  const it = await opened($, on, { choice: { mode: 'asesor' } })
  const { world, pane } = it

  expect(world.asked).toHaveLength(0)

  // Picked, a mode is only shown. Turned on, it gets the summary first and
  // from it its own comment, with no turn ended.
  world.reply = '- Se arregla el parser.'
  await pane.press({ key: 'mode-vigilante' })
  expect(world.asked).toHaveLength(0)
  await pane.press({ key: 'state' })
  await world.clock.settle()
  expect(world.asked).toHaveLength(2)
  expect(world.asked[0]?.system).toContain('cuatro líneas')
  expect(world.asked[1]?.system).toContain('Eres un vigilante')
  expect(world.asked[1]?.prompt).toContain('RESUMEN DE LO ANTERIOR, SOLO COMO CONTEXTO:\n- Se arregla el parser.')

  // A summary that lacks nothing is not made again: the comment alone.
  await turnOn(it, 'troll')
  expect(world.asked).toHaveLength(3)
  expect(world.asked[2]?.system).toContain('Eres un troll')

  // After a turn, every mode on comments, each with its own model.
  await pane.press({ key: 'model-haiku' })
  await world.turn()
  expect(world.asked.slice(3).map(asked => [asked.system?.slice(0, 12), asked.model])).toEqual([
    ['Eres un vigi', 'sonnet'],
    ['Eres un cons', 'sonnet'],
    ['Eres un trol', 'haiku'],
  ])

  // Turned off, a mode comments no more.
  await turnOff(it, 'troll')
  await world.turn()
  expect(world.asked).toHaveLength(8)

  await pane.unmount()
})

test('pendientes keeps the next steps as a text of its own, with no summary asked for', async ($, on) => {
  const it = await opened($, on)
  const { world, pane } = it

  world.reply = '- Ejecutar los tests'
  await turnOn(it, 'pendientes')
  expect(world.asked).toHaveLength(1)
  expect(world.asked[0]?.system).toContain('próximos pasos')
  expect(world.asked[0]?.prompt).toContain('LO QUE TENÍAS ESCRITO:\n(nada)')
  expect(await pane.find({ type: 'Text', text: 'próximos pasos' })).toBeDefined()
  expect(await pane.find({ type: 'Markdown', text: 'Ejecutar los tests' })).toBeDefined()

  await pane.unmount()
})

test('with nothing said yet, a mode turned on and regenerar ask no model', async ($, on) => {
  const world = stage($, on, { isUp: true })

  world.conversation = []
  await world.start()

  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })

  await turnOn({ world, pane }, 'resumen')
  await turnOn({ world, pane }, 'asesor')
  await pane.press({ key: 'redo' })
  await world.clock.settle()
  expect(world.asked).toHaveLength(0)
  expect(await pane.find({ type: 'Text', text: 'Comentaré aquí' })).toBeDefined()

  await pane.unmount()
})

test('regenerar asks as if the last note were not written: the new one takes its place, silence leaves none', async ($, on) => {
  const { world, pane } = await opened($, on, { choice: { mode: 'asesor' } })

  await world.turn()
  world.reply = '- Segunda.'
  await world.turn()

  world.reply = '- Nota rehecha.'
  await pane.press({ key: 'redo' })
  await world.clock.settle()

  const again = world.asked.at(-1)

  expect(again?.system).toContain('Eres un consejero')
  expect(again?.prompt).toContain('TUS NOTAS ANTERIORES:\n- Falta un test')
  expect(again?.prompt).not.toContain('Segunda')
  expect(await pane.find({ type: 'Markdown', text: 'Nota rehecha' })).toBeDefined()
  expect(await pane.find({ type: 'Markdown', text: 'Segunda' })).toBeUndefined()
  expect(await pane.find({ type: 'Text', text: 'nota 2' })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: 'nota 3' })).toBeUndefined()

  // A model that fails leaves the note as it was.
  world.failure = 'empty'
  await pane.press({ key: 'redo' })
  await world.clock.settle()
  expect(await pane.find({ type: 'Markdown', text: 'Nota rehecha' })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: 'Sin comentario: empty-reply' })).toBeDefined()

  // Silence in its place leaves none there.
  world.failure = null
  world.reply = '—'
  await pane.press({ key: 'redo' })
  await world.clock.settle()
  expect(await pane.find({ type: 'Markdown', text: 'Nota rehecha' })).toBeUndefined()
  expect(await pane.find({ type: 'Text', text: 'nota 2' })).toBeUndefined()
  expect(await pane.find({ type: 'Text', text: 'nota 1' })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: 'Sin comentario' })).toBeUndefined()

  await pane.unmount()
})

test('regenerar takes the place of the note it was made from: one discarded meanwhile leaves the rest alone', async ($, on) => {
  const { world, pane } = await opened($, on, { choice: { mode: 'asesor' } })

  await world.turn()
  world.reply = '- Segunda.'
  await world.turn()

  world.reply = '- Nota rehecha.'
  world.latency = 1000
  await pane.press({ key: 'redo' })
  await world.clock.settle()
  await pane.press({ key: 'discard-2' })
  await world.clock.advance(1000)

  expect(await pane.find({ type: 'Markdown', text: 'Nota rehecha' })).toBeUndefined()
  expect(await pane.find({ type: 'Markdown', text: 'Falta un test' })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: 'nota 1' })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: 'nota 2' })).toBeUndefined()

  await pane.unmount()
})

test('regenerar makes a kept text anew, from the whole conversation', async ($, on) => {
  const { world, pane } = await opened($, on, { choice: { mode: 'pendientes' } })

  expect(world.asked).toHaveLength(1)
  world.reply = '- Revisar el parser'
  await pane.press({ key: 'redo' })
  await world.clock.settle()
  expect(world.asked).toHaveLength(2)
  expect(world.asked[1]?.prompt).toContain('LO QUE TENÍAS ESCRITO:\n(nada)')
  expect(world.asked[1]?.prompt).toContain('PERSONA: arregla el parser')
  expect(await pane.find({ type: 'Markdown', text: 'Revisar el parser' })).toBeDefined()
  expect(await pane.find({ type: 'Markdown', text: 'Falta un test' })).toBeUndefined()

  await pane.unmount()
})

test('while the model answers the pane says so; a turn that ends meanwhile is read once it has', async ($, on) => {
  const { world, pane } = await opened($, on)

  world.latency = 1000
  await $.turn.complete(TURN)
  await world.clock.settle()
  expect(await pane.find({ type: 'Text', text: 'pensando' })).toBeDefined()

  // Two turns end before the answer: one more reading, not two.
  world.reply = '- La de después.'
  world.conversation = [...world.conversation, ANSWER]
  await $.turn.complete(TURN)
  world.conversation = [...world.conversation, ANSWER]
  await $.turn.complete(TURN)
  await world.clock.advance(1000)
  expect(world.asked).toHaveLength(2)
  expect(await pane.find({ type: 'Text', text: 'pensando' })).toBeDefined()
  await world.clock.advance(1000)
  expect(world.asked).toHaveLength(2)
  expect(await pane.find({ type: 'Text', text: 'pensando' })).toBeUndefined()
  expect(await pane.find({ type: 'Markdown', text: 'Falta un test' })).toBeDefined()
  expect(await pane.find({ type: 'Markdown', text: 'La de después' })).toBeDefined()

  await pane.unmount()
})

test('a comment of a mode the person turned off while the model answered is not shown', async ($, on) => {
  const it = await opened($, on, { choice: { mode: 'asesor' } })
  const { world, pane } = it

  world.latency = 1000
  world.reply = '- Del asesor.'
  await $.turn.complete(TURN)
  await world.clock.settle()

  await turnOff(it, 'asesor')
  await world.clock.advance(1000)
  expect(world.asked).toHaveLength(1)
  expect(await pane.find({ type: 'Markdown', text: 'Del asesor' })).toBeUndefined()

  await pane.unmount()
})

test('a model that fails is said in the pane with why, and the next answer clears it', async ($, on) => {
  const { world, pane } = await opened($, on)

  world.failure = 'empty'
  await world.turn()
  expect(await pane.find({ type: 'Text', text: 'Sin comentario: empty-reply' })).toBeDefined()

  world.failure = 'api'
  await world.turn()
  expect(await pane.find({ type: 'Text', text: 'Sin comentario: api-error overloaded 529' })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: 'pensando' })).toBeUndefined()

  world.failure = null
  await world.turn()
  expect(await pane.find({ type: 'Text', text: 'Sin comentario' })).toBeUndefined()
  expect(await pane.find({ type: 'Markdown', text: 'Falta un test' })).toBeDefined()

  await pane.unmount()
})

test('a model the engine refuses is said for its mode alone: the others are still asked, and one’s success keeps the other’s error', async ($, on) => {
  const it = await opened($, on)
  const { world, pane } = it

  await turnOn(it, 'troll')
  await showMode(it, 'vigilante')
  await pane.press({ key: 'model-haiku' })
  world.blocked = 'haiku'
  world.asked.length = 0
  await world.turn()

  expect(world.asked.map(asked => asked.model)).toEqual(['haiku', 'sonnet'])
  // The reason as the pane says it for any failure, not the raw rejection.
  expect(
    await pane.find({
      type: 'Text',
      text: 'Sin comentario: ui-companion: $.model.complete: model haiku is not allowed',
    }),
  ).toBeDefined()
  expect(await pane.find({ type: 'Text', text: /Error:/ })).toBeUndefined()
  expect(await pane.find({ type: 'Text', text: 'pensando' })).toBeUndefined()

  // The troll answered: its notes show, and no error of the vigilante's is on them.
  await showMode(it, 'troll')
  expect(await pane.find({ type: 'Markdown', text: 'Falta un test' })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: /Sin comentario/ })).toBeUndefined()

  // The vigilante's error stays until it succeeds itself.
  await showMode(it, 'vigilante')
  expect(await pane.find({ type: 'Text', text: /Sin comentario/ })).toBeDefined()
  world.blocked = null
  await world.turn()
  expect(await pane.find({ type: 'Text', text: /Sin comentario/ })).toBeUndefined()

  await pane.unmount()
})

test('minimized, it keeps commenting, its last note above the prompt in its color, until seen or put away', async ($, on) => {
  const { world, pane } = await opened($, on)
  const footer = await $.ui.mount({ ...FOOTER, surface: 'terminal' })
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })

  await world.turn()
  // Open, a note is in the pane alone.
  expect(await band.find({ key: 'alert-text-vigilante' })).toBeUndefined()

  await pane.press({ key: 'minimize' })
  expect(world.closed).toEqual(['plugin'])
  await world.turn()
  expect((await band.find({ key: 'alert-open-vigilante' }))?.text).toBe('companion · vigilante · nota 2')
  expect((await band.find({ type: 'Text', text: '- Falta un test para el caso vacío.' }))?.props.color).toBe('warning')
  // Silence leaves it as it was; the dot stays green, the advisor still commenting.
  world.reply = '—'
  await world.turn()
  expect((await band.find({ key: 'alert-open-vigilante' }))?.text).toBe('companion · vigilante · nota 2')
  expect((await footer.find({ type: 'Text', text: '●' }))?.props.color).toBe('success')

  // ✕ puts it away; a press on the next one brings the pane back.
  await band.press({ key: 'alert-dismiss-vigilante' })
  expect(await band.find({ key: 'alert-text-vigilante' })).toBeUndefined()
  world.reply = '- Otra cosa.'
  await world.turn()
  await band.press({ key: 'alert-text-vigilante' })
  expect(world.opened).toEqual(['consejero: Compañero'])
  expect(await band.find({ key: 'alert-text-vigilante' })).toBeUndefined()

  await pane.unmount()
  await footer.unmount()
  await band.unmount()
})

test('minimized, its alert includes the whole note in the conversation or deletes it, and goes', async ($, on) => {
  const { world, pane } = await opened($, on)
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })

  await pane.press({ key: 'minimize' })
  world.reply = '- Uno.\n- Dos.'
  await world.turn()

  // Refused above, the alert stays.
  world.refusal = 'no en este modo'
  await band.press({ key: 'alert-send-vigilante' })
  expect(world.sent).toHaveLength(0)
  expect(await band.find({ key: 'alert-send-vigilante' })).toBeDefined()

  world.refusal = null
  await band.press({ key: 'alert-send-vigilante' })
  expect(world.sent[0]).toContain('- Uno.\n- Dos.')
  expect(world.notices[0]).toBe('Companion vigilante → Claude (nota 1):')
  expect(await band.find({ key: 'alert-send-vigilante' })).toBeUndefined()

  // Deleted, the note is gone from the pane too.
  world.reply = '- Tres.'
  await world.turn()
  await band.press({ key: 'alert-discard-vigilante' })
  expect(await band.find({ key: 'alert-discard-vigilante' })).toBeUndefined()
  expect(await pane.find({ type: 'Markdown', text: '- Tres.' })).toBeUndefined()
  expect(await pane.find({ key: 'send-1-1' })).toBeUndefined()
  expect(await pane.find({ type: 'Text', text: 'incluido' })).toBeDefined()

  await pane.unmount()
  await band.unmount()
})

test('each mode on shows above the prompt what it writes minimized, one under another: a kept text by its name, in its color', async ($, on) => {
  const it = await opened($, on)
  const { world, pane } = it
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })

  world.reply = '- Revisar el parser.'
  await turnOn(it, 'pendientes')
  await pane.press({ key: 'minimize' })
  world.reply = '- Probar el parser.'
  await world.turn()
  expect((await band.find({ key: 'alert-open-pendientes' }))?.text).toBe('companion · pendientes · próximos pasos')
  expect((await band.findAll({ type: 'Text', text: '- Probar el parser.' })).map(text => text.props.color)).toEqual([
    'warning',
    'planMode',
  ])

  // Turned off, its alert goes.
  await turnOff(it, 'pendientes')
  expect(await band.find({ key: 'alert-open-pendientes' })).toBeUndefined()

  await pane.unmount()
  await band.unmount()
})

test("a mode's alert never shows, shows while minimized, or always, the pane open too, and the choice is kept", async ($, on) => {
  const { world, pane } = await opened($, on)
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })

  await pane.press({ key: 'when-nunca' })
  await pane.press({ key: 'save-global' })
  expect(world.stored.settings).toMatchObject({ setups: { vigilante: { alert: 'never' } } })
  await pane.press({ key: 'minimize' })
  await world.turn()
  expect(await band.find({ key: 'alert-text-vigilante' })).toBeUndefined()

  // Always: the pane open, and opening it leaves it there.
  await world.start()
  await pane.press({ key: 'when-siempre' })
  await world.turn()
  expect(await band.find({ key: 'alert-text-vigilante' })).toBeDefined()
  await band.press({ key: 'alert-text-vigilante' })
  expect(await band.find({ key: 'alert-text-vigilante' })).toBeDefined()

  await pane.unmount()
  await band.unmount()
})

test('the command turns it on and off', async ($, on) => {
  const world = stage($, on)
  const run = () =>
    requested(() =>
      $.command.run({
        command: 'consejero',
        args: '',
        origin: { kind: 'composer' },
        presentation: { isFullscreen: true, columns: 160 },
      }),
    )

  await world.start()
  await run()
  expect(world.opened).toEqual(['consejero: Compañero'])
  await world.turn()
  expect(world.asked).toHaveLength(1)

  await run()
  expect(world.closed).toEqual(['plugin'])
  await world.turn()
  expect(world.asked).toHaveLength(1)

  await run()
  await world.turn()
  expect(world.asked).toHaveLength(2)
})

test('each point of a note is put in the assistant’s conversation on its own, as the companion’s, and marked sent', async ($, on) => {
  const { world, pane } = await opened($, on, { choice: { mode: 'asesor' } })

  await world.turn()
  world.reply = '- Segunda.\n  sigue aquí.\n- Tercera.'
  await world.turn()

  await pane.press({ key: 'send-1-1' })
  expect(world.sent).toHaveLength(1)
  expect(world.sent[0]).toContain('nota de su companion')
  expect(world.sent[0]).toContain('modo «asesor»')
  expect(world.sent[0]).toContain('- Falta un test')
  expect(world.sent[0]).not.toContain('Segunda')
  // The person sees in the transcript what went, which the row sent does not show.
  expect(world.notices).toEqual(['Companion asesor → Claude (nota 1):', '- Falta un test para el caso vacío.'])
  // Sent, it offers no second sending; the other note's points still do.
  expect(await pane.find({ key: 'send-1-1' })).toBeUndefined()
  expect(await pane.find({ type: 'Text', text: 'incluido' })).toBeDefined()
  expect(await pane.find({ key: 'send-2-1' })).toBeDefined()

  // Refused above, nothing is marked and the pane says why.
  world.refusal = 'no en este modo'
  await pane.press({ key: 'send-2-1' })
  expect(world.sent).toHaveLength(1)
  expect(world.notices).toHaveLength(2)
  expect(await pane.find({ key: 'send-2-1' })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: 'Sin incluir: no en este modo' })).toBeDefined()

  // One point goes alone, the lines that continue it with it; the other stays to send.
  world.refusal = null
  await pane.press({ key: 'send-2-1' })
  expect(world.sent[1]).toContain('- Segunda.\n  sigue aquí.')
  expect(world.sent[1]).not.toContain('Tercera')
  expect(await pane.find({ key: 'send-2-1' })).toBeUndefined()
  expect(await pane.find({ key: 'send-2-2' })).toBeDefined()

  await pane.unmount()
})

test('a kept text is sent a point at a time, and one written in its place can be sent again', async ($, on) => {
  const { world, pane } = await opened($, on, { choice: { mode: 'pendientes' } })

  await pane.press({ key: 'send-1' })
  expect(world.sent[0]).toContain('modo «pendientes»')
  expect(world.sent[0]).toContain('- Falta un test')
  expect(world.notices[0]).toBe('Companion pendientes → Claude:')
  expect(await pane.find({ key: 'send-1' })).toBeUndefined()

  world.reply = '- Ejecutar los tests'
  await world.turn()
  expect(await pane.find({ key: 'send-1' })).toBeDefined()

  await pane.unmount()
})

test("⚙ prompts shows each mode's field in the mobile app too", async ($, on) => {
  const world = stage($, on, { isUp: true })
  await world.start()
  await world.clock.settle()

  const pane = await $.ui.mount({ ...PANE, surface: 'mobile' })

  await pane.press({ key: 'prompts' })
  expect(await pane.find({ type: 'Input', key: 'prompt-vigilante' })).toBeDefined()
  await pane.unmount()
})

test('a mode turned off and on again with nothing said since is not asked for the same comment twice', async ($, on) => {
  const it = await opened($, on)

  await it.world.turn()
  await turnOff(it, 'vigilante')
  await turnOn(it, 'vigilante')
  expect(it.world.asked.filter(each => each.system?.includes('Eres un vigilante'))).toHaveLength(1)

  await it.pane.unmount()
})

test('regenerar remakes the note of the mode shown, not the last note of another mode', async ($, on) => {
  const it = await opened($, on)
  const { world, pane } = it

  await turnOn(it, 'asesor')
  await world.turn()
  await showMode(it, 'vigilante')
  world.reply = '- Rehecha.'
  await pane.press({ key: 'redo' })
  await world.clock.settle()
  expect(await pane.find({ type: 'Markdown', text: 'Rehecha' })).toBeDefined()
  expect(await pane.find({ type: 'Markdown', text: 'Falta un test' })).toBeUndefined()

  await pane.unmount()
})

test('regenerar asked twice while the model answers is answered once', async ($, on) => {
  const { world, pane } = await opened($, on)

  world.latency = 1000
  await $.turn.complete(TURN)
  await world.clock.settle()
  await pane.press({ key: 'redo' })
  await pane.press({ key: 'redo' })
  await world.clock.advance(1000)
  await world.clock.advance(1000)
  await world.clock.advance(1000)
  expect(world.asked).toHaveLength(2)

  await pane.unmount()
})

test('a silent reply leaves a kept text as it was', async ($, on) => {
  const it = await opened($, on)
  const { world, pane } = it

  await turnOff(it, 'vigilante')
  world.reply = '- Se arregla el parser.'
  await turnOn(it, 'resumen')
  world.reply = '—'
  await world.turn()
  expect(await pane.find({ type: 'Markdown', text: 'Se arregla el parser' })).toBeDefined()

  await pane.unmount()
})

test('a note made again that the person discarded meanwhile is not warned of above the prompt', async ($, on) => {
  const { world, pane } = await opened($, on, { choice: { mode: 'asesor' } })
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })

  await world.turn()
  world.reply = '- Segunda.'
  await world.turn()
  world.reply = '- Nota rehecha.'
  world.latency = 1000
  await pane.press({ key: 'redo' })
  await world.clock.settle()
  await pane.press({ key: 'discard-2' })
  await pane.press({ key: 'minimize' })
  await world.clock.advance(1000)
  expect(await band.find({ key: 'alert-text-asesor' })).toBeUndefined()

  await pane.unmount()
  await band.unmount()
})

test('a note is discarded alone, and all the notes of a mode at once, without touching another mode’s', async ($, on) => {
  const it = await opened($, on)
  const { world, pane } = it

  await world.turn()
  await turnOn(it, 'asesor')
  await pane.press({ key: 'discard-1' })
  await showMode(it, 'vigilante')
  expect(await pane.find({ type: 'Text', text: 'nota 1' })).toBeDefined()

  await showMode(it, 'asesor')
  await world.turn()
  await pane.press({ key: 'discard-all' })
  expect(await pane.find({ type: 'Text', text: 'nota 1' })).toBeUndefined()
  await showMode(it, 'vigilante')
  expect(await pane.find({ type: 'Text', text: 'nota 1' })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: 'nota 2' })).toBeDefined()

  await pane.unmount()
})

test('a prompt written is what its field shows, and one written equal to the mode’s own is the own again', async ($, on) => {
  const { pane } = await opened($, on)
  const field = async () => (await pane.find({ key: 'prompt-vigilante' }))?.props.value

  await pane.press({ key: 'prompts' })

  const own = String(await field())

  await pane.input({ key: 'prompt-vigilante', text: 'Avisa solo de lo grave.' })
  expect(await field()).toBe('Avisa solo de lo grave.')

  await pane.input({ key: 'prompt-vigilante', text: `${own}\n` })
  expect(await field()).toBe(own)
  expect(await pane.find({ type: 'Text', text: 'editado' })).toBeUndefined()

  await pane.unmount()
})

test('⚙ prompts has a way back to the notes, and in the terminal each field has a ground of its own', async ($, on) => {
  const { pane } = await opened($, on)
  const grounds = async (shown: Pick<typeof pane, 'findAll'>) =>
    (await shown.findAll({ type: 'Box' })).filter(box => box.props.backgroundColor === 'subtle')

  expect((await pane.find({ key: 'prompts' }))?.props.label).toBe('⚙ prompts')
  await pane.press({ key: 'prompts' })
  expect((await pane.find({ key: 'prompts' }))?.props.label).toBe('← notas')
  expect(await grounds(pane)).toHaveLength(5)

  const desktop = await $.ui.mount({ ...PANE, surface: 'desktop' })

  expect(await grounds(desktop)).toHaveLength(0)

  await desktop.unmount()
  await pane.unmount()
})

test('saved for the project, a session starts with it before the global settings, until it is forgotten', async ($, on) => {
  on('session.root', () => ({ value: '/repo' }))

  const { world, pane } = await opened($, on, { settings: { setups: { vigilante: { model: 'opus' } } } })
  const source = async () => (await pane.find({ type: 'Text', text: /^Ajustes/ }))?.text
  const variant = async () => (await pane.find({ key: 'save-project' }))?.props.variant
  const own = () => pane.find({ type: 'Text', text: 'Este proyecto tiene los suyos' })

  expect(await source()).toBe('Ajustes globales')
  expect(await pane.find({ key: 'forget-project' })).toBeUndefined()
  expect(await variant()).toBe('secondary')

  // Unsaved, a change asks the project's save to stand out.
  await pane.press({ key: 'model-haiku' })
  expect(await variant()).toBe('primary')
  await pane.press({ key: 'save-project' })
  expect(world.stored['settings:/repo']).toMatchObject({ setups: { vigilante: { model: 'haiku' } } })
  expect(await source()).toBe('Ajustes de este proyecto')
  expect(await pane.find({ key: 'forget-project' })).toBeDefined()
  expect(await own()).toBeUndefined()

  // Saved as global too, the project's own are still there and say so.
  await pane.press({ key: 'model-sonnet' })
  await pane.press({ key: 'save-global' })
  expect(await source()).toBe('Ajustes globales')
  expect(await own()).toBeDefined()

  // The next session starts with the project's, haiku, not the global sonnet.
  await world.start()
  expect(await source()).toBe('Ajustes de este proyecto')
  expect(await pane.find({ type: 'Text', text: ' haiku ' })).toBeDefined()

  await pane.press({ key: 'forget-project' })
  expect(world.stored['settings:/repo']).toBeUndefined()
  expect(await source()).toBe('Ajustes globales')
  expect(await pane.find({ type: 'Text', text: ' sonnet ' })).toBeDefined()

  await pane.unmount()
})

test('a session that tells no project cannot save for it, and says so', async ($, on) => {
  const toasts: string[] = []

  on('ui.toast', (_, e) => (toasts.push(e.text), { value: undefined }))
  on('session.root', () => ({ deny: 'no root' }))

  const { world, pane } = await opened($, on)

  await pane.press({ key: 'save-project' })
  expect(toasts).toEqual(['Esta sesión no dice cuál es su proyecto'])
  expect(world.stored).toEqual({})

  await pane.unmount()
})

test('resetting puts away the alert of a mode the defaults turn off', async ($, on) => {
  const it = await opened($, on)
  const { world, pane } = it
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })

  await turnOn(it, 'asesor')
  await pane.press({ key: 'minimize' })
  await world.turn()
  expect(await band.find({ key: 'alert-text-asesor' })).toBeDefined()

  await pane.press({ key: 'reset' })
  expect(await band.find({ key: 'alert-text-asesor' })).toBeUndefined()
  expect(await band.find({ key: 'alert-text-vigilante' })).toBeDefined()

  await pane.unmount()
  await band.unmount()
})

test('opening the pane puts away the alerts it showed, which do not come back when it is put away again', async ($, on) => {
  const { world, pane } = await opened($, on)
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })

  await pane.press({ key: 'minimize' })
  await world.turn()
  await band.press({ key: 'alert-text-vigilante' })
  world.reply = '—'
  await pane.press({ key: 'minimize' })
  expect(await band.find({ key: 'alert-text-vigilante' })).toBeUndefined()

  await pane.unmount()
  await band.unmount()
})

test('the footer button’s dot is hollow and gray while every mode is off', async ($, on) => {
  const it = await opened($, on)
  const footer = await $.ui.mount({ ...FOOTER, surface: 'terminal' })

  await turnOff(it, 'vigilante')
  expect((await footer.find({ type: 'Text', text: '○' }))?.props.color).toBe('inactive')

  await it.pane.unmount()
  await footer.unmount()
})

test('a new session starts minimized only when set to', async ($, on) => {
  const world = stage($, on)
  const footer = await $.ui.mount({ ...FOOTER, surface: 'terminal' })

  world.conversation = []
  await world.start()
  expect((await footer.find({ type: 'Text', text: '○' }))?.props.color).toBe('inactive')

  await footer.unmount()
})

test('a session that is not interactive does not start minimized', async ($, on) => {
  const world = stage($, on, { stored: { settings: { startsOpen: true } } })
  const footer = await $.ui.mount({ ...FOOTER, surface: 'terminal' })

  world.conversation = []
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: false })
  expect((await footer.find({ type: 'Text', text: '○' }))?.props.color).toBe('inactive')

  await footer.unmount()
})

test('a reload while the model answers lowers the flag that says it thinks', async ($, on) => {
  const { world, pane } = await opened($, on)

  world.latency = 1000
  await $.turn.complete(TURN)
  await world.clock.settle()
  expect(await pane.find({ type: 'Text', text: 'pensando' })).toBeDefined()

  await world.start()
  expect(await pane.find({ type: 'Text', text: 'pensando' })).toBeUndefined()

  await world.clock.advance(1000)
  await pane.unmount()
})

test('a compaction that is a precompute, or an agent’s own, leaves what the text covers as it was', async ($, on) => {
  const it = await opened($, on)
  const { world, pane } = it

  await turnOff(it, 'vigilante')
  await turnOn(it, 'resumen')
  world.compaction = () => ({ messages: world.conversation })
  await $.session.compact({ trigger: 'precompute', messages: world.conversation })
  await world.turn()
  expect(world.asked.at(-1)?.prompt).not.toContain('PERSONA: arregla el parser')

  await $.session.compact({ trigger: 'manual', agentId: 'sub1', messages: world.conversation })
  await world.turn()
  expect(world.asked.at(-1)?.prompt).not.toContain('PERSONA: arregla el parser')

  await pane.unmount()
})

test('a question asked above the prompt has the band to itself, and with no alert it is left as drawn', async ($, on) => {
  const world = stage($, on)

  await world.start()

  const asking = await $.ui.mount({ ...BAND, props: { ...BAND.props, hasSurvey: true }, surface: 'desktop' })

  expect(await asking.find({ key: 'consejero' })).toBeUndefined()
  expect(await asking.find({ type: 'Text', text: 'auto' })).toBeDefined()

  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })

  expect(await band.find({ type: 'Box' })).toBeUndefined()

  await asking.unmount()
  await band.unmount()
})

test('the modes off are dim among the modes, the ones on at full strength', async ($, on) => {
  const it = await opened($, on)
  const { pane } = it

  expect((await pane.find({ key: 'mode-asesor' }))?.props.dimColor).toBe(true)
  await turnOn(it, 'asesor')
  expect((await pane.find({ key: 'mode-vigilante' }))?.props.dimColor).toBe(false)
  expect((await pane.find({ key: 'mode-troll' }))?.props.dimColor).toBe(true)

  await pane.unmount()
})

test('with the pane off and nothing to show there are no buttons over the notes', async ($, on) => {
  const { pane } = await opened($, on)
  const row = async () => (await pane.findAll({ type: 'Box' })).filter(box => box.props.justifyContent === 'flex-end')

  expect(await row()).toHaveLength(1)
  await pane.press({ key: 'power' })
  expect(await row()).toHaveLength(0)

  await pane.unmount()
})

test('while the model answers the pane says so in place of the idle line, and not while it is off', async ($, on) => {
  const { world, pane } = await opened($, on)

  expect(await pane.find({ type: 'Text', text: 'Avisaré aquí' })).toBeDefined()
  world.latency = 1000
  await $.turn.complete(TURN)
  await world.clock.settle()
  expect(await pane.find({ type: 'Text', text: 'pensando' })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: 'Avisaré aquí' })).toBeUndefined()

  await pane.press({ key: 'power' })
  expect(await pane.find({ type: 'Text', text: 'pensando' })).toBeUndefined()

  await world.clock.advance(1000)
  await pane.unmount()
})

test('the pane says why a mode wrote nothing only when it failed, and a mode off says it is off', async ($, on) => {
  const it = await opened($, on)
  const { pane } = it

  expect(await pane.find({ type: 'Text', text: /^✗/ })).toBeUndefined()
  await turnOff(it, 'vigilante')
  expect(await pane.find({ type: 'Text', text: 'Este modo está apagado' })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: 'Avisaré aquí' })).toBeUndefined()

  await pane.unmount()
})

test('the notes before the newest are drawn dim', async ($, on) => {
  const { world, pane } = await opened($, on)

  await world.turn()
  world.reply = '- Otra cosa.'
  await world.turn()

  const cards = (await pane.findAll({ type: 'Box' })).filter(box => box.props.borderStyle === 'round')

  expect(cards.map(card => card.props.borderDimColor)).toEqual([false, true])

  await pane.unmount()
})
