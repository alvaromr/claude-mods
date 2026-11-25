import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

type Surface = 'terminal' | 'desktop'

const EDIT = {
  filePath: '/repo/a.ts',
  oldString: 'a',
  newString: 'b',
  originalFile: 'a',
  structuredPatch: [{ oldStart: 1, oldLines: 2, newStart: 1, newLines: 4, lines: [' x', '-a', '+b', '+c', '+d'] }],
  userModified: false,
  replaceAll: false,
}
const BASH = {
  stdout: 'hecho',
  stderr: '',
  interrupted: false,
  bashEditDiff: { files: [], moreFiles: 0 },
}

// A call's result as the transcript file keeps it: a user's row, the result beside the message.
const resultRow = (id: string, output: unknown) =>
  `${JSON.stringify({
    type: 'user',
    message: { content: [{ type: 'tool_result', tool_use_id: id, content: 'ok' }] },
    toolUseResult: output,
  })}\n`

/**
 * The session's transcript file, read by ranges as `$.fs.read` does: `text` is
 * what the file holds at each pass over it (`pass` counts from 1), `passes` how
 * many there were, one `$.fs.stat` each, and `reads` the reads the mod asked.
 */
const transcript = (
  on: On,
  text: (pass: number) => string | Promise<string> = () => '',
  path = '/cfg/projects/-repo/abc.jsonl',
) => {
  const file = {
    passes: 0,
    bytes: new Uint8Array() as Uint8Array,
    reads: [] as { path: string; as: string; offset?: number }[],
  }

  on('session.info', () => ({ value: { transcriptPath: path } }))
  on('fs.stat', async () => {
    file.passes += 1
    file.bytes = new TextEncoder().encode(await text(file.passes))

    return { value: { kind: 'file' as const, size: file.bytes.length, mtimeMs: 0, isLink: false } }
  })
  on('fs.read', (_, e) => {
    file.reads.push(e)

    // The engine cuts the answer to the range asked.
    return { value: { base64: btoa(Array.from(file.bytes, byte => String.fromCharCode(byte)).join('')) } }
  })

  return file
}

// The engine beneath: the footer's own row, then the slot rows another mod laid
// (its buttons in slots 1 and 2), and each result drawn as the output it is handed.
const stage = (on: On, hasSlots: boolean) => {
  on('ui.render', { component: 'SessionMode' }, ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const slot = (n: string, label: string) => (
      <Box width="100%">
        <Box key={`slot:${n}:other`}>
          <Button key={label} plain label={label} onPress={() => undefined} />
        </Box>
      </Box>
    )

    return (
      <Box flexDirection="column">
        <Text>beneath</Text>
        {hasSlots && slot('2', 'second')}
        {hasSlots && slot('1', 'last')}
        {hasSlots && slot('1.1', 'first')}
      </Box>
    )
  })
  on('ui.render', { component: 'ToolResult' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>{JSON.stringify(e.props.output)}</Text>
  })
}

const footer = ($: Engine, surface: Surface = 'terminal') =>
  $.ui.mount({ plugin: 'ui-declutter', surface, component: 'SessionMode', props: { modes: [] } })

/** A level chosen in the pane, as the person picks it there. */
const choose = async ($: Engine, key: 'diffs' | 'commands', value: string) => {
  const pane = await $.ui.mount({
    plugin: 'ui-declutter',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'declutter',
    props: {
      title: 'Limpieza',
      isFocused: false,
      bodyColumns: 60,
      placement: 'dock',
      scroll: { offset: 0, bodyRows: 20 },
      view: {},
    },
  })

  await pane.press({ key: `${key}-${value}` })
  await pane.unmount()
}

const result = ($: Engine, tool: string, output: unknown, surface: Surface = 'terminal') =>
  $.ui.mount({
    plugin: 'ui-declutter',
    surface,
    component: 'ToolResult',
    props: { tool_use_id: `${tool}-1`, tool, output, isErrored: false },
  })

