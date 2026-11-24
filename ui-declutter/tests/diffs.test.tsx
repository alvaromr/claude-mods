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
  mock.env(on, { HOME: '/Users/me' })
  on('session.id', () => ({ value: 'abc' }))
  on('process.run', () => ({
    value: {
      exitCode: 0,
      stdout: `${JSON.stringify({ id: 'e2', output: EDIT })}\n`,
      stderr: '',
      isStdoutTruncated: false,
      isStderrTruncated: false,
    },
  }))
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
const ran = (stdout: string, exitCode = 0) => ({
  value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
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
  mock.env(on, { HOME: '/Users/me' })
  on('session.id', () => ({ value: 'abc' }))
  // jq is there, but every read of the transcript is cut short.
  on('process.run', (_, e) => (e.argv.includes('command -v jq') ? ran('/usr/bin/jq\n') : { deny: 'aborted' }))

  const row = await editRow($, 'e1')

  await clock.settle()
  expect((await row.find({ key: 'view' }))?.text).toBe('2 cambios · a.ts +3 −1 ? ▸')
  expect(logged).toContainEqual({
    text: 'reading the results from the transcript failed: ui-declutter: $.process.run: aborted',
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
  let reads = 0
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
  mock.env(on, { HOME: '/Users/me' })
  on('session.id', () => ({ value: 'abc' }))
  // The first read is cancelled, as when a draw takes the asking one's place.
  on('process.run', () => {
    reads += 1

    if (reads === 1) {
      throw new Error('aborted')
    }

    return ran(`${JSON.stringify({ id: 'e2', output: EDIT })}\n`)
  })

  const first = await editRow($, 'e1')
  expect((await first.find({ key: 'view' }))?.text).toBe('2 cambios · a.ts +3 −1 ? ▸')

  await clock.settle()
  expect((await first.find({ key: 'view' }))?.text).toBe('2 cambios · a.ts +6 −2 ▸')
})

// A conversation of two edits, and the row of the first with its result handed to it.
const twoEdits = (on: On, env: Record<string, string> = { HOME: '/Users/me' }) => {
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
  mock.env(on, env)
  on('session.id', () => ({ value: 'abc' }))
}

// What a pass over the transcript file finds: e2's result, and whether jq is there.
const e2 = `${JSON.stringify({ id: 'e2', output: EDIT })}\n`
const jq = (argv: readonly string[]) => argv.includes('command -v jq')

test('the last result of an output cut short is left out, and a read that failed gives none', async ($, on) => {
  mock.clock(on)
  twoEdits(on)
  on('process.run', (_, e) =>
    jq(e.argv) ? ran('/usr/bin/jq\n') : { value: { ...ran(e2).value, isStdoutTruncated: true } },
  )

  expect((await (await editRow($, 'e1')).find({ key: 'view' }))?.text).toBe('2 cambios · a.ts +3 −1 ? ▸')
})

test('a read of the transcript that failed gives no result, whatever it printed', async ($, on) => {
  mock.clock(on)
  twoEdits(on)
  on('process.run', (_, e) => (jq(e.argv) ? ran('/usr/bin/jq\n') : ran(e2, 1)))

  expect((await (await editRow($, 'e1')).find({ key: 'view' }))?.text).toBe('2 cambios · a.ts +3 −1 ? ▸')
})

test("the transcript is read from the engine's configured folder, else from the home's", async ($, on) => {
  const roots: string[] = []

  mock.clock(on)
  twoEdits(on, { HOME: '/Users/me', CLAUDE_CONFIG_DIR: '/cfg' })
  on('process.run', (_, e) => (jq(e.argv) ? ran('/usr/bin/jq\n') : (roots.push(e.argv[3] ?? ''), ran(e2))))
  await editRow($, 'e1')
  expect(roots).toEqual(['/cfg'])
})

test("the transcript is read by the plugin's script, given the ids, the folder and the session", async ($, on) => {
  const argvs: (readonly string[])[] = []

  mock.clock(on)
  twoEdits(on, { HOME: '/Users/me', CLAUDE_CONFIG_DIR: '/cfg' })
  on('process.run', (_, e) => (jq(e.argv) ? ran('/usr/bin/jq\n') : (argvs.push(e.argv), ran(e2))))
  await editRow($, 'e1')
  expect(argvs).toHaveLength(1)
  expect(argvs[0]?.[0]).toBe('sh')
  expect(argvs[0]?.[1]?.endsWith('/ui-declutter/scripts/transcript.sh')).toBe(true)
  expect(argvs[0]?.slice(2)).toEqual(['["e2"]', '/cfg', 'abc'])
})

test("the transcript is read from the home's folder where none is configured", async ($, on) => {
  const roots: string[] = []

  mock.clock(on)
  twoEdits(on)
  on('process.run', (_, e) => (jq(e.argv) ? ran('/usr/bin/jq\n') : (roots.push(e.argv[3] ?? ''), ran(e2))))
  await editRow($, 'e1')
  expect(roots).toEqual(['/Users/me/.claude'])
})

test('a result that arrives replaces the one that was found nowhere, and the rows are drawn again', async ($, on) => {
  let reads = 0

  mock.clock(on)
  twoEdits(on)
  on('process.run', (_, e) => (jq(e.argv) ? ran('/usr/bin/jq\n') : ((reads += 1), ran(reads < 2 ? '' : e2))))

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
  mock.env(on, { HOME: '/Users/me' })
  on('session.id', () => ({ value: 'abc' }))
  on('process.run', (_, e) => (jq(e.argv) ? ran('/usr/bin/jq\n') : ran('')))

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
  const passes: string[][] = []
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
  mock.env(on, { HOME: '/Users/me' })
  on('session.id', () => ({ value: 'abc' }))
  on('session.root', () => ({ value: '/repo' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('process.run', async (_, e) => {
    if (jq(e.argv)) {
      return ran('/usr/bin/jq\n')
    }

    passes.push(JSON.parse(e.argv[2] ?? '[]') as string[])

    if (passes.length === 1) {
      await held
    }

    return ran('')
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
  expect(passes).toEqual([['e1']])
})

test('a new conversation reads again the results the last found nowhere, as often as the first did', async ($, on) => {
  const clock = mock.clock(on)
  let reads = 0

  mock.store(on)
  twoEdits(on)
  on('session.root', () => ({ value: '/repo' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('process.run', (_, e) => (jq(e.argv) ? ran('/usr/bin/jq\n') : ((reads += 1), ran(''))))
  await editRow($, 'e1')

  for (let turn = 0; turn < 3; turn++) {
    await clock.advance(2000)
  }

  expect(reads).toBe(3)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await editRow($, 'e1')

  for (let turn = 0; turn < 3; turn++) {
    await clock.advance(2000)
  }

  expect(reads).toBe(6)
})

test('a new conversation forgets the results the last read', async ($, on) => {
  let lines = e2

  mock.clock(on)
  mock.store(on)
  twoEdits(on)
  on('session.root', () => ({ value: '/repo' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('process.run', (_, e) => (jq(e.argv) ? ran('/usr/bin/jq\n') : ran(lines)))
  expect((await (await editRow($, 'e1')).find({ key: 'view' }))?.text).toBe('2 cambios · a.ts +6 −2 ▸')

  lines = ''
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  expect((await (await editRow($, 'e1')).find({ key: 'view' }))?.text).toBe('2 cambios · a.ts +3 −1 ? ▸')
})

test('a result known by the time its read comes is not read, and the conversation is read once for all the draws', async ($, on) => {
  const use = (id: string) => ({ type: 'tool_use', id, name: 'Edit', input: { file_path: '/repo/a.ts' } })
  const ids = ['e1', 'e2', 'e3']
  const passes: string[][] = []
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
  mock.env(on, { HOME: '/Users/me' })
  on('session.id', () => ({ value: 'abc' }))
  on('process.run', async (_, e) => {
    const wanted = JSON.parse(e.argv[2] ?? '[]') as string[]

    passes.push(wanted)

    if (passes.length === 1) {
      await held
    }

    return ran(wanted.map(id => JSON.stringify({ id, output: EDIT })).join('\n'))
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
  await row('e3')
  expect(reads).toBe(1)
  expect(passes).toEqual([['e1'], ['e3']])
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
  mock.env(on, { HOME: '/Users/me' })
  on('session.id', () => ({ value: 'abc' }))
  on('process.run', () => ran(''))

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
  let reads = 0
  twoEdits(on)
  on('process.run', () => {
    reads += 1

    // The second read finds it: the file was written in between.
    return ran(reads < 2 ? '' : `${JSON.stringify({ id: 'e2', output: EDIT })}\n`)
  })

  const first = await editRow($, 'e1')

  expect((await first.find({ key: 'view' }))?.text).toBe('2 cambios · a.ts +3 −1 ? ▸')
  await clock.advance(2000)
  expect((await first.find({ key: 'view' }))?.text).toBe('2 cambios · a.ts +6 −2 ▸')
  expect(reads).toBe(2)
})

test('a result found nowhere is read again twice, then given up', async ($, on) => {
  const clock = mock.clock(on)
  let reads = 0
  twoEdits(on)
  on('process.run', () => ((reads += 1), ran('')))

  const first = await editRow($, 'e1')

  for (const asked of [1, 2, 3, 3]) {
    expect(reads).toBe(asked)
    await clock.advance(2000)
  }

  expect((await first.find({ key: 'view' }))?.text).toBe('2 cambios · a.ts +3 −1 ? ▸')
})

test('the results the draws that came together ask for are read in one pass, those that came while one ran', async ($, on) => {
  const use = (id: string) => ({ type: 'tool_use', id, name: 'Edit', input: { file_path: '/repo/a.ts' } })
  const ids = ['e1', 'e2', 'e3']
  const passes: string[][] = []
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
  mock.env(on, { HOME: '/Users/me' })
  on('session.id', () => ({ value: 'abc' }))
  on('process.run', async (_, e) => {
    const wanted = JSON.parse(e.argv[2] ?? '[]') as string[]

    passes.push(wanted)

    // The first read is under way while the others ask.
    if (passes.length === 1) {
      await held
    }

    return ran(wanted.map(id => JSON.stringify({ id, output: EDIT })).join('\n'))
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

  expect(passes.length).toBeLessThan(ids.length)
  expect(passes.flat().sort()).toEqual(ids)
})

test('a diff too long for a drawing is cut at a line, its header counting the lines kept, without joining them anew for each', async ($, on) => {
  const lines = Array.from({ length: 40000 }, () => '+x')
  const long = {
    ...EDIT,
    structuredPatch: [{ oldStart: 0, oldLines: 0, newStart: 1, newLines: lines.length, lines }],
  }
  mock.clock(on)
  twoEdits(on)
  on('process.run', () => ran(''))

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

// Last: without jq the mod stays aside for the rest of the module's life.
test("without jq every row is the engine's, a line under the prompt says why and the button's dot is gray", async ($, on) => {
  const clock = mock.clock(on)
  const lines: (string | undefined)[] = []
  stage(on, false)
  engineRows(on)
  mock.store(on)
  on('session.cwd', () => ({ value: '/repo' }))
  on('ui.status', (_, e) => (lines.push(e.text), { value: undefined }))
  on('session.root', () => ({ value: '/repo' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('process.run', () => ran('', 1))

  const ui = await footer($)

  await clock.settle()
  // A start again finds no jq again, and says it no more.
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  expect(lines).toEqual([expect.stringContaining('jq')])
  expect((await ui.find({ type: 'Text', text: '○' }))?.props.color).toBe('inactive')
  expect((await (await editRow($, 'e1')).find({ type: 'Text' }))?.text).toBe('Edit(e1)')
})
