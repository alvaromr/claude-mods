import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

// The engine's line, and the mod's for the same run.
const LINE = 'Ran 1 shell command'
const OWN = '1 command'
type On = Parameters<TestBody>[1]

/** The engine's own count line, or its rows when told to unfold; and its footer. */
const engine = (on: On) => {
  on('ui.render', { component: 'ToolGroup' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>{e.props.isExpanded ? 'a row per call' : LINE}</Text>
  })
  on('ui.render', { component: 'SessionMode' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>footer</Text>
  })
}

const call = (tool_use_id: string, command: string, isErrored = false) => ({
  tool_use_id,
  tool: 'Bash',
  input: { command } as Record<string, unknown>,
  isRunning: false,
  isErrored,
  isInterrupted: false,
})

const footer = ($: Parameters<TestBody>[0], surface: 'terminal' | 'desktop' = 'terminal') =>
  $.ui.mount({ plugin: 'ui-declutter', surface, component: 'SessionMode', props: { modes: [] } })

/** The mod's pane, where the switch and the levels are. */
const pane = ($: Parameters<TestBody>[0]) =>
  $.ui.mount({
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

/** The level the pane shows picked: the one of its options with no button, a pill; undefined where the options are not drawn. */
const picked = async (ui: Awaited<ReturnType<typeof pane>>, key: 'diffs' | 'commands' | 'skills') => {
  const offered = (await ui.findAll({ type: 'Button' }))
    .map(button => button.key)
    .filter(found => found?.startsWith(`${key}-`))

  return offered.length === 0
    ? undefined
    : ['hidden', 'summary', 'full'].find(level => !offered.includes(`${key}-${level}`))
}

/** A level chosen in the pane, as the person picks it there. */
const choose = async ($: Parameters<TestBody>[0], key: 'diffs' | 'commands' | 'skills', value: string) => {
  const ui = await pane($)

  await ui.press({ key: `${key}-${value}` })
  await ui.unmount()
}

const group = (
  $: Parameters<TestBody>[0],
  calls: (ReturnType<typeof call> & { output?: unknown })[],
  options: { surface?: 'terminal' | 'desktop'; isExpanded?: boolean; columns?: number } = {},
) =>
  $.ui.mount({
    plugin: 'ui-declutter',
    surface: options.surface ?? 'terminal',
    component: 'ToolGroup',
    props: { calls, isActive: false, isExpanded: options.isExpanded ?? false },
    viewport: { columns: options.columns ?? 100, rows: 40 },
  })

test('an unfolded span draws each call at the moment its tool ran, the wait before it dotted', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  engine(on)
  on('session.cwd', () => ({ value: '/repo' }))
  on('classic.PostToolUse', () => ({}))
  on('tool.call', async (_, e) => {
    if (e.tool_use_id === 'quick') {
      await clock.advance(1000)
    } else {
      // 3 s waiting for approval, then 9 s of the tool itself.
      await clock.advance(12000)
      await $.classic.PostToolUse({
        tool_name: 'Bash',
        tool_input: { command: 'bun test' },
        tool_response: {},
        tool_use_id: e.tool_use_id,
        duration_ms: 9000,
      })
    }

    return { result: { stdout: '', stderr: '' } }
  })

  await $.tool.call({ tool: 'Bash', tool_use_id: 'quick', command: 'ls' })
  // The model writes the next call: no tool runs, and the span's time goes on.
  await clock.advance(5000)
  await $.tool.call({ tool: 'Bash', tool_use_id: 'slow', command: 'bun test' })

  const ui = await group($, [call('quick', 'ls'), call('slow', 'bun test')])

  // The line is the mod's, all one button: the 18 s from the first call to the last one's end.
  expect((await ui.find({ key: 'view' }))?.text).toBe('2 commands · 18.0s ▸')
  await ui.press({ key: 'view' })
  // Unfolded, the line is padded to the rows' width: the whole row is the button.
  expect((await ui.find({ key: 'view' }))?.text.trimEnd()).toBe('2 commands · 18.0s ▾')
  expect(await ui.find({ type: 'Text', text: /^1\.0s$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^9\.0s$/ })).toBeDefined()
  // On the 30-cell track 100 columns leave, 18 s long: the 9 s the tool ran
  // are its last 15 cells, and the 8 s since the first call ended, the model
  // writing this one and its approval, the 13 before them.
  expect(await ui.find({ type: 'Text', text: /^━{15}$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^┄{13}$/ })).toBeDefined()

  await ui.press({ key: 'view' })
  expect(await ui.find({ type: 'Text', text: /━/ })).toBeUndefined()
})

test('a refused call is struck through with its reason', async ($, on) => {
  mock.clock(on)
  engine(on)
  on('session.cwd', () => ({ value: '/repo' }))
  on('tool.call', () => ({ deny: 'use the trash' }))

  await $.tool.call({ tool: 'Bash', tool_use_id: 'rm', command: 'rm -rf dist' })

  const ui = await group($, [call('rm', 'rm -rf dist', true)])

  await ui.press({ key: 'view' })
  expect(await ui.find({ type: 'Text', text: /^denied$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'denied · use the trash' })).toBeDefined()
  expect((await ui.find({ type: 'Text', text: /^Bash$/ }))?.props.strikethrough).toBe(true)
})

test('each call says how it ended: how long it took, failed, stopped or still running', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  engine(on)
  on('session.cwd', () => ({ value: '/repo' }))
  on('classic.PostToolUseFailure', () => ({}))
  on('tool.call', async (_, e) => {
    await clock.advance(e.tool_use_id === 'long' ? 95_000 : 2000)

    return { result: { stdout: '', stderr: '' } }
  })

  for (const id of ['long', 'failed', 'stopped']) {
    await $.tool.call({ tool: 'Bash', tool_use_id: id, command: id })
  }

  // The tool's own time, where the engine tells it, is drawn in place of the call's.
  await $.classic.PostToolUseFailure({
    tool_name: 'Bash',
    tool_input: { command: 'failed' },
    tool_use_id: 'failed',
    error: 'exit 1',
    duration_ms: 500,
  })

  const ui = await group($, [
    call('long', 'long'),
    call('failed', 'failed', true),
    { ...call('stopped', 'stopped'), isInterrupted: true },
    { ...call('running', 'running'), isRunning: true },
  ])

  // From the first call to the one stopped: 95 s, 2 s and 2 s; the one running was never timed.
  expect((await ui.find({ key: 'view' }))?.text).toBe('4 commands · 1m 39s ▸')
  await ui.press({ key: 'view' })

  for (const status of ['1m 35s', '0.5s ✗', 'stopped', 'running']) {
    expect(await ui.find({ type: 'Text', text: status }), status).toBeDefined()
  }

  expect(await ui.find({ type: 'Text', text: /^denied/ })).toBeUndefined()
})

test('a call a rule refused, the person did not approve or auto mode denied is said so, with why', async ($, on) => {
  mock.clock(on)
  engine(on)
  on('session.cwd', () => ({ value: '/repo' }))
  on('classic.PermissionDenied', () => ({}))
  on('tool.check', (_, e) =>
    e.tool === 'Read' ? { decision: 'ask' as const } : { decision: 'deny' as const, rule: 'Bash(rm:*)' },
  )

  await $.tool.check({ tool: 'Bash', input: { command: 'rm -rf dist' }, tool_use_id: 'ruled' })
  await $.tool.check({ tool: 'Read', input: { file_path: '/repo/notes.md' }, tool_use_id: 'asked' })
  await $.classic.PermissionDenied({
    tool_name: 'Bash',
    tool_input: { command: 'curl example.com' },
    tool_use_id: 'classified',
    reason: 'not in auto mode',
  })

  const ui = await group(
    $,
    [
      call('ruled', 'rm -rf dist', true),
      { ...call('asked', '', true), tool: 'Read', input: { file_path: '/repo/notes.md' } },
      call('classified', 'curl example.com', true),
    ],
    { columns: 120 },
  )

  await ui.press({ key: 'view' })
  expect(await ui.findAll({ type: 'Text', text: /^denied$/ })).toHaveLength(3)

  for (const why of ['denied · Bash(rm:*)', 'denied · not approved', 'denied · not in auto mode']) {
    expect(await ui.find({ type: 'Text', text: why }), why).toBeDefined()
  }

  // A file is named by its name alone.
  expect(await ui.find({ type: 'Text', text: '⊘ notes.md' })).toBeDefined()
})