test("the button joins the first slot row, third, and opens the pane, whose diffs' level is summary, full or hidden", async ($, on) => {
  stage(on, true)

  const open = new Set<string>()
  const titles: (string | undefined)[] = []

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
      ? (open.add(e.id), titles.push(e.title), { value: { isPlaced: true } })
      : { value: { isPlaced: false, reason: 'unasked' } },
  )
  on('ui.close', (_, e) => (open.delete(e.id), { value: undefined }))
  on('ui.panes', () => ({
    value: [...open].map(id => ({ id, title: id, isShown: true, isFocused: false, isPlaced: true })),
  }))

  const ui = await footer($)
  const rows = (await ui.findAll({ type: 'Box' })).filter(box => box.props.width === '100%')

  // The rows in their numbers' order after the rest, each in its places'
  // order; one with no place goes last.
  expect(rows).toHaveLength(2)
  expect((await ui.find({ type: 'Text' }))?.text).toBe('beneath')
  expect((await ui.findAll({ type: 'Button' })).map(button => button.props.label ?? button.text)).toEqual([
    'first',
    '● declutter',
    'last',
    'second',
  ])

  await ui.press({ key: 'declutter' })
  expect([...open]).toEqual(['declutter'])
  expect(titles).toEqual(['Limpieza'])

  // In summary an edit's result is in its span's line.
  const edit = await result($, 'Edit', EDIT)
  expect(await edit.find({ type: 'Text' })).toBeUndefined()

  await choose($, 'diffs', 'full')
  expect((await edit.find({ type: 'Text' }))?.text).toContain('structuredPatch')

  await choose($, 'diffs', 'hidden')
  expect(await edit.find({ type: 'Text' })).toBeUndefined()

  await ui.press({ key: 'declutter' })
  expect([...open]).toEqual([])
})

test('alone in the footer the button has a row of its own; off the terminal it adds none', async ($, on) => {
  stage(on, false)

  const ui = await footer($)

  expect((await ui.findAll({ type: 'Text' })).map(text => text.text)).toContain('beneath')
  expect((await ui.findAll({ type: 'Button' })).map(button => button.text)).toEqual(['● declutter'])
  expect(await (await footer($, 'desktop')).findAll({ type: 'Button' })).toEqual([])
})

test("a command's result is in its span; full, it is the engine's whole, the files it changed but for the diffs hidden; off the terminal, every result is the engine's", async ($, on) => {
  stage(on, false)

  const bash = await result($, 'Bash', BASH)
  const read = await result($, 'Read', { text: 'x' })
  expect(await bash.find({ type: 'Text' })).toBeUndefined()
  expect(await read.find({ type: 'Text' })).toBeUndefined()

  // The commands full.
  await choose($, 'commands', 'full')
  expect((await bash.find({ type: 'Text' }))?.text).toBe(JSON.stringify(BASH))
  expect((await read.find({ type: 'Text' }))?.text).toBe(JSON.stringify({ text: 'x' }))

  // The diffs hidden.
  await choose($, 'diffs', 'hidden')
  expect((await bash.find({ type: 'Text' }))?.text).toBe(
    JSON.stringify({ stdout: 'hecho', stderr: '', interrupted: false }),
  )

  const desktop = await result($, 'Edit', EDIT, 'desktop')
  expect((await desktop.find({ type: 'Text' }))?.text).toContain('structuredPatch')
})

test('a run of edits is one line; pressed, each edit in order; one pressed, its diff; a lone edit names its file', async ($, on) => {
  const use = (id: string, name: string, path: string) => ({
    type: 'tool_use',
    id,
    name,
    input: { file_path: `/repo/${path}` },
  })
  const results = (...ids: string[]) => ({
    role: 'user' as const,
    content: ids.map(id => ({ type: 'tool_result', tool_use_id: id, content: 'ok' })),
  })
  stage(on, false)
  on('session.cwd', () => ({ value: '/repo' }))
  on('session.messages', () => ({
    value: [
      { role: 'user' as const, content: [{ type: 'text', text: 'cámbialo' }] },
      { role: 'assistant' as const, content: [{ type: 'text', text: 'Voy.' }, use('w1', 'Write', 'a.ts')] },
      results('w1'),
      { role: 'assistant' as const, content: [use('e1', 'Edit', 'b.ts')] },
      results('e1'),
      { role: 'assistant' as const, content: [use('e2', 'Edit', 'a.ts')] },
      results('e2'),
      // Text ends the span, as does another tool's row.
      { role: 'assistant' as const, content: [{ type: 'text', text: 'Y ahora.' }, use('e3', 'Edit', 'c.ts')] },
      results('e3'),
    ],
  }))
  // The one result no row drawn holds, read from the transcript file.
  transcript(on, () => resultRow('e2', EDIT))
  on('ui.render', { component: 'ToolUse' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>{`${e.props.tool}(${e.props.tool_use_id})`}</Text>
  })

  const row = (id: string, tool: string, output?: unknown) =>
    $.ui.mount({
      plugin: 'ui-declutter',
      surface: 'terminal',
      component: 'ToolUse',
      props: { tool_use_id: id, tool, input: {}, isRunning: false, isErrored: false, isInterrupted: false, output },
    })

  expect(await (await row('e1', 'Edit', EDIT)).findAll({ type: 'Text' })).toEqual([])

  const first = await row('w1', 'Write', { ...EDIT, type: 'create', content: 'a\nb\n', structuredPatch: [] })
  const said = async (key: string) => (await first.find({ key }))?.text

  expect(await said('view')).toBe('3 cambios · 2 ficheros +8 −2 ▸')
  expect(await first.find({ key: 'file-w1-0' })).toBeUndefined()

  // A row per edit, in the order made, a file edited twice twice: the line still counts per file.
  await first.press({ key: 'view' })
  expect((await first.findAll({ type: 'Button' })).map(button => button.key)).toEqual([
    'view',
    'file-w1-0',
    'file-e1-0',
    'file-e2-0',
  ])
  expect(await said('file-w1-0')).toBe('± a.ts ▸ +2 −0')
  expect(await said('file-e1-0')).toBe('± b.ts ▸ +3 −1')
  expect(await said('file-e2-0')).toBe('± a.ts ▸ +3 −1')
  expect(await first.find({ type: 'Code' })).toBeUndefined()

  await first.press({ key: 'file-e1-0' })
  expect((await first.findAll({ type: 'Code' })).map(code => code.props.source)).toEqual([
    '@@ -1,2 +1,4 @@\n x\n-a\n+b\n+c\n+d\n',
  ])

  await first.press({ key: 'view' })
  expect(await first.find({ key: 'file-w1-0' })).toBeUndefined()

  expect((await (await row('e3', 'Edit', EDIT)).find({ key: 'view' }))?.text).toBe('1 cambio · c.ts +3 −1 ▸')
})

// The engine's own edit rows, and one as it hands it to the mod.
const engineRows = (on: On) =>
  on('ui.render', { component: 'ToolUse' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>{`${e.props.tool}(${e.props.tool_use_id})`}</Text>
  })
const editRow = ($: Engine, id: string, isRunning = false) =>
  $.ui.mount({
    plugin: 'ui-declutter',
    surface: 'terminal',
    component: 'ToolUse',
    props: {
      tool_use_id: id,
      tool: 'Edit',
      input: { file_path: '/repo/a.ts' },
      isRunning,
      isErrored: false,
      isInterrupted: false,
      output: isRunning ? undefined : EDIT,
    },
  })
test('a result that cannot be read even off the drawing stays unknown, and why is in the debug log', async ($, on) => {
  const clock = mock.clock(on)
  const use = (id: string) => ({ type: 'tool_use', id, name: 'Edit', input: { file_path: '/repo/a.ts' } })
  const logged: { text: string; to: string }[] = []
  stage(on, false)
  engineRows(on)
  on('ui.log', (_, e) => (logged.push(e), { value: undefined }))
  on('session.cwd', () => ({ value: '/repo' }))
  on('session.messages', () => ({
    value: [
      { role: 'user' as const, content: [{ type: 'text', text: 'cámbialo' }] },
      { role: 'assistant' as const, content: [use('e1'), use('e2')] },
      {
        role: 'user' as const,
        content: ['e1', 'e2'].map(id => ({ type: 'tool_result', tool_use_id: id, content: 'ok' })),
      },
    ],
  }))
  on('session.info', () => ({ value: { transcriptPath: '/cfg/projects/-repo/abc.jsonl' } }))
  // Every read of the transcript is cut short.
  on('fs.stat', () => ({ deny: 'aborted' }))

  const row = await editRow($, 'e1')

  await clock.settle()
  expect((await row.find({ key: 'view' }))?.text).toBe('2 cambios · a.ts +3 −1 ? ▸')
  expect(logged).toContainEqual({
    text: 'reading the results from the transcript failed: ui-declutter: $.fs.stat: aborted',
    to: 'debug',
  })
})