test("a span with nothing timed has its arrow alone; one the engine expanded, and every one off the terminal, is the engine's", async ($, on) => {
  mock.clock(on)
  engine(on)
  on('session.cwd', () => ({ value: '/repo' }))

  // A resumed session's old calls were never timed: no time, nor a bar unfolded.
  const old = await group($, [call('old', 'ls')])
  expect((await old.find({ key: 'view' }))?.text).toBe(`${OWN} ▸`)
  await old.press({ key: 'view' })
  expect(await old.find({ type: 'Text', text: /━/ })).toBeUndefined()

  const expanded = await group($, [call('expanded', 'ls')], { isExpanded: true })
  expect(await expanded.find({ type: 'Text', text: 'a row per call' })).toBeDefined()
  expect(await expanded.find({ key: 'view' })).toBeUndefined()

  const desktop = await group($, [call('desktop', 'ls')], { surface: 'desktop' })
  expect(await desktop.find({ type: 'Text', text: LINE })).toBeDefined()
  expect(await desktop.find({ key: 'view' })).toBeUndefined()
})

test('the pane sets the commands summary, full or hidden; a press on a call opens its result alone', async ($, on) => {
  engine(on)
  on('session.cwd', () => ({ value: '/repo' }))
  on('session.messages', () => ({
    value: [
      { role: 'user' as const, content: [{ type: 'text', text: 'mira' }] },
      { role: 'assistant' as const, content: [{ type: 'tool_use', id: 'ls', name: 'Bash', input: { command: 'ls' } }] },
      { role: 'user' as const, content: [{ type: 'tool_result', tool_use_id: 'ls', content: 'a.ts\nb.ts' }] },
    ],
  }))

  const run = await group($, [call('ls', 'ls')])
  const level = async () => {
    const settings = await pane($)
    const now = await picked(settings, 'commands')

    await settings.unmount()

    return now
  }

  expect(await level()).toBe('summary')
  expect((await run.find({ key: 'view' }))?.text).toBe(`${OWN} ▸`)

  // Unfolded, a call pressed opens its result beneath it; pressed again, it closes.
  await run.press({ key: 'view' })
  await run.press({ key: 'call-0' })
  expect(await run.find({ type: 'Text', text: 'a.ts' })).toBeDefined()
  await run.press({ key: 'call-0' })
  expect(await run.find({ type: 'Text', text: 'a.ts' })).toBeUndefined()

  // Normal: the run as the engine draws it, folded into its own line.
  await choose($, 'commands', 'full')
  expect(await level()).toBe('full')
  expect((await run.find({ type: 'Text' }))?.text).toBe(LINE)

  await choose($, 'commands', 'hidden')
  expect(await level()).toBe('hidden')
  expect(await run.find({ type: 'Text' })).toBeUndefined()
})

// A span of a read, an edit and a command, then text and another command.
const conversation = (on: On) => {
  const use = (id: string, name: string, input: object) => ({ type: 'tool_use', id, name, input })
  const answer = (id: string) => ({
    role: 'user' as const,
    content: [{ type: 'tool_result', tool_use_id: id, content: 'ok' }],
  })

  engine(on)
  on('ui.render', { component: 'ToolUse' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>{`${e.props.tool}(${e.props.tool_use_id})`}</Text>
  })
  on('session.cwd', () => ({ value: '/repo' }))
  on('session.messages', () => ({
    value: [
      { role: 'user' as const, content: [{ type: 'text', text: 'arréglalo' }] },
      { role: 'assistant' as const, content: [use('r1', 'Read', { file_path: '/repo/a.ts' })] },
      answer('r1'),
      { role: 'assistant' as const, content: [use('e1', 'Edit', { file_path: '/repo/a.ts' })] },
      answer('e1'),
      { role: 'assistant' as const, content: [use('b1', 'Bash', { command: 'pnpm test' })] },
      answer('b1'),
      // Text ends the span: this one is not in it.
      { role: 'assistant' as const, content: [{ type: 'text', text: 'Hecho.' }, use('b2', 'Bash', { command: 'ls' })] },
      answer('b2'),
    ],
  }))
}

const edit = ($: Parameters<TestBody>[0]) =>
  $.ui.mount({
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
      output: { structuredPatch: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 2, lines: ['-a', '+b', '+c'] }] },
    },
  })

const run = ($: Parameters<TestBody>[0], id: string, tool: string) => group($, [{ ...call(id, ''), tool }])

test('a span is one line its first row draws; pressed, its calls and its files; a file pressed, its diff', async ($, on) => {
  conversation(on)

  // The edit's row keeps its diff, and draws nothing: the span draws where it starts.
  expect(await (await edit($)).find({ type: 'Text' })).toBeUndefined()

  const first = await run($, 'r1', 'Read')

  expect((await first.find({ key: 'view' }))?.text).toBe('Read 1 file, 1 command · 1 cambio · a.ts +2 −1 ▸')
  expect(await (await run($, 'b1', 'Bash')).find({ type: 'Text' })).toBeUndefined()
  expect((await (await run($, 'b2', 'Bash')).find({ key: 'view' }))?.text).toBe(`${OWN} ▸`)

  await first.press({ key: 'view' })
  expect(await first.find({ type: 'Text', text: 'pnpm test' })).toBeDefined()
  // In the order they ran: the read, the edit, the command.
  expect((await first.findAll({ type: 'Button' })).map(button => button.key)).toEqual([
    'view',
    'call-0',
    'file-e1-0',
    'call-1',
  ])
  expect((await first.find({ key: 'file-e1-0' }))?.text).toBe('± a.ts ▸ +2 −1')
  expect(await first.find({ type: 'Code' })).toBeUndefined()

  await first.press({ key: 'file-e1-0' })
  expect((await first.find({ type: 'Code' }))?.props.source).toBe('@@ -1,1 +1,2 @@\n-a\n+b\n+c\n')

  await first.press({ key: 'call-1' })
  expect(await first.find({ type: 'Text', text: 'ok' })).toBeDefined()

  await first.press({ key: 'view' })
  expect(await first.find({ type: 'Code' })).toBeUndefined()
})

test('edits of one file one after another are one row; another row between them starts a new one', async ($, on) => {
  span(on, [
    { id: 'e1', name: 'Edit', input: { file_path: '/repo/a.ts' }, content: 'ok' },
    { id: 'e2', name: 'Edit', input: { file_path: '/repo/a.ts' }, content: 'ok' },
    { id: 'e3', name: 'Edit', input: { file_path: '/repo/b.ts' }, content: 'ok' },
    { id: 'b1', name: 'Bash', input: { command: 'pnpm test' }, content: 'ok' },
    { id: 'e4', name: 'Edit', input: { file_path: '/repo/a.ts' }, content: 'ok' },
  ])

  const first = await alone($, 'e1', 'Edit')

  await first.press({ key: 'view' })
  expect((await first.findAll({ type: 'Button' })).map(button => button.key)).toEqual([
    'view',
    'file-e1-0',
    'file-e3-0',
    'call-0',
    'file-e4-0',
  ])
})

test("a timed edit draws its bar on the group's clock, and its time where a call's is", async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  engine(on)
  on('session.cwd', () => ({ value: '/repo' }))
  on('tool.call', async () => {
    await clock.advance(2000)

    return { result: {} }
  })

  await $.tool.call({ tool: 'Bash', tool_use_id: 'b', command: 'pnpm test' })
  await $.tool.call({ tool: 'Edit', tool_use_id: 'e', file_path: '/repo/a.ts', old_string: 'a', new_string: 'b' })

  const patch = { structuredPatch: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: ['-a', '+b'] }] }
  const ui = await group($, [
    call('b', 'pnpm test'),
    { ...call('e', ''), tool: 'Edit', input: { file_path: '/repo/a.ts' }, output: patch },
  ])

  await ui.press({ key: 'view' })

  const row = (await ui.find({ key: 'file-e-0' }))?.text ?? ''

  // The command ran the first half of the clock, the edit the second.
  expect(row).toMatch(/^± a\.ts ▸ \+1 −1 +─+━+ +2\.0s$/)
  expect(row.indexOf('━')).toBeGreaterThan((await ui.find({ key: 'call-0' }))?.text.indexOf('━') ?? Infinity)

  // Two edits of the file one after another are one row, ×2.
  await $.tool.call({ tool: 'Edit', tool_use_id: 'e2', file_path: '/repo/a.ts', old_string: 'b', new_string: 'c' })

  const twice = await group($, [
    call('b', 'pnpm test'),
    { ...call('e', ''), tool: 'Edit', input: { file_path: '/repo/a.ts' }, output: patch },
    { ...call('e2', ''), tool: 'Edit', input: { file_path: '/repo/a.ts' }, output: patch },
  ])

  // Its span starts at the command, already unfolded.
  expect((await twice.find({ key: 'file-e-0' }))?.text).toMatch(/^± a\.ts ×2 ▸ \+2 −2 +─*━+ +4\.0s$/)

  // An edit alone in its span has nothing to set its bar against.
  const lone = await group($, [{ ...call('e', ''), tool: 'Edit', input: { file_path: '/repo/a.ts' }, output: patch }])

  await lone.press({ key: 'view' })
  expect((await lone.find({ key: 'file-e-0' }))?.text).toBe('± a.ts ▸ +1 −1')
})