test("a row a compaction took out of the conversation is the engine's; one still running is not in it yet", async ($, on) => {
  stage(on, false)
  engineRows(on)
  on('session.cwd', () => ({ value: '/repo' }))
  // After the compaction, its summary alone.
  on('session.messages', () => ({ value: [{ role: 'user' as const, content: [{ type: 'text', text: 'resumen' }] }] }))

  expect((await (await editRow($, 'o1')).find({ type: 'Text' }))?.text).toBe('Edit(o1)')
  expect(await (await editRow($, 'n1', true)).find({ key: 'view' })).toBeDefined()
})

test('a result read cut short is read again off the drawing, and the span drawn again', async ($, on) => {
  const clock = mock.clock(on)
  const use = (id: string) => ({ type: 'tool_use', id, name: 'Edit', input: { file_path: '/repo/a.ts' } })
  stage(on, false)
  engineRows(on)
  on('session.cwd', () => ({ value: '/repo' }))
  on('session.messages', () => ({
    value: [
      { role: 'user' as const, content: [{ type: 'text', text: 'cámbialo' }] },
      { role: 'assistant' as const, content: [use('e1'), use('e2')] },
      {
        role: 'user' as const,
        content: ['e1', 'e2'].map(id => ({ type: 'tool_result', tool_use_id: id, content: 'ok' })),
      },
    ],
  }))
  transcript(on, pass => {
    // The first read is cancelled, as when a draw takes the asking one's place.
    if (pass === 1) {
      throw new Error('aborted')
    }

    return resultRow('e2', EDIT)
  })
  // As the engine does with a timer a drawing set: it writes no state.
  on('state.set', (_, e, next) => (e.key === 'revision' ? { deny: 'drawing is pure' } : next(e)))

  const first = await editRow($, 'e1')
  expect((await first.find({ key: 'view' }))?.text).toBe('2 cambios · a.ts +3 −1 ? ▸')

  await clock.settle()
  expect((await first.find({ key: 'view' }))?.text).toBe('2 cambios · a.ts +6 −2 ▸')
})

// A conversation of two edits, and the row of the first with its result handed to it.
const twoEdits = (on: On) => {
  const use = (id: string) => ({ type: 'tool_use', id, name: 'Edit', input: { file_path: '/repo/a.ts' } })

  stage(on, false)
  engineRows(on)
  on('session.cwd', () => ({ value: '/repo' }))
  on('session.messages', () => ({
    value: [
      { role: 'user' as const, content: [{ type: 'text', text: 'cámbialo' }] },
      { role: 'assistant' as const, content: [use('e1'), use('e2')] },
      {
        role: 'user' as const,
        content: ['e1', 'e2'].map(id => ({ type: 'tool_result', tool_use_id: id, content: 'ok' })),
      },
    ],
  }))
}

// What a pass over the transcript file finds: e2's result.
const e2 = resultRow('e2', EDIT)

test('a last row of the transcript not written whole yet gives no result', async ($, on) => {
  mock.clock(on)
  twoEdits(on)
  transcript(on, () => e2.slice(0, -10))

  expect((await (await editRow($, 'e1')).find({ key: 'view' }))?.text).toBe('2 cambios · a.ts +3 −1 ? ▸')
})

test('a session with no transcript file on this machine gives no result, and reads no file', async ($, on) => {
  const clock = mock.clock(on)
  const logged: unknown[] = []
  twoEdits(on)
  on('ui.log', (_, e) => (logged.push(e), { value: undefined }))

  const file = transcript(on, () => e2, '')

  expect((await (await editRow($, 'e1')).find({ key: 'view' }))?.text).toBe('2 cambios · a.ts +3 −1 ? ▸')
  await clock.settle()
  expect(file.passes).toBe(0)
  expect(file.reads).toEqual([])
  // Not even a read that the engine turns down for its empty path.
  expect(logged).toEqual([])
})