test("calls alike one after another are one row, ×n, their times summed; pressed, each one's result", async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  engine(on)
  on('session.cwd', () => ({ value: '/repo' }))
  on('tool.call', async () => {
    await clock.advance(1000)

    return { result: {} }
  })

  await $.tool.call({ tool: 'Bash', tool_use_id: 'a1', command: 'ls' })
  await $.tool.call({ tool: 'Bash', tool_use_id: 'a2', command: 'ls' })
  await $.tool.call({ tool: 'Bash', tool_use_id: 'b', command: 'pwd' })
  await $.tool.call({ tool: 'Bash', tool_use_id: 'a3', command: 'ls' })

  const ui = await group($, [call('a1', 'ls'), call('a2', 'ls'), call('b', 'pwd'), call('a3', 'ls')])

  await ui.press({ key: 'view' })
  // Another call between them starts a new row.
  expect((await ui.findAll({ type: 'Button' })).map(button => button.key)).toEqual([
    'view',
    'call-0',
    'call-2',
    'call-3',
  ])
  expect((await ui.find({ key: 'call-0' }))?.text).toMatch(/^\$ Bash ls ×2 +─*━+─* +2\.0s$/)
  expect((await ui.find({ key: 'call-3' }))?.text).toMatch(/^\$ Bash ls +─*━+ +1\.0s$/)

  await ui.press({ key: 'call-0' })
  expect(await ui.findAll({ type: 'Text', text: '(No output)' })).toHaveLength(2)
})

test('a tall diff, and a tall span, end with a button that folds them, for when their line is out of sight', async ($, on) => {
  engine(on)
  on('session.cwd', () => ({ value: '/repo' }))

  const lines = Array.from({ length: 20 }, (_, i) => `+line ${i}`)

  await $.ui.mount({
    plugin: 'ui-declutter',
    surface: 'terminal',
    component: 'ToolResult',
    props: {
      tool_use_id: 'big',
      tool: 'Edit',
      output: { structuredPatch: [{ oldStart: 1, oldLines: 0, newStart: 1, newLines: 20, lines }] },
      isErrored: false,
    },
  })

  const ui = await group($, [{ ...call('big', ''), tool: 'Edit', input: { file_path: '/repo/big.ts' } }])

  await ui.press({ key: 'view' })
  expect(await ui.find({ key: 'fold' })).toBeUndefined()

  await ui.press({ key: 'file-big-0' })
  expect((await ui.find({ key: 'fold-file-big-0' }))?.props.label).toBe('▴ big.ts')
  expect((await ui.find({ key: 'fold' }))?.props.label).toBe('▴ plegar')

  // The diff's folds the diff alone; the span's, the span.
  await ui.press({ key: 'fold-file-big-0' })
  expect(await ui.find({ type: 'Code' })).toBeUndefined()
  expect(await ui.find({ key: 'file-big-0' })).toBeDefined()

  await ui.press({ key: 'file-big-0' })
  await ui.press({ key: 'fold' })
  expect(await ui.find({ key: 'file-big-0' })).toBeUndefined()
})

test("a kind hidden leaves its span's line, one full is the engine's; both hidden, the span is nowhere", async ($, on) => {
  conversation(on)
  await edit($)

  // Commands hidden: the span is its edits, drawn where they start.
  await choose($, 'commands', 'hidden')
  expect(await (await run($, 'r1', 'Read')).find({ type: 'Text' })).toBeUndefined()
  expect((await (await edit($)).find({ key: 'view' }))?.text).toBe('1 cambio · a.ts +2 −1 ▸')

  // The diffs full too: the edit is the engine's row, and nothing else is drawn.
  await choose($, 'diffs', 'full')
  expect((await (await edit($)).find({ type: 'Text' }))?.text).toBe('Edit(e1)')
  expect(await (await run($, 'b1', 'Bash')).find({ type: 'Text' })).toBeUndefined()

  // Commands back in summary: the span is its calls alone.
  await choose($, 'commands', 'summary')
  expect((await (await run($, 'r1', 'Read')).find({ key: 'view' }))?.text).toBe('Read 1 file, 1 command ▸')

  // Both hidden: nothing anywhere.
  await choose($, 'diffs', 'hidden')
  await choose($, 'commands', 'hidden')
  expect(await (await run($, 'r1', 'Read')).find({ type: 'Text' })).toBeUndefined()
  expect(await (await edit($)).find({ type: 'Text' })).toBeUndefined()
})

test("a command the engine draws alone is in its span; a row of a run the engine unfolded is the engine's", async ($, on) => {
  conversation(on)

  const alone = (id: string) =>
    $.ui.mount({
      plugin: 'ui-declutter',
      surface: 'terminal',
      component: 'ToolUse',
      props: {
        tool_use_id: id,
        tool: 'Bash',
        input: { command: 'ls' },
        isRunning: false,
        isErrored: false,
        isInterrupted: false,
      },
    })

  // b2 is a span of its own, after the text: its row draws its line.
  expect((await (await alone('b2')).find({ key: 'view' }))?.text).toBe(`${OWN} ▸`)
  // b1 is in r1's span, which r1's run draws.
  expect(await (await alone('b1')).find({ type: 'Text' })).toBeUndefined()

  await group($, [call('x1', 'ls')], { isExpanded: true })
  expect((await (await alone('x1')).find({ type: 'Text' }))?.text).toBe('Bash(x1)')
})

test("skills join their span's line by their own level: grouped, hidden, or the engine's rows", async ($, on) => {
  span(on, [
    { id: 'r1', name: 'Read', input: { file_path: '/repo/a.ts' }, content: 'a' },
    { id: 's1', name: 'Skill', input: { skill: 'plugin-authoring' }, content: 'Launching skill: plugin-authoring' },
  ])

  const first = () => alone($, 'r1', 'Read')
  const skill = () => alone($, 's1', 'Skill')

  expect((await (await first()).find({ key: 'view' }))?.text).toBe('Read 1 file, 1 skill ▸')
  expect(await (await skill()).find({ type: 'Text' })).toBeUndefined()

  await choose($, 'skills', 'hidden')
  expect((await (await first()).find({ key: 'view' }))?.text).toBe('Read 1 file ▸')
  expect(await (await skill()).find({ type: 'Text' })).toBeUndefined()

  await choose($, 'skills', 'full')
  expect((await (await first()).find({ key: 'view' }))?.text).toBe('Read 1 file ▸')
  expect((await (await skill()).find({ type: 'Text' }))?.text).toBe('Skill(s1)')

  // A run of nothing but skills, all normal: the engine's own line.
  expect((await (await group($, [{ ...call('s1', ''), tool: 'Skill' }])).find({ type: 'Text' }))?.text).toBe(LINE)
})

test('a run unfolded for its edits full keeps its commands in summary: each row by its own level', async ($, on) => {
  conversation(on)
  await choose($, 'diffs', 'full')

  const span = [
    { ...call('r1', ''), tool: 'Read', input: { file_path: '/repo/a.ts' } },
    { ...call('e1', ''), tool: 'Edit', input: { file_path: '/repo/a.ts' } },
    call('b1', 'pnpm test'),
  ]
  // The engine draws a run's rows with `isExpanded` set, the one the mod unfolded too.
  const row = (index: number) => {
    const item = span[index]

    if (item === undefined) {
      throw new Error(`No call at ${index}`)
    }

    return $.ui.mount({
      plugin: 'ui-declutter',
      surface: 'terminal',
      component: 'ToolUse',
      props: { ...item, isExpanded: true },
    })
  }

  expect((await (await group($, span)).find({ type: 'Text' }))?.text).toBe('a row per call')
  expect((await (await row(0)).find({ key: 'view' }))?.text).toBe('Read 1 file, 1 command ▸')
  expect((await (await row(1)).find({ type: 'Text' }))?.text).toBe('Edit(e1)')
  expect(await (await row(2)).find({ type: 'Text' })).toBeUndefined()
})

test("edits the engine folds into a run of its own are a span's edits", async ($, on) => {
  engine(on)
  on('session.cwd', () => ({ value: '/tmp' }))

  // Their results, drawn beneath the run, keep their diffs.
  for (const id of ['s1', 's2']) {
    await $.ui.mount({
      plugin: 'ui-declutter',
      surface: 'terminal',
      component: 'ToolResult',
      props: {
        tool_use_id: id,
        tool: 'Edit',
        output: { structuredPatch: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: ['-a', '+b'] }] },
        isErrored: false,
      },
    })
  }

  const edits = await group($, [
    { ...call('s1', ''), tool: 'Edit', input: { file_path: '/tmp/notes.md' } },
    { ...call('s2', ''), tool: 'Edit', input: { file_path: '/tmp/plan.md' } },
  ])

  expect((await edits.find({ key: 'view' }))?.text).toBe('2 cambios · 2 ficheros +2 −2 ▸')
})