test('the transcript is read in bytes, at the path the session names, wherever the config folder is', async ($, on) => {
  mock.clock(on)
  twoEdits(on)

  const file = transcript(on, () => e2, '/elsewhere/sessions/abc.jsonl')

  expect((await (await editRow($, 'e1')).find({ key: 'view' }))?.text).toBe('2 cambios · a.ts +6 −2 ▸')
  expect(file.reads).toEqual([{ path: '/elsewhere/sessions/abc.jsonl', as: 'bytes', offset: 0, length: e2.length }])
})

test('a result that arrives replaces the one that was found nowhere, and the rows are drawn again', async ($, on) => {
  mock.clock(on)
  twoEdits(on)
  transcript(on, pass => (pass < 2 ? '' : e2))

  const first = await editRow($, 'e1')

  expect((await first.find({ key: 'view' }))?.text).toBe('2 cambios · a.ts +3 −1 ? ▸')
  await $.session.append({
    door: 'tool-result',
    origin: { kind: 'tool', tool: 'Edit' },
    uuid: 'r2',
    message: { type: 'user', content: [{ type: 'tool_result', tool_use_id: 'e2', content: 'ok' }] },
  })
  expect((await first.find({ key: 'view' }))?.text).toBe('2 cambios · a.ts +6 −2 ▸')
})

test("a new tool call redraws the rows, unless the mod is off, when they are the engine's", async ($, on) => {
  const use = (id: string) => ({ type: 'tool_use', id, name: 'Edit', input: { file_path: '/repo/a.ts' } })
  const messages: unknown[] = [
    { role: 'user' as const, content: [{ type: 'text', text: 'cámbialo' }] },
    { role: 'assistant' as const, content: [use('e1')] },
    { role: 'user' as const, content: [{ type: 'tool_result', tool_use_id: 'e1', content: 'ok' }] },
  ]
  let drawn = 0

  mock.clock(on)
  stage(on, false)
  on('ui.render', { component: 'ToolUse' }, ($, e) => {
    drawn += 1

    const { Text } = $.ui.resolve(e)

    return <Text>{`${e.props.tool}(${e.props.tool_use_id})`}</Text>
  })
  on('session.cwd', () => ({ value: '/repo' }))
  on('session.messages', () => ({ value: messages as never }))
  transcript(on)

  const call = (id: string) =>
    $.session.append({
      door: 'response',
      origin: { kind: 'model', model: 'm' },
      uuid: `u-${id}`,
      message: { type: 'assistant', content: [use(id)] },
    })
  const first = await editRow($, 'e1')

  expect((await first.find({ key: 'view' }))?.text).toBe('1 cambio · a.ts +3 −1 ▸')
  messages.push(
    { role: 'assistant' as const, content: [use('e2')] },
    { role: 'user' as const, content: [{ type: 'tool_result', tool_use_id: 'e2', content: 'ok' }] },
  )
  await call('e2')
  expect((await first.find({ key: 'view' }))?.text).toBe('2 cambios · a.ts +3 −1 ? ▸')

  const off = await $.ui.mount({
    plugin: 'ui-declutter',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'declutter',
    props: {
      title: 'Limpieza',
      isFocused: false,
      bodyColumns: 60,
      placement: 'dock',
      scroll: { offset: 0, bodyRows: 20 },
      view: {},
    },
  })

  await off.press({ key: 'switch' })

  const idle = drawn

  await call('e3')
  // What drew again by now has: the first row's, the engine's.
  expect((await first.find({ type: 'Text' }))?.text).toBe('Edit(e1)')
  expect(drawn).toBe(idle)
})