// A conversation of one span, each call answered with its result's content.
const span = (on: On, calls: { id: string; name: string; input: object; content: unknown; isError?: boolean }[]) => {
  engine(on)
  on('ui.render', { component: 'ToolUse' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>{`${e.props.tool}(${e.props.tool_use_id})`}</Text>
  })
  on('session.cwd', () => ({ value: '/repo' }))
  on('session.messages', () => ({
    value: [
      { role: 'user' as const, content: [{ type: 'text', text: 'mira' }] },
      ...calls.flatMap(({ id, name, input, content, isError = false }) => [
        { role: 'assistant' as const, content: [{ type: 'tool_use', id, name, input }] },
        { role: 'user' as const, content: [{ type: 'tool_result', tool_use_id: id, content, is_error: isError }] },
      ]),
    ],
  }))
}

const alone = ($: Parameters<TestBody>[0], id: string, tool: string, output?: unknown) =>
  $.ui.mount({
    plugin: 'ui-declutter',
    surface: 'terminal',
    component: 'ToolUse',
    props: { tool_use_id: id, tool, input: {}, isRunning: false, isErrored: false, isInterrupted: false, output },
  })

test('a read of an image or a PDF says what it took in', async ($, on) => {
  span(on, [
    { id: 'png', name: 'Read', input: { file_path: '/repo/shot.png' }, content: [{ type: 'image', source: {} }] },
    {
      id: 'pdf',
      name: 'Read',
      input: { file_path: '/repo/doc.pdf' },
      content: [
        { type: 'document', source: {} },
        { type: 'text', text: 'PDF' },
      ],
    },
    { id: 'txt', name: 'Read', input: { file_path: '/repo/one.txt' }, content: 'one' },
  ])

  const ui = await group($, [
    {
      ...call('png', ''),
      tool: 'Read',
      input: { file_path: '/repo/shot.png' },
      output: {
        type: 'image',
        file: { originalSize: 31773, dimensions: { originalWidth: 1080, originalHeight: 2408 } },
      },
    },
    { ...call('pdf', ''), tool: 'Read', input: { file_path: '/repo/doc.pdf' } },
    { ...call('txt', ''), tool: 'Read', input: { file_path: '/repo/one.txt' } },
  ])

  await ui.press({ key: 'view' })

  for (const [at, said] of ['Read image · 1080×2408 · 31 KB', 'Read PDF', 'Read 1 line'].entries()) {
    await ui.press({ key: `call-${at}` })
    expect(await ui.find({ type: 'Text', text: said }), said).toBeDefined()
  }
})

test('an edit that failed changed nothing: counted apart, and unfolded, its file with why', async ($, on) => {
  span(on, [
    { id: 'ok', name: 'Edit', input: { file_path: '/repo/a.ts' }, content: 'ok' },
    {
      id: 'no',
      name: 'Edit',
      input: { file_path: '/repo/b.ts' },
      content: "The user doesn't want to proceed with this tool use. The tool use was rejected.",
      isError: true,
    },
    {
      id: 'gone',
      name: 'Edit',
      input: { file_path: '/repo/c.ts' },
      content: '<tool_use_error>String to replace not found in file.</tool_use_error>',
      isError: true,
    },
  ])
  await alone($, 'ok', 'Edit', {
    structuredPatch: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 2, lines: ['-a', '+b', '+c'] }],
  })

  const ui = await alone($, 'ok', 'Edit')

  expect((await ui.find({ key: 'view' }))?.text).toBe('1 cambio · a.ts +2 −1 · 2 fallidos ▸')
  await ui.press({ key: 'view' })
  expect(await ui.find({ type: 'Text', text: '✗ b.ts' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'rechazado' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'texto no encontrado' })).toBeDefined()
})

test("the files a command changed are its span's edits, short of the commands full", async ($, on) => {
  span(on, [{ id: 'uv', name: 'Bash', input: { command: 'uv add httpx' }, content: 'ok' }])

  const changed = {
    stdout: 'ok',
    bashEditDiff: {
      files: [
        {
          filePath: '/repo/pyproject.toml',
          hunks: [{ oldStart: 3, oldLines: 0, newStart: 3, newLines: 1, lines: ['+  "httpx",'] }],
        },
      ],
    },
  }
  const ui = await group($, [{ ...call('uv', 'uv add httpx'), output: changed }])

  expect((await ui.find({ key: 'view' }))?.text).toBe('1 command · 1 cambio · pyproject.toml +1 −0 ▸')
  await ui.press({ key: 'view' })
  await ui.press({ key: 'file-uv-0' })
  expect((await ui.find({ type: 'Code' }))?.props.source).toBe('@@ -3,0 +3,1 @@\n+  "httpx",\n')

  // The commands hidden: the span is the files the command changed.
  await choose($, 'commands', 'hidden')
  expect((await ui.find({ key: 'view' }))?.text).toBe('1 cambio · pyproject.toml +1 −0 ▾')
})

test("the browser, the web, a tool search and an MCP call are a span's calls; one that asks ends it", async ($, on) => {
  span(on, [
    {
      id: 'c1',
      name: 'mcp__claude-in-chrome__computer',
      input: { action: 'screenshot' },
      content: [{ type: 'image', source: {} }],
    },
    { id: 'w1', name: 'WebSearch', input: { query: 'ink borders' }, content: 'results' },
    {
      id: 't1',
      name: 'ToolSearch',
      input: { query: 'select:WebFetch' },
      content: [{ type: 'tool_reference', tool_name: 'WebFetch' }],
    },
    { id: 'j1', name: 'mcp__Atlassian__getJiraIssue', input: { issueKey: 'ABC-1' }, content: 'issue' },
    { id: 'q1', name: 'AskUserQuestion', input: {}, content: 'yes' },
    { id: 'w2', name: 'WebFetch', input: { url: 'https://example.com' }, content: 'page' },
  ])

  const first = await alone($, 'c1', 'mcp__claude-in-chrome__computer')

  expect((await first.find({ key: 'view' }))?.text).toBe('1 browser action, 1 web lookup, 1 tool search, 1 MCP call ▸')
  expect(await (await alone($, 'w1', 'WebSearch')).find({ type: 'Text' })).toBeUndefined()
  expect((await (await alone($, 'q1', 'AskUserQuestion')).find({ type: 'Text' }))?.text).toBe('AskUserQuestion(q1)')
  expect((await (await alone($, 'w2', 'WebFetch')).find({ key: 'view' }))?.text).toBe('1 web lookup ▸')

  await first.press({ key: 'view' })
  await first.press({ key: 'call-0' })
  await first.press({ key: 'call-2' })
  expect(await first.find({ type: 'Text', text: '(image)' })).toBeDefined()
  expect(await first.find({ type: 'Text', text: 'WebFetch' })).toBeDefined()
})

test('a web-fetch agent is a web lookup of its span, its result in it; another agent ends the span', async ($, on) => {
  const fetch = { subagent_type: 'web-fetch', prompt: 'Read https://example.com' }

  span(on, [
    { id: 'w1', name: 'WebSearch', input: { query: 'connectors' }, content: 'results' },
    { id: 'a1', name: 'Agent', input: fetch, content: 'page' },
    { id: 'a2', name: 'Agent', input: { subagent_type: 'Explore', prompt: 'find' }, content: 'found' },
  ])

  const first = await alone($, 'w1', 'WebSearch')
  const props = { tool: 'Agent', isRunning: false, isErrored: false, isInterrupted: false }
  const agent = (id: string, input: object) =>
    $.ui.mount({
      plugin: 'ui-declutter',
      surface: 'terminal',
      component: 'ToolUse',
      props: { ...props, tool_use_id: id, input },
    })

  expect((await first.find({ key: 'view' }))?.text).toBe('2 web lookups ▸')
  expect(await (await agent('a1', fetch)).find({ type: 'Text' })).toBeUndefined()
  expect((await (await agent('a2', { subagent_type: 'Explore' })).find({ type: 'Text' }))?.text).toBe('Agent(a2)')

  const result = await $.ui.mount({
    plugin: 'ui-declutter',
    surface: 'terminal',
    component: 'ToolResult',
    props: { tool_use_id: 'a1', tool: 'Agent', output: 'page', isErrored: false },
  })

  expect(await result.find({ type: 'Text' })).toBeUndefined()
})

test("a task stopped and a notice that a task ended are a span's calls; a notice still running is the engine's", async ($, on) => {
  const notice = (task: string, status: string) =>
    `<system-reminder>\n<task-notification>\n<task-id>${task}</task-id>\n<status>${status}</status>\n` +
    `<summary>Background command "gate" ${status}</summary>\n</task-notification>\n</system-reminder>`

  engine(on)
  on('ui.render', { component: 'UserMessage' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>{e.props.text}</Text>
  })
  on('session.cwd', () => ({ value: '/repo' }))
  on('session.messages', () => ({
    value: [
      { role: 'user' as const, content: [{ type: 'text', text: 'para' }] },
      { role: 'user' as const, content: [{ type: 'text', text: notice('b1', 'failed') }] },
      {
        role: 'assistant' as const,
        content: [{ type: 'tool_use', id: 's1', name: 'TaskStop', input: { task_id: 'b2' } }],
      },
      { role: 'user' as const, content: [{ type: 'tool_result', tool_use_id: 's1', content: 'stopped' }] },
      { role: 'assistant' as const, content: [{ type: 'tool_use', id: 'ls', name: 'Bash', input: { command: 'ls' } }] },
      { role: 'user' as const, content: [{ type: 'tool_result', tool_use_id: 'ls', content: 'a.ts' }] },
    ],
  }))

  const row = (task: string, status: string) =>
    $.ui.mount({
      plugin: 'ui-declutter',
      surface: 'terminal',
      component: 'UserMessage',
      props: {
        text: `Background command "gate" ${status}`,
        origin: { kind: 'task-notification' },
        isExpanded: false,
        task: { id: task, status },
      },
    })
  const first = await row('b1', 'failed')

  expect((await first.find({ key: 'view' }))?.text).toBe('1 command, stopped 1 task, 1 notification ▸')
  await first.press({ key: 'view' })
  expect((await first.find({ key: 'call-0' }))?.text).toMatch(/^N Notification Background command .* ✗$/)
  expect(await (await alone($, 's1', 'TaskStop')).find({ type: 'Text' })).toBeUndefined()
  expect((await (await row('b3', 'running')).find({ type: 'Text' }))?.text).toBe('Background command "gate" running')
})

test("a look at tasks, a monitor, the agents' list and a wakeup are a span's calls; a scheduled task ends it", async ($, on) => {
  span(on, [
    { id: 'o1', name: 'TaskOutput', input: { task_id: 'b1' }, content: 'done' },
    { id: 'l1', name: 'CronList', input: {}, content: 'none' },
    { id: 'm1', name: 'Monitor', input: { description: 'deploy' }, content: 'watching' },
    { id: 'a1', name: 'ListAgents', input: {}, content: 'none' },
    { id: 'z1', name: 'ScheduleWakeup', input: { reason: 'CI' }, content: 'scheduled' },
    { id: 'c1', name: 'CronCreate', input: { cron: '0 9 * * *' }, content: 'created' },
  ])

  const first = await alone($, 'o1', 'TaskOutput')

  expect((await first.find({ key: 'view' }))?.text).toBe('Checked 2 tasks, 1 monitor, 1 agent list, 1 wakeup ▸')
  expect(await (await alone($, 'z1', 'ScheduleWakeup')).find({ type: 'Text' })).toBeUndefined()
  expect((await (await alone($, 'c1', 'CronCreate')).find({ type: 'Text' }))?.text).toBe('CronCreate(c1)')
})

test('marked in the pane, a grouped span starts unfolded and a press on its line folds it', async ($, on) => {
  span(on, [{ id: 'ls', name: 'Bash', input: { command: 'ls' }, content: 'a.ts' }])

  const settings = await pane($)

  await settings.press({ key: 'startsOpen' })
  await settings.unmount()

  const ui = await group($, [call('ls', 'ls')])

  // Unfolded, the line spans its rows' width.
  expect((await ui.find({ key: 'view' }))?.text.trimEnd()).toBe(`${OWN} ▾`)
  expect(await ui.find({ key: 'call-0' })).toBeDefined()

  await ui.press({ key: 'view' })
  expect((await ui.find({ key: 'view' }))?.text).toBe(`${OWN} ▸`)
  expect(await ui.find({ key: 'call-0' })).toBeUndefined()

  // Unmarked again, every span starts folded, the one pressed folded too.
  const again = await pane($)

  await again.press({ key: 'startsOpen' })
  await again.unmount()
  expect((await ui.find({ key: 'view' }))?.text).toBe(`${OWN} ▸`)

  // Marked again, every span starts unfolded, the one pressed before too.
  const once = await pane($)

  await once.press({ key: 'startsOpen' })
  await once.unmount()
  expect((await ui.find({ key: 'view' }))?.text.trimEnd()).toBe(`${OWN} ▾`)

  // Settings applied start every span as they say: a press that turned one is forgotten, resetting included.
  await ui.press({ key: 'view' })
  expect((await ui.find({ key: 'view' }))?.text).toBe(`${OWN} ▸`)

  const reset = await pane($)

  await reset.press({ key: 'reset' })
  await reset.unmount()
  expect((await ui.find({ key: 'view' }))?.text).toBe(`${OWN} ▸`)
})

test('a change holds for the session; saved for the project, the next one starts with it, before the global ones', async ($, on) => {
  engine(on)
  mock.store(on, { settings: { commands: 'full' } })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.root', () => ({ value: '/repo' }))

  const start = () => $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const settings = await pane($)
  const source = async () => (await settings.find({ type: 'Text', text: /^Ajustes/ }))?.text

  // The global ones, saved before.
  await start()
  expect(await source()).toBe('Ajustes globales')
  expect(await picked(settings, 'commands')).toBe('full')

  // Unsaved, a change is gone the next session.
  await settings.press({ key: 'commands-hidden' })
  expect(await source()).toBe('Ajustes globales · cambios sin guardar')
  await start()
  expect(await picked(settings, 'commands')).toBe('full')

  // Saved for the project, it wins over the global ones; forgotten, they are back.
  await settings.press({ key: 'commands-hidden' })
  await settings.press({ key: 'save-project' })
  await start()
  expect(await source()).toBe('Ajustes de este proyecto')
  expect(await picked(settings, 'commands')).toBe('hidden')
  await settings.press({ key: 'forget-project' })
  expect(await picked(settings, 'commands')).toBe('full')
  await settings.unmount()
})

test('a long result opens at its head; asked, all of it, ending with a button that closes it', async ($, on) => {
  const lines = Array.from({ length: 30 }, (_, i) => `line ${i}`)
  span(on, [{ id: 'log', name: 'Bash', input: { command: 'cat log' }, content: lines.join('\n') }])

  const ui = await group($, [call('log', 'cat log')])

  await ui.press({ key: 'view' })
  await ui.press({ key: 'call-0' })
  expect(await ui.find({ type: 'Text', text: 'line 9' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'line 10' })).toBeUndefined()
  expect((await ui.find({ key: 'more-0' }))?.props.label).toBe('… +20 lines')

  await ui.press({ key: 'more-0' })
  expect(await ui.find({ type: 'Text', text: 'line 29' })).toBeDefined()
  expect(await ui.find({ key: 'more-0' })).toBeUndefined()
  expect((await ui.find({ key: 'fold-call-0' }))?.props.label).toBe('▴ Bash cat log')

  // Closed from beneath; opened again, at its head.
  await ui.press({ key: 'fold-call-0' })
  expect(await ui.find({ type: 'Text', text: 'line 0' })).toBeUndefined()
  await ui.press({ key: 'call-0' })
  expect(await ui.find({ type: 'Text', text: 'line 29' })).toBeUndefined()
})

test("off, every row is the engine's, the footer's button's dot is gray and the pane holds the switch alone", async ($, on) => {
  conversation(on)

  const bar = await footer($)
  const settings = await pane($)
  const dot = async (glyph: string) => (await bar.find({ type: 'Text', text: glyph }))?.props.color

  expect(await dot('●')).toBe('success')
  await settings.press({ key: 'switch' })
  expect(await dot('○')).toBe('inactive')
  expect(await picked(settings, 'diffs')).toBeUndefined()
  expect((await (await run($, 'r1', 'Read')).find({ type: 'Text' }))?.text).toBe(LINE)
  expect((await (await edit($)).find({ type: 'Text' }))?.text).toBe('Edit(e1)')

  await settings.press({ key: 'switch' })
  expect(await dot('●')).toBe('success')
  expect(await picked(settings, 'commands')).toBe('summary')
})

// The messages of a conversation, as the model reads them.
const said = (text: string) => ({ role: 'user' as const, content: [{ type: 'text', text }] })
const asked = (id: string, name = 'Bash', input: object = { command: id }) => ({
  role: 'assistant' as const,
  content: [{ type: 'tool_use', id, name, input }],
})
const answered = (id: string, content: unknown = 'ok', ...beside: { type: string; text: string }[]) => ({
  role: 'user' as const,
  content: [{ type: 'tool_result', tool_use_id: id, content }, ...beside],
})
// A notice that a task ended, as the engine frames it for the model.
const reminder = (task: string, summary = `Background command "${task}" completed`) =>
  `<system-reminder>\n<task-notification>\n<task-id>${task}</task-id>\n<status>completed</status>\n` +
  `<summary>${summary}</summary>\n</task-notification>\n</system-reminder>`