test('a new conversation forgets the reads the last had queued', async ($, on) => {
  const use = (id: string) => ({ type: 'tool_use', id, name: 'Edit', input: { file_path: '/repo/a.ts' } })
  let release = () => {}
  const held = new Promise<void>(resolve => (release = resolve))
  const clock = mock.clock(on)

  mock.store(on)
  stage(on, false)
  engineRows(on)
  on('session.cwd', () => ({ value: '/repo' }))
  // Each edit a span of its own: the text between them ends one.
  on('session.messages', () => ({
    value: [
      { role: 'user' as const, content: [{ type: 'text', text: 'cámbialo' }] },
      ...['e1', 'e2'].flatMap(id => [
        { role: 'assistant' as const, content: [{ type: 'text', text: 'Voy.' }, use(id)] },
        { role: 'user' as const, content: [{ type: 'tool_result', tool_use_id: id, content: 'ok' }] },
      ]),
    ],
  }))
  on('session.root', () => ({ value: '/repo' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  const file = transcript(on, async pass => {
    if (pass === 1) {
      await held
    }

    return ''
  })

  const row = (id: string) =>
    $.ui.mount({
      plugin: 'ui-declutter',
      surface: 'terminal',
      component: 'ToolUse',
      props: {
        tool_use_id: id,
        tool: 'Edit',
        input: { file_path: '/repo/a.ts' },
        isRunning: false,
        isErrored: false,
        isInterrupted: false,
      },
    })
  const turns = () => clock.settle()

  // The first read is under way for e1; the read e2 asks for queues behind it.
  const first = row('e1')

  await turns()

  const queued = row('e2')

  await turns()
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  release()
  await first
  await queued
  // Only the pass under way ran: e2, which asked behind it, was forgotten.
  expect(file.passes).toBe(1)
})

test('a new conversation reads again the results the last found nowhere, as often as the first did', async ($, on) => {
  const clock = mock.clock(on)

  mock.store(on)
  twoEdits(on)
  on('session.root', () => ({ value: '/repo' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  const file = transcript(on)

  await editRow($, 'e1')

  for (let turn = 0; turn < 3; turn++) {
    await clock.advance(2000)
  }

  expect(file.passes).toBe(3)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await editRow($, 'e1')

  for (let turn = 0; turn < 3; turn++) {
    await clock.advance(2000)
  }

  expect(file.passes).toBe(6)
})

test('a new conversation forgets the results the last read', async ($, on) => {
  let text = e2

  mock.clock(on)
  mock.store(on)
  twoEdits(on)
  on('session.root', () => ({ value: '/repo' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  transcript(on, () => text)
  expect((await (await editRow($, 'e1')).find({ key: 'view' }))?.text).toBe('2 cambios · a.ts +6 −2 ▸')

  text = ''
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  expect((await (await editRow($, 'e1')).find({ key: 'view' }))?.text).toBe('2 cambios · a.ts +3 −1 ? ▸')
})

test('a result known by the time its read comes is not read, and the conversation is read once for all the draws', async ($, on) => {
  const use = (id: string) => ({ type: 'tool_use', id, name: 'Edit', input: { file_path: '/repo/a.ts' } })
  const ids = ['e1', 'e2', 'e3']
  let release = () => {}
  let reads = 0
  const held = new Promise<void>(resolve => (release = resolve))
  const clock = mock.clock(on)
  const row = (id: string, output?: unknown) =>
    $.ui.mount({
      plugin: 'ui-declutter',
      surface: 'terminal',
      component: 'ToolUse',
      props: {
        tool_use_id: id,
        tool: 'Edit',
        input: { file_path: '/repo/a.ts' },
        isRunning: false,
        isErrored: false,
        isInterrupted: false,
        output,
      },
    })

  stage(on, false)
  engineRows(on)
  on('session.cwd', () => ({ value: '/repo' }))
  on(
    'session.messages',
    () => (
      (reads += 1),
      {
        value: [
          { role: 'user' as const, content: [{ type: 'text', text: 'cámbialo' }] },
          ...ids.flatMap(id => [
            { role: 'assistant' as const, content: [{ type: 'text', text: 'Voy.' }, use(id)] },
            { role: 'user' as const, content: [{ type: 'tool_result', tool_use_id: id, content: 'ok' }] },
          ]),
        ],
      }
    ),
  )
  // The file holds another result for e2 than the row brings: read, it would show.
  const other = {
    ...EDIT,
    structuredPatch: [{ oldStart: 1, oldLines: 2, newStart: 1, newLines: 1, lines: ['-a', '-b', '+c'] }],
  }
  const file = transcript(on, async pass => {
    if (pass === 1) {
      await held
    }

    return resultRow('e1', EDIT) + resultRow('e2', other) + resultRow('e3', EDIT)
  })

  const turns = () => clock.settle()
  const first = row('e1')

  await turns()

  const second = row('e2')

  await turns()
  // While the first read is under way, e2 comes with its result: the read that follows has no need of it.
  await row('e2', EDIT)
  release()
  await first
  await second
  expect((await (await row('e3')).find({ key: 'view' }))?.text).toBe('1 cambio · a.ts +3 −1 ▸')
  expect((await (await row('e2')).find({ key: 'view' }))?.text).toBe('1 cambio · a.ts +3 −1 ▸')
  expect(reads).toBe(1)
  expect(file.passes).toBe(2)
})

test('the agents of the conversation that stand in for WebFetch draw as one, though no row said so', async ($, on) => {
  stage(on, false)
  engineRows(on)
  on('session.cwd', () => ({ value: '/repo' }))
  on('session.messages', () => ({
    value: [
      { role: 'user' as const, content: [{ type: 'text', text: 'busca' }] },
      {
        role: 'assistant' as const,
        content: [{ type: 'tool_use', id: 'w1', name: 'Agent', input: { subagent_type: 'web-fetch' } }],
      },
      { role: 'user' as const, content: [{ type: 'tool_result', tool_use_id: 'w1', content: 'page' }] },
    ],
  }))

  const agentResult = () =>
    $.ui.mount({
      plugin: 'ui-declutter',
      surface: 'terminal',
      component: 'ToolResult',
      props: { tool_use_id: 'w1', tool: 'Agent', output: 'page', isErrored: false },
    })

  // The first draw reads the conversation; the next one knows what it found.
  expect((await (await agentResult()).find({ type: 'Text' }))?.text).toBe('"page"')
  expect(await (await agentResult()).find({ type: 'Text' })).toBeUndefined()
})

test('a read of the conversation that was cut short is not kept: the next draw reads it again', async ($, on) => {
  const use = (id: string) => ({ type: 'tool_use', id, name: 'Edit', input: { file_path: '/repo/a.ts' } })
  let reads = 0

  mock.clock(on)
  stage(on, false)
  engineRows(on)
  on('session.cwd', () => ({ value: '/repo' }))
  on('session.messages', () =>
    (reads += 1) === 1
      ? { deny: 'cut short' }
      : {
          value: [
            { role: 'user' as const, content: [{ type: 'text', text: 'cámbialo' }] },
            { role: 'assistant' as const, content: [use('e1'), use('e2')] },
            {
              role: 'user' as const,
              content: ['e1', 'e2'].map(id => ({ type: 'tool_result', tool_use_id: id, content: 'ok' })),
            },
          ],
        },
  )
  transcript(on)

  // The first read cut short, the draw reads again within itself: the two edits are one span.
  expect((await (await editRow($, 'e1')).find({ key: 'view' }))?.text).toBe('2 cambios · a.ts +3 −1 ? ▸')
})

test('a result keeps its diff where the diffs are not hidden; only where they are does a command lose it', async ($, on) => {
  stage(on, false)
  await choose($, 'commands', 'full')
  await choose($, 'diffs', 'full')
  expect((await (await result($, 'Bash', BASH)).find({ type: 'Text' }))?.text).toBe(JSON.stringify(BASH))

  await choose($, 'diffs', 'hidden')

  const other = { text: 'x', bashEditDiff: { files: [], moreFiles: 0 } }

  expect((await (await result($, 'Read', other)).find({ type: 'Text' }))?.text).toBe(JSON.stringify(other))
})

test('a result the transcript file did not hold yet is read again a little later, twice at most', async ($, on) => {
  const clock = mock.clock(on)
  twoEdits(on)
  // As the engine does with a timer a drawing set: it writes no state, so the
  // read again draws the row again without one.
  on('state.set', (_, e, next) => (e.key === 'revision' ? { deny: 'drawing is pure' } : next(e)))

  // The second read finds it: the file was written in between.
  const file = transcript(on, pass => (pass < 2 ? '' : e2))
  const first = await editRow($, 'e1')

  expect((await first.find({ key: 'view' }))?.text).toBe('2 cambios · a.ts +3 −1 ? ▸')
  await clock.advance(2000)
  expect((await first.find({ key: 'view' }))?.text).toBe('2 cambios · a.ts +6 −2 ▸')
  expect(file.passes).toBe(2)
})

test('a result found nowhere is read again twice, then given up', async ($, on) => {
  const clock = mock.clock(on)
  twoEdits(on)

  const file = transcript(on)
  const first = await editRow($, 'e1')

  for (const asked of [1, 2, 3, 3]) {
    expect(file.passes).toBe(asked)
    await clock.advance(2000)
  }

  expect((await first.find({ key: 'view' }))?.text).toBe('2 cambios · a.ts +3 −1 ? ▸')
})

test('the results the draws that came together ask for are read in one pass, those that came while one ran', async ($, on) => {
  const use = (id: string) => ({ type: 'tool_use', id, name: 'Edit', input: { file_path: '/repo/a.ts' } })
  const ids = ['e1', 'e2', 'e3']
  let release = () => {}
  const held = new Promise<void>(resolve => (release = resolve))
  stage(on, false)
  engineRows(on)
  on('session.cwd', () => ({ value: '/repo' }))
  on('session.messages', () => ({
    value: [
      { role: 'user' as const, content: [{ type: 'text', text: 'cámbialo' }] },
      // Each edit a span of its own: the text between them ends one.
      ...ids.flatMap(id => [
        { role: 'assistant' as const, content: [{ type: 'text', text: 'Voy.' }, use(id)] },
        { role: 'user' as const, content: [{ type: 'tool_result', tool_use_id: id, content: 'ok' }] },
      ]),
    ],
  }))
  const file = transcript(on, async pass => {
    // The first read is under way while the others ask.
    if (pass === 1) {
      await held
    }

    return ids.map(id => resultRow(id, EDIT)).join('')
  })

  const rows = Promise.all(
    ids.map(id =>
      $.ui.mount({
        plugin: 'ui-declutter',
        surface: 'terminal',
        component: 'ToolUse',
        props: {
          tool_use_id: id,
          tool: 'Edit',
          input: { file_path: '/repo/a.ts' },
          isRunning: false,
          isErrored: false,
          isInterrupted: false,
        },
      }),
    ),
  )

  // Long enough for the other draws to reach their asking.
  for (let turn = 0; turn < 100; turn++) {
    await Promise.resolve()
  }

  release()

  for (const row of await rows) {
    expect((await row.find({ key: 'view' }))?.text).toBe('1 cambio · a.ts +3 −1 ▸')
  }

  expect(file.passes).toBeLessThan(ids.length)
})

test('a diff too long for a drawing is cut at a line, its header counting the lines kept, without joining them anew for each', async ($, on) => {
  const lines = Array.from({ length: 40000 }, () => '+x')
  const long = {
    ...EDIT,
    structuredPatch: [{ oldStart: 0, oldLines: 0, newStart: 1, newLines: lines.length, lines }],
  }
  mock.clock(on)
  twoEdits(on)
  transcript(on)

  const ui = await $.ui.mount({
    plugin: 'ui-declutter',
    surface: 'terminal',
    component: 'ToolUse',
    props: {
      tool_use_id: 'e1',
      tool: 'Edit',
      input: { file_path: '/repo/a.ts' },
      isRunning: false,
      isErrored: false,
      isInterrupted: false,
      output: long,
    },
  })

  await ui.press({ key: 'view' })

  const started = Date.now()

  await ui.press({ key: 'file-e1-0' })

  const elapsed = Date.now() - started

  const source = String((await ui.find({ type: 'Code' }))?.props.source)
  const kept = Number(/^@@ -0,0 \+1,(\d+) @@\n/.exec(source)?.[1])

  // 40000 lines of 2 characters and a break come to 120000: what fits is 20000 of them.
  expect(kept).toBe(20000)
  expect(source.split('\n')).toHaveLength(kept + 2)
  // Joining the lines kept anew for each one took a second; once, a few milliseconds.
  expect(elapsed).toBeLessThan(400)
})