/** The engine beneath: a notice's row as its text, a call's row as its name and id, a result as its id. */
const noticeEngine = (on: On) => {
  engine(on)
  on('ui.render', { component: 'UserMessage' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>{e.props.text}</Text>
  })
  on('ui.render', { component: 'ToolUse' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>{`${e.props.tool}(${e.props.tool_use_id})`}</Text>
  })
  on('ui.render', { component: 'ToolResult' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>{`result(${e.props.tool_use_id})`}</Text>
  })
  on('session.cwd', () => ({ value: '/repo' }))
}

const noticeRow = ($: Parameters<TestBody>[0], task: string, text = `Background command "${task}" completed`) =>
  $.ui.mount({
    plugin: 'ui-declutter',
    surface: 'terminal',
    component: 'UserMessage',
    props: { text, origin: { kind: 'task-notification' }, isExpanded: false, task: { id: task, status: 'completed' } },
  })

const lineOf = async (ui: Awaited<ReturnType<typeof alone> | ReturnType<typeof group>>) =>
  (await ui.find({ key: 'view' }))?.text

test('a prompt that quotes a notice is no notice, and a prompt beside a call result ends the span as well', async ($, on) => {
  noticeEngine(on)
  on('session.messages', () => ({
    value: [
      said('mira'),
      asked('b1'),
      answered('b1'),
      // Typed, outside the engine's framing: a prompt, which ends the span.
      said('<task-notification><task-id>t1</task-id><status>completed</status></task-notification>'),
      asked('b2'),
      // A prompt typed while the call ran comes in the same message as its result.
      answered('b2', 'ok', { type: 'text', text: 'ahora otra cosa' }),
      asked('b3'),
      answered('b3'),
    ],
  }))

  for (const id of ['b1', 'b2', 'b3']) {
    expect(await lineOf(await alone($, id, 'Bash')), id).toBe(`${OWN} ▸`)
  }
})

test("a task that notifies more than once leaves its notices to the engine, the ones of other tasks are the span's", async ($, on) => {
  noticeEngine(on)
  on('session.messages', () => ({
    value: [
      said('mira'),
      asked('b1'),
      answered('b1'),
      said(reminder('t1', 'first')),
      asked('b2'),
      answered('b2'),
      said(reminder('t1', 'second')),
      said(reminder('t2')),
    ],
  }))

  expect(await lineOf(await alone($, 'b1', 'Bash'))).toBe('2 commands, 1 notification ▸')
  expect((await (await noticeRow($, 't1', 'second')).find({ type: 'Text' }))?.text).toBe('second')
  expect(await (await noticeRow($, 't2')).find({ type: 'Text' })).toBeUndefined()
})

test("a notice that arrives is in the rows before it, and its own row is the span's once the conversation holds it", async ($, on) => {
  noticeEngine(on)

  const messages = [said('mira'), asked('b1'), answered('b1')]

  on('session.messages', () => ({ value: [...messages] }))

  const first = await alone($, 'b1', 'Bash')
  const row = await noticeRow($, 't1')

  expect(await lineOf(first)).toBe(`${OWN} ▸`)
  // Not in the conversation yet: the engine's.
  expect((await row.find({ type: 'Text' }))?.text).toBe('Background command "t1" completed')

  messages.push(said(reminder('t1')))
  await $.session.append({
    door: 'delivery',
    origin: { kind: 'task-notification' },
    uuid: 'n1',
    message: { type: 'user', content: [{ type: 'text', text: reminder('t1') }] },
  })
  expect(await lineOf(first)).toBe('1 command, 1 notification ▸')
  expect(await row.find({ type: 'Text' })).toBeUndefined()
})

test("a notice's row says what the conversation holds of it, as every other row of its span does", async ($, on) => {
  noticeEngine(on)
  on('session.messages', () => ({
    value: [said('mira'), said(reminder('t1', 'in the conversation')), asked('b1'), answered('b1')],
  }))

  const row = await noticeRow($, 't1', 'in the row')

  await row.press({ key: 'view' })
  expect((await row.find({ key: 'call-0' }))?.text).toMatch(/^N Notification in the conversation +/)
})

test("a row drawn in full, as ctrl+o and --verbose do, is the engine's, its result too", async ($, on) => {
  noticeEngine(on)
  on('session.messages', () => ({
    value: [said('mira'), asked('m1', 'mcp__docs__read', {}), answered('m1'), asked('b1'), answered('b1', 'a.ts')],
  }))

  const use = (isExpanded: boolean) =>
    $.ui.mount({
      plugin: 'ui-declutter',
      surface: 'terminal',
      component: 'ToolUse',
      props: {
        tool_use_id: 'm1',
        tool: 'mcp__docs__read',
        input: {},
        isRunning: false,
        isErrored: false,
        isInterrupted: false,
        isExpanded,
      },
    })
  const result = (isExpanded: boolean) =>
    $.ui.mount({
      plugin: 'ui-declutter',
      surface: 'terminal',
      component: 'ToolResult',
      props: { tool_use_id: 'b1', tool: 'Bash', output: { stdout: 'a.ts' }, isErrored: false, isExpanded },
    })

  expect(await lineOf(await use(false))).toBe('1 command, 1 MCP call ▸')
  expect((await (await use(true)).find({ type: 'Text' }))?.text).toBe('mcp__docs__read(m1)')
  expect(await (await result(false)).find({ type: 'Text' })).toBeUndefined()
  expect((await (await result(true)).find({ type: 'Text' }))?.text).toBe('result(b1)')
})

test("a span's rest draws when the engine unfolded some of its calls: the first of the others draws it", async ($, on) => {
  noticeEngine(on)
  on('session.messages', () => ({
    value: [
      said('mira'),
      asked('b1'),
      answered('b1'),
      asked('m1', 'mcp__docs__read', {}),
      answered('m1'),
      asked('b2'),
      answered('b2'),
    ],
  }))

  await group($, [call('b1', 'b1')], { isExpanded: true })

  // The call alone is the first not unfolded: it draws the others' line; the run after it does not.
  expect(await lineOf(await alone($, 'm1', 'mcp__docs__read'))).toBe('1 command, 1 MCP call ▸')
  expect(await (await group($, [call('b2', 'b2')])).find({ type: 'Text' })).toBeUndefined()

  // Folded again, the run it was draws the span.
  expect(await lineOf(await group($, [call('b1', 'b1')]))).toBe('2 commands, 1 MCP call ▸')
  expect(await (await alone($, 'm1', 'mcp__docs__read')).find({ type: 'Text' })).toBeUndefined()
})

test('a second run of a span draws its line when the first is the engine unfolded', async ($, on) => {
  noticeEngine(on)
  on('session.messages', () => ({
    value: [said('mira'), asked('b1'), answered('b1'), asked('b2'), answered('b2')],
  }))

  await group($, [call('b1', 'b1')], { isExpanded: true })
  expect(await lineOf(await group($, [call('b2', 'b2')]))).toBe(`${OWN} ▸`)
})

test('a call the person interrupted says so in the span it is not the first of', async ($, on) => {
  noticeEngine(on)
  on('session.messages', () => ({
    value: [
      said('mira'),
      asked('b1'),
      answered('b1'),
      asked('b2'),
      {
        role: 'user' as const,
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'b2',
            content: "The user doesn't want to proceed with this tool use. The tool use was rejected.",
            is_error: true,
          },
        ],
      },
      // The engine's word of the interruption, in a text after the result.
      { role: 'user' as const, content: [{ type: 'text', text: '[Request interrupted by user for tool use]' }] },
    ],
  }))

  const first = await alone($, 'b1', 'Bash')

  await first.press({ key: 'view' })
  expect(await first.find({ type: 'Text', text: 'stopped' })).toBeDefined()
  expect(await first.find({ type: 'Text', text: /✗/ })).toBeUndefined()
})

test('a time is said in whole seconds from the minute on, as it rounds: never 60 of them', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  engine(on)
  on('session.cwd', () => ({ value: '/repo' }))
  on('tool.call', async (_, e) => {
    await clock.advance(e.tool_use_id === 'a' ? 119_600 : 59_960)

    return { result: { stdout: '', stderr: '' } }
  })

  for (const id of ['a', 'b']) {
    await $.tool.call({ tool: 'Bash', tool_use_id: id, command: id })
  }

  expect(await lineOf(await group($, [call('a', 'a')]))).toBe('1 command · 2m 0s ▸')
  expect(await lineOf(await group($, [call('b', 'b')]))).toBe('1 command · 1m 0s ▸')
})

// What a terminal draws in: a wide character takes two cells.
const cells = (text: string) =>
  Array.from(text).reduce((sum, char) => sum + ((char.codePointAt(0) ?? 0) > 0x2e80 ? 2 : 1), 0)
const HALF_PAIR = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/

test('rows are laid out in terminal cells: a wide character clips by its width, no character in half', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  engine(on)
  on('session.cwd', () => ({ value: '/repo' }))
  on('tool.call', async () => {
    await clock.advance(2000)

    return { result: { stdout: '', stderr: '' } }
  })

  const commands = { plain: 'x'.repeat(120), cjk: '日本語'.repeat(40), emoji: '😀'.repeat(60) }

  for (const id of Object.keys(commands)) {
    await $.tool.call({ tool: 'Bash', tool_use_id: id, command: id })
  }

  const rowOf = async (id: keyof typeof commands) => {
    const ui = await group($, [call(id, commands[id])])

    await ui.press({ key: 'view' })

    return (await ui.find({ key: 'call-0' }))?.text ?? ''
  }
  const plain = await rowOf('plain')

  for (const id of ['cjk', 'emoji'] as const) {
    const row = await rowOf(id)

    expect(cells(row), id).toBe(cells(plain))
    expect(row, id).not.toMatch(HALF_PAIR)
  }
})

test('a narrow screen fits the rows by dropping their bars, not by running past its edge', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  engine(on)
  on('session.cwd', () => ({ value: '/repo' }))
  on('tool.call', async () => {
    await clock.advance(2000)

    return { result: { stdout: '', stderr: '' } }
  })
  await $.tool.call({ tool: 'Bash', tool_use_id: 'ls', command: 'ls -la' })

  for (const columns of [24, 30, 35, 39, 60]) {
    const ui = await group($, [call('ls', 'ls -la')], { columns })

    await ui.press({ key: 'view' })

    // The frame takes its border and its padding.
    for (const button of await ui.findAll({ type: 'Button' })) {
      expect(cells(button.text), `${columns} columns`).toBeLessThanOrEqual(columns - 4)
    }
  }
})

test('a new conversation in the same process forgets what was read of the last: its spans and its unfolded runs', async ($, on) => {
  noticeEngine(on)
  mock.store(on)
  on('session.root', () => ({ value: '/repo' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('process.run', () => ({
    value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  }))

  let messages = [said('mira'), asked('b1'), answered('b1'), asked('b2'), answered('b2')]

  on('session.messages', () => ({ value: messages }))
  expect(await lineOf(await alone($, 'b1', 'Bash'))).toBe('2 commands ▸')
  await group($, [call('b2', 'b2')], { isExpanded: true })
  expect((await (await alone($, 'b2', 'Bash')).find({ type: 'Text' }))?.text).toBe('Bash(b2)')

  // /clear, then another conversation that reuses the ids.
  messages = [said('otra'), asked('b1'), answered('b1'), said('y otra'), asked('b2'), answered('b2')]
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  expect(await lineOf(await alone($, 'b1', 'Bash'))).toBe(`${OWN} ▸`)
  expect(await lineOf(await alone($, 'b2', 'Bash'))).toBe(`${OWN} ▸`)
})

test('a new conversation forgets the web-fetch agents of the last', async ($, on) => {
  noticeEngine(on)
  mock.store(on)
  on('session.root', () => ({ value: '/repo' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('process.run', () => ({
    value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  }))

  const fetch = { subagent_type: 'web-fetch', prompt: 'Read https://example.com' }
  const agent = (input: object) =>
    $.ui.mount({
      plugin: 'ui-declutter',
      surface: 'terminal',
      component: 'ToolUse',
      props: {
        tool_use_id: 'fetch1',
        tool: 'Agent',
        input,
        isRunning: false,
        isErrored: false,
        isInterrupted: false,
      },
    })

  let isReadable = true

  on('session.messages', () =>
    isReadable
      ? { value: [said('mira'), asked('fetch1', 'Agent', fetch), answered('fetch1')] }
      : { deny: 'unreadable' },
  )
  expect(await lineOf(await agent(fetch))).toBe('1 web lookup ▸')

  // The next conversation cannot be read: its Agent of the same id is no web lookup.
  isReadable = false
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  expect((await (await agent({ subagent_type: 'Explore' })).find({ type: 'Text' }))?.text).toBe('Agent(fetch1)')
})

test('a call refused with a reason says it, one refused with none says not allowed, and a reason is on one line', async ($, on) => {
  mock.clock(on)
  engine(on)
  on('session.cwd', () => ({ value: '/repo' }))
  on('tool.check', (_, e) =>
    e.tool_use_id === 'multi'
      ? { decision: 'allow' as const }
      : e.tool_use_id === 'reasoned'
        ? { decision: 'deny' as const, reason: 'too risky' }
        : { decision: 'deny' as const },
  )
  on('tool.call', () => ({ deny: 'use  the\ntrash' }))

  await $.tool.check({ tool: 'Bash', input: { command: 'a' }, tool_use_id: 'reasoned' })
  await $.tool.check({ tool: 'Bash', input: { command: 'b' }, tool_use_id: 'bare' })
  await $.tool.call({ tool: 'Bash', tool_use_id: 'multi', command: 'c' })

  const ui = await group($, [call('reasoned', 'a', true), call('bare', 'b', true), call('multi', 'c', true)], {
    columns: 120,
  })

  await ui.press({ key: 'view' })

  for (const why of ['denied · too risky', 'denied · not allowed', 'denied · use the trash']) {
    expect(await ui.find({ type: 'Text', text: why }), why).toBeDefined()
  }
})

test('the pane offers to forget the project settings only where it has some, and says where the ones in use come from', async ($, on) => {
  engine(on)
  mock.store(on)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.root', () => ({ value: '/repo' }))

  const settings = await pane($)
  const source = async () => (await settings.find({ type: 'Text', text: /^Ajustes/ }))?.text
  const variant = async () => (await settings.find({ key: 'save-project' }))?.props.variant
  const note = () => settings.find({ type: 'Text', text: /^Este proyecto tiene los suyos/ })

  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  expect(await settings.find({ key: 'forget-project' })).toBeUndefined()
  expect(await variant()).toBe('secondary')

  // A change is unsaved, and saving for the project is then the main button; resetting is a change too.
  await settings.press({ key: 'commands-hidden' })
  expect(await source()).toBe('Ajustes por defecto · cambios sin guardar')
  expect(await variant()).toBe('primary')
  await settings.press({ key: 'reset' })
  expect(await source()).toBe('Ajustes por defecto')

  // Saved for the project, the settings in use are its own: nothing to say of it.
  await settings.press({ key: 'commands-hidden' })
  await settings.press({ key: 'save-project' })
  expect(await source()).toBe('Ajustes de este proyecto')
  expect(await settings.find({ key: 'forget-project' })).toBeDefined()
  expect(await note()).toBeUndefined()

  // A change undone is no change from the project's saved settings, whatever the global ones are.
  await settings.press({ key: 'diffs-hidden' })
  await settings.press({ key: 'diffs-summary' })
  expect(await source()).toBe('Ajustes de este proyecto')

  // Saved as global, the project still has its own, which win at the start.
  await settings.press({ key: 'save-global' })
  expect(await source()).toBe('Ajustes globales')
  expect(await note()).toBeDefined()

  // Off, only the switch is offered: not how the spans start either.
  expect(await settings.find({ key: 'startsOpen' })).toBeDefined()
  await settings.press({ key: 'switch' })
  expect(await settings.find({ key: 'startsOpen' })).toBeUndefined()
  await settings.unmount()
})

test('saving for a project the session does not name says so, and saves nothing', async ($, on) => {
  const toasts: string[] = []
  engine(on)
  mock.store(on)
  on('session.root', () => ({ deny: 'no root' }))
  on('ui.toast', (_, e) => (toasts.push(e.text), { value: undefined }))

  const settings = await pane($)

  await settings.press({ key: 'save-project' })
  expect(toasts).toEqual(['Esta sesión no dice cuál es su proyecto'])
  await settings.unmount()
})

test('a span with nothing to tell, its commands hidden and no file changed, draws no frame', async ($, on) => {
  span(on, [{ id: 'quiet', name: 'Bash', input: { command: 'ls' }, content: 'a.ts' }])
  await choose($, 'commands', 'hidden')

  const ui = await alone($, 'quiet', 'Bash')

  expect(await ui.find({ key: 'view' })).toBeUndefined()
  expect((await ui.findAll({ type: 'Box' })).filter(box => box.props.borderStyle !== undefined)).toEqual([])
})

test('an unfolded line is as wide as the rows beneath it; a row opened leaves its bar blank and draws its input whole beneath', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  const command = 'x'.repeat(120)

  span(on, [{ id: 'wide', name: 'Bash', input: { command }, content: 'ok' }])
  on('tool.call', async () => {
    await clock.advance(2000)

    return { result: { stdout: '', stderr: '' } }
  })
  await $.tool.call({ tool: 'Bash', tool_use_id: 'wide', command })

  const ui = await group($, [call('wide', command)])

  await ui.press({ key: 'view' })

  const text = async (key: string) => (await ui.find({ key }))?.text ?? ''

  expect((await text('view')).length).toBe((await text('call-0')).length)
  expect(await text('call-0')).toMatch(/━/)
  expect(await ui.find({ type: 'Text', text: command })).toBeUndefined()

  await ui.press({ key: 'call-0' })
  expect(await text('call-0')).not.toMatch(/[━─┄]/)
  expect(await ui.find({ type: 'Text', text: command })).toBeDefined()
})

test('the result of a call that failed is drawn as an error', async ($, on) => {
  span(on, [{ id: 'bad', name: 'Bash', input: { command: 'make' }, content: 'boom', isError: true }])

  const ui = await group($, [call('bad', 'make', true)])

  await ui.press({ key: 'view' })
  await ui.press({ key: 'call-0' })
  expect((await ui.find({ type: 'Text', text: 'boom' }))?.props.color).toBe('error')
})

test('a result shown in full says how many lines did not fit; a short one needs no button to close it', async ($, on) => {
  mock.clock(on)

  const long = Array.from({ length: 300 }, () => 'x'.repeat(255)).join('\n')
  const short = Array.from({ length: 12 }, (_, n) => `line ${n}`).join('\n')

  span(on, [
    { id: 'huge', name: 'Bash', input: { command: 'cat huge' }, content: long },
    { id: 'brief', name: 'Bash', input: { command: 'cat brief' }, content: short },
  ])

  const ui = await group($, [call('huge', 'cat huge'), call('brief', 'cat brief')], { columns: 400 })

  await ui.press({ key: 'view' })
  await ui.press({ key: 'call-0' })
  await ui.press({ key: 'more-0' })
  // 234 lines of 256 characters fill a drawing's 60000.
  expect(await ui.find({ type: 'Text', text: '… +66 lines' })).toBeDefined()
  expect(await ui.find({ key: 'more-0' })).toBeUndefined()

  await ui.press({ key: 'call-1' })
  await ui.press({ key: 'more-1' })
  expect(await ui.find({ type: 'Text', text: 'line 11' })).toBeDefined()
  expect(await ui.find({ key: 'fold-call-1' })).toBeUndefined()
})

test('a file opened says so in its arrow, and one whose edits left no hunk has no diff to draw', async ($, on) => {
  span(on, [{ id: 'empty', name: 'Edit', input: { file_path: '/repo/a.ts' }, content: 'ok' }])
  await alone($, 'empty', 'Edit', { structuredPatch: [] })

  const ui = await alone($, 'empty', 'Edit')

  await ui.press({ key: 'view' })
  expect((await ui.find({ key: 'file-empty-0' }))?.text).toBe('± a.ts ▸ +0 −0')
  await ui.press({ key: 'file-empty-0' })
  expect((await ui.find({ key: 'file-empty-0' }))?.text).toBe('± a.ts ▾ +0 −0')
  expect(await ui.find({ type: 'Code' })).toBeUndefined()
})

test("a row's wait is dotted from when the latest of the rows before it ended, not the last of them", async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  let release = () => {}
  const gate = new Promise<void>(resolve => (release = resolve))

  engine(on)
  on('session.cwd', () => ({ value: '/repo' }))
  on('tool.call', async (_, e) => {
    if (e.tool_use_id === 'a') {
      await gate
    } else {
      await clock.advance(10)
    }

    return { result: { stdout: '', stderr: '' } }
  })

  // a runs 0 to 100, b inside it, 0 to 10; c, 150 to 160, waited for the later end.
  const first = $.tool.call({ tool: 'Bash', tool_use_id: 'a', command: 'a' })

  await $.tool.call({ tool: 'Bash', tool_use_id: 'b', command: 'b' })
  await clock.advance(90)
  release()
  await first
  await clock.advance(50)
  await $.tool.call({ tool: 'Bash', tool_use_id: 'c', command: 'c' })

  const ui = await group($, [call('a', 'a'), call('b', 'b'), call('c', 'c')])

  await ui.press({ key: 'view' })
  expect((await ui.find({ key: 'call-2' }))?.text).toMatch(/^\$ Bash c +─{19}┄{9}━{2} +0\.0s$/)
})

test("a call still running ends now on its span's clock", async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })

  engine(on)
  on('session.cwd', () => ({ value: '/repo' }))
  on('tool.call', () => new Promise(() => undefined))
  void $.tool.call({ tool: 'Bash', tool_use_id: 'running', command: 'sleep 9' })
  await clock.advance(2000)

  expect(await lineOf(await group($, [{ ...call('running', 'sleep 9'), isRunning: true }]))).toBe('1 command · 2.0s ▸')
})

// What the conversation holds of a task that ended, drawn by the row of its notice.
const endedTask = (on: On) => {
  noticeEngine(on)
  on('session.messages', () => ({ value: [said('mira'), said(reminder('t9')), asked('b9'), answered('b9')] }))
}
const noticeOf = ($: Parameters<TestBody>[0], props: object, surface: 'terminal' | 'desktop' = 'terminal') =>
  $.ui.mount({
    plugin: 'ui-declutter',
    surface,
    component: 'UserMessage',
    props: {
      text: 'Background command "t9" completed',
      origin: { kind: 'task-notification' },
      isExpanded: false,
      task: { id: 't9', status: 'completed' },
      ...props,
    },
  })

test("a notice is drawn as a call of its span only when it is a task's end, the engine's own row is not drawn in full, and the commands are not normal", async ($, on) => {
  endedTask(on)

  const engines = async (ui: Awaited<ReturnType<typeof noticeOf>>) =>
    (await ui.find({ type: 'Text' }))?.text === 'Background command "t9" completed'

  expect(await engines(await noticeOf($, {}))).toBe(false)
  expect(await engines(await noticeOf($, { origin: { kind: 'user' } }))).toBe(true)
  expect(await engines(await noticeOf($, { isExpanded: true }))).toBe(true)
  expect(await engines(await noticeOf($, {}, 'desktop'))).toBe(true)

  await choose($, 'commands', 'full')
  expect(await engines(await noticeOf($, {}))).toBe(true)
})

test("a notice the conversation could not be read for draws its own summary, and one of a task still running is the engine's", async ($, on) => {
  noticeEngine(on)
  on('session.messages', () => ({ deny: 'unreadable' }))

  const ui = await noticeOf($, {})

  await ui.press({ key: 'view' })
  expect((await ui.find({ key: 'call-0' }))?.text).toMatch(/^N Notification Background command/)

  const running = await noticeOf($, { task: { id: 't8', status: 'running' }, text: 'still on' })

  expect((await running.find({ type: 'Text' }))?.text).toBe('still on')
})

test('an edit or a run that failed, when the conversation cannot be read, is counted failed', async ($, on) => {
  noticeEngine(on)
  on('session.messages', () => ({ deny: 'unreadable' }))

  const failed = {
    tool_use_id: 'lost',
    tool: 'Edit',
    input: { file_path: '/repo/a.ts' },
    isRunning: false,
    isErrored: true,
    isInterrupted: false,
    output: 'File has not been read yet',
  }
  const row = await $.ui.mount({ plugin: 'ui-declutter', surface: 'terminal', component: 'ToolUse', props: failed })

  expect(await lineOf(row)).toBe('1 fallido ▸')
  expect(await lineOf(await group($, [{ ...failed, tool_use_id: 'lost2' }]))).toBe('1 fallido ▸')
})

test("a row off the terminal is the engine's, a row still running is not yet out of the conversation", async ($, on) => {
  noticeEngine(on)
  on('session.messages', () => ({ value: [said('mira'), asked('b1'), answered('b1')] }))

  const props = { tool_use_id: 'b1', tool: 'Bash', input: {}, isRunning: false, isErrored: false, isInterrupted: false }
  const desktop = await $.ui.mount({ plugin: 'ui-declutter', surface: 'desktop', component: 'ToolUse', props })

  expect((await desktop.find({ type: 'Text' }))?.text).toBe('Bash(b1)')
  // The same run of a call still going: its line is drawn, for the conversation may not hold it yet.
  expect(await lineOf(await group($, [{ ...call('b2', 'b2'), isRunning: true }]))).toMatch(/^1 command/)
  expect((await (await group($, [call('b3', 'b3')])).find({ type: 'Text' }))?.text).toBe(LINE)
})
