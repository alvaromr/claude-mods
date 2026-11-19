import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

type Surface = 'terminal' | 'desktop' | 'mobile'
const PROPS = { modes: ['focus'] }
const TURN = { answer: 'Done.', durationMs: 10, isAborted: false, turnId: 't1', reason: 'answer' } as const

const printed = (lines: readonly string[], exitCode = 0) => ({
  value: {
    exitCode,
    stdout: lines.join('\n') + '\n',
    stderr: '',
    isStdoutTruncated: false,
    isStderrTruncated: false,
  },
})

/** What git says of a repository: its status, its changed lines and its commits no remote has. */
type Repo = { status: readonly string[]; lines: readonly string[]; unpushed: number }

const PENDING: Repo = {
  status: [
    '# branch.oid 1234567890',
    '# branch.head main',
    '# branch.upstream origin/main',
    '# branch.ab +2 -0',
    '1 .M f',
    '? g',
  ],
  lines: ['10\t3\tf', '-\t-\tlogo.png', '4\t0'],
  unpushed: 2,
}
const ONE_FILE: Repo = {
  status: ['# branch.oid 1234567890', '# branch.head main', '1 .M f'],
  lines: ['1\t0\tf'],
  unpushed: 0,
}
// A worktree's branch: nothing to commit, no upstream, commits no remote has.
const COMMITTED: Repo = { status: ['# branch.oid 1234567890', '# branch.head abc-7-fix'], lines: [], unpushed: 3 }
const CLEAN: Repo = { status: ['# branch.oid 1234567890', '# branch.head (detached)'], lines: [], unpushed: 0 }

// The folder the session runs in, null where it is no repository, and the
// footer with what the engine draws there.
const stage = ($: Engine, on: On, surface: Surface = 'terminal', isStoreDown: boolean | 'unwritable' = false) => {
  const it = {
    repo: PENDING as Repo | null,
    /** Why a command cannot run at all, as a hook that denies it says. */
    refusal: null as string | null,
    /** The part of the repository git cannot read: its lines or its commits no remote has. */
    broken: null as 'lines' | 'unpushed' | null,
    /** Why the session's folder cannot be read, as a hook that denies it says. */
    cwdRefusal: null as string | null,
    /** What the store holds, by key, in a store that works: the settings saved, global and each project's. */
    saved: {} as Record<string, unknown>,
    /** Why the session's project root cannot be read, as a hook that denies it says. */
    rootRefusal: null as string | null,
    /** The exit code of the script that counts the changed lines. */
    linesExit: 0,
    /** The slots of other mods laid beneath already, in the order drawn; the `other` one where there are none. */
    slots: [] as { key: string; label: string }[],
    /** Who each prompt a button sent was sent as. */
    origins: [] as unknown[],
    /** Held at the next `git status` until it is let go, with the repository as it was then. */
    hold: null as Promise<void> | null,
    /** The state refuses to keep the settings, so a start fails. */
    isStateDown: false,
    /** Told when a `git status` has been held. */
    reached: () => {},
    /** The folder the session reports, which a shell `cd` may leave as it was. */
    cwd: '/repo',
    /** Why a prompt cannot be submitted; none when it can. */
    unsendable: null as string | null,
    other: false,
    sent: [] as string[],
    toasts: [] as string[],
    logged: [] as string[],
    /** Each command's script or arguments, and the longest it was given. */
    argvs: [] as { argv: readonly string[]; timeoutMs?: number }[],
    /** The folder each command ran in, where one was named. */
    ranIn: [] as (string | undefined)[],
    start: () => $.session.start({ cwd: '/repo', surface, isInteractive: true }),
    footer: () => $.ui.mount({ plugin: 'bar-git', surface, component: 'SessionMode', props: PROPS }),
  }

  if (isStoreDown === 'unwritable') {
    // A project with saved settings, in a store that keeps and drops nothing.
    on('store.get', (_, e) => ({ value: e.key === 'settings:/repo' ? {} : undefined }))
    on('store.set', () => ({ deny: 'disk full' }))
    on('store.delete', () => ({ deny: 'disk full' }))
  } else if (isStoreDown) {
    on('store.get', () => ({ deny: 'store down' }))
  } else {
    on('store.get', (_, e) => ({ value: it.saved[e.key] }))
    on('store.set', (_, e) => {
      it.saved[e.key] = e.value

      return { value: undefined }
    })
    on('store.delete', (_, e) => {
      Reflect.deleteProperty(it.saved, e.key)

      return { value: undefined }
    })
  }

  on('session.root', () => (it.rootRefusal === null ? { value: '/repo' } : { deny: it.rootRefusal }))

  on('process.run', async (_, e) => {
    it.ranIn.push(e.init?.cwd)
    it.argvs.push({ argv: e.argv, timeoutMs: e.init?.timeoutMs })

    const found = it.repo
    const isStatus = e.argv[0] === 'git'
    const isCount = e.argv[1]?.endsWith('/scripts/unpushed.sh') === true

    if (
      it.refusal !== null ||
      (it.broken === 'lines' && !isStatus && !isCount) ||
      (it.broken === 'unpushed' && isCount)
    ) {
      return { deny: it.refusal ?? 'timed out' }
    }

    if (isStatus && it.hold !== null) {
      const held = it.hold

      it.hold = null
      it.reached()
      await held
    }

    if (found === null) {
      return printed([], 128)
    }

    return printed(
      isStatus ? found.status : isCount ? [`${found.unpushed}`] : found.lines,
      isStatus || isCount ? 0 : it.linesExit,
    )
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => (it.cwdRefusal === null ? { value: it.cwd } : { deny: it.cwdRefusal }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('classic.CwdChanged', () => ({}))
  on('classic.PostToolUse', () => ({}))
  on('state.set', (_, e, next) => (it.isStateDown && e.key === 'settings' ? { deny: 'state down' } : next(e)))
  on('ui.toast', (_, e) => (it.toasts.push(e.text), { value: undefined }))
  on('ui.log', (_, e) => (it.logged.push(e.text), { value: undefined }))
  on('prompt.submit', (_, e) => {
    if (it.unsendable !== null) {
      throw new Error(it.unsendable)
    }

    it.sent.push(e.text)
    it.origins.push(e.origin)

    return { text: e.text }
  })
  // With `other`, another mod's slot row, laid beneath already, as a mod that
  // ran before would leave it.
  on('ui.render', { component: 'SessionMode' }, (engine, e) => {
    const { Box, Button, Text } = engine.ui.resolve(e)

    const beneath = it.other ? [{ key: 'slot:2.1:other', label: 'other' }] : it.slots

    return beneath.length > 0 ? (
      <Box flexDirection="column">
        <Text>engine</Text>
        <Box width="100%">
          {beneath.map(({ key, label }) => (
            <Box key={key}>
              <Button key={label} plain label={label} onPress={() => undefined} />
            </Box>
          ))}
        </Box>
      </Box>
    ) : (
      <Text>engine</Text>
    )
  })

  return it
}

type Footer = Awaited<ReturnType<ReturnType<typeof stage>['footer']>>

// The words drawn, each once: a Text that holds others is told by them.
const texts = async (ui: Footer) =>
  (await ui.findAll({ type: 'Text' }))
    .filter(found => found.children.every(child => typeof child === 'string'))
    .map(found => found.text)
    .join('')
const buttons = async (ui: Footer) => (await ui.findAll({ type: 'Button' })).map(found => found.props.label)

test('names the branch and offers commit and integrate while work is pending', async ($, on) => {
  const it = stage($, on)

  await it.start()

  const ui = await it.footer()

  // A row of its own under what the engine draws; the icon and the branch
  // alone are cut where the row ends.
  expect(await texts(ui)).toBe('engine⎇ main · 2 ficheros +14 -3 · 2 sin subir ·  ·  ')
  expect(await buttons(ui)).toEqual(['commit', 'integrar', '⚙'])
  expect((await ui.findAll({ type: 'Text' })).find(found => found.text === '⎇ main')?.props.wrap).toBe('truncate-end')

  await ui.press({ key: 'commit' })
  await ui.press({ key: 'integrate' })
  expect(it.sent).toEqual(['haz commit', 'integra los cambios'])
  await ui.unmount()

  // Committed but not pushed: nothing to commit, still something to integrate.
  it.repo = COMMITTED
  await it.start()

  const committed = await it.footer()

  expect(await texts(committed)).toBe('engine⎇ abc-7-fix · 3 sin subir ·  ')
  expect(await buttons(committed)).toEqual(['integrar', '⚙'])
  await committed.unmount()

  it.repo = CLEAN
  await it.start()

  const quiet = await it.footer()

  expect(await texts(quiet)).toBe('engine⎇ 1234567 ')
  expect(await buttons(quiet)).toEqual(['⚙'])
  await quiet.unmount()
})

test('the row is the footer’s last, after another mod’s slot row', async ($, on) => {
  const it = stage($, on)

  it.other = true
  await it.start()

  const ui = await it.footer()

  expect(await buttons(ui)).toEqual(['other', 'commit', 'integrar', '⚙'])
  await ui.unmount()
})

test('desktop, which tells the branch and commits itself: the footer as the engine draws it', async ($, on) => {
  const it = stage($, on, 'desktop')

  await it.start()

  const ui = await it.footer()

  expect(await texts(ui)).toBe('engine')
  expect(await buttons(ui)).toEqual([])
})

test('the footer follows each turn that ends, and one file is said in the singular', async ($, on) => {
  const it = stage($, on)

  it.repo = CLEAN
  await it.start()

  const ui = await it.footer()

  expect(await buttons(ui)).toEqual(['⚙'])

  it.repo = ONE_FILE
  await $.turn.complete(TURN)
  expect(await texts(ui)).toBe('engine⎇ main · 1 fichero +1 -0 ·  ·  ')
  expect(await buttons(ui)).toEqual(['commit', 'integrar', '⚙'])

  await ui.unmount()
})

test('a /cd is followed at once in the folder it names, and a subagent’s end changes nothing', async ($, on) => {
  const it = stage($, on)

  it.repo = CLEAN
  await it.start()

  const ui = await it.footer()

  it.repo = ONE_FILE
  it.ranIn = []
  await $.classic.CwdChanged({
    session_id: 'abc',
    cwd: '/other',
    transcript_path: '/tmp/abc.jsonl',
    old_cwd: '/repo',
    new_cwd: '/other',
  })
  expect(await texts(ui)).toBe('engine⎇ main · 1 fichero +1 -0 ·  ·  ')
  expect(it.ranIn).toEqual(['/other', '/other', '/other'])

  // The subagent's hook would read the subagent's own folder.
  it.repo = CLEAN
  await $.turn.complete({ ...TURN, turnId: 't2', agentId: 'a1' })
  expect(await texts(ui)).toBe('engine⎇ main · 1 fichero +1 -0 ·  ·  ')

  await ui.unmount()
})

test('within a turn, the repository is read again once the tools that change it are still', async ($, on) => {
  const clock = mock.clock(on)
  const it = stage($, on)
  const used = (tool_name: string) =>
    $.classic.PostToolUse({
      session_id: 'abc',
      cwd: '/repo',
      transcript_path: '/tmp/abc.jsonl',
      tool_name,
      tool_input: {},
      tool_response: {},
      tool_use_id: tool_name,
    })

  it.repo = CLEAN
  await it.start()

  const ui = await it.footer()

  it.repo = ONE_FILE
  await used('Read')
  await clock.advance(1000)
  expect(await buttons(ui)).toEqual(['⚙'])

  // A checkout and an edit close together are one read, once both are done.
  await used('Bash')
  await clock.advance(500)
  await used('Edit')
  await clock.advance(500)
  expect(await buttons(ui)).toEqual(['⚙'])
  await clock.advance(500)
  expect(await texts(ui)).toBe('engine⎇ main · 1 fichero +1 -0 ·  ·  ')

  await ui.unmount()
})

test('⚙ opens the pane, which hides parts, renames a button and changes what it sends', async ($, on) => {
  const it = stage($, on)
  const open = new Set<string>()
  const PANE = {
    plugin: 'bar-git',
    component: 'Pane',
    requestId: 'bar-git',
    props: {
      title: 'Git',
      isFocused: false,
      bodyColumns: 60,
      placement: 'dock',
      scroll: { offset: 0, bodyRows: 40 },
      view: {},
    },
  } as const

  on('ui.open', ($, e) => (open.add(e.id), { value: { isPlaced: true } }))
  on('ui.close', ($, e) => (open.delete(e.id), { value: undefined }))
  on('ui.panes', () => ({
    value: [...open].map(id => ({ id, title: id, isShown: true, isFocused: false, isPlaced: true })),
  }))
  on('command.run', (_, e) => (it.sent.push(`/${e.command} ${e.args}`.trim()), { text: '' }))
  await it.start()

  const ui = await it.footer()

  await ui.press({ key: 'bar-git-settings' })
  expect([...open]).toEqual(['bar-git'])

  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })

  await pane.press({ key: 'showIcon' })
  await pane.press({ key: 'showFiles' })
  await pane.press({ key: 'showAhead' })
  await pane.press({ key: 'showIntegrate' })
  await pane.input({ key: 'commitLabel', text: 'guardar' })
  await pane.input({ key: 'commitPrompt', text: '/commit' })
  expect(await texts(ui)).toBe('enginemain · +14 -3 ·  ')
  expect(await buttons(ui)).toEqual(['guardar', '⚙'])

  // A slash command runs as one; a prompt goes as the person's.
  await ui.press({ key: 'commit' })
  await pane.input({ key: 'commitPrompt', text: 'commit y push' })
  await ui.press({ key: 'commit' })
  expect(it.sent).toEqual(['/commit', 'commit y push'])

  await pane.press({ key: 'reset' })
  expect(await buttons(ui)).toEqual(['commit', 'integrar', '⚙'])

  // Unsaved, a change is gone the next session; saved as global, it stays.
  await pane.input({ key: 'commitLabel', text: 'guardar' })
  await it.start()
  expect(await buttons(ui)).toEqual(['commit', 'integrar', '⚙'])
  await pane.input({ key: 'commitLabel', text: 'guardar' })
  await pane.press({ key: 'save-global' })
  await it.start()
  expect(await buttons(ui)).toEqual(['guardar', 'integrar', '⚙'])
  await pane.unmount()
  await ui.unmount()
})

test('outside a repository the footer is left as the engine draws it', async ($, on) => {
  const it = stage($, on)

  it.repo = null
  await it.start()

  const ui = await it.footer()

  expect(await texts(ui)).toBe('engine')
  expect(await buttons(ui)).toEqual([])

  await ui.unmount()
})

test('git that cannot run leaves the footer as the engine draws it, and why in the debug log', async ($, on) => {
  const it = stage($, on)

  it.refusal = 'no git'
  await it.start()

  const ui = await it.footer()

  expect(await texts(ui)).toBe('engine')
  expect(it.logged).toContain('running git status failed: bar-git: $.process.run: no git')

  await ui.unmount()
})

test('a part git cannot read is left out, with its cause in the debug log, and the rest of the row stays', async ($, on) => {
  const it = stage($, on)

  it.broken = 'lines'
  await it.start()

  const ui = await it.footer()

  // Files and buttons stay; the lines, which would be no lines at all, are not shown as none.
  expect(await texts(ui)).toBe('engine⎇ main · 2 ficheros · 2 sin subir ·  ·  ')
  expect(await buttons(ui)).toEqual(['commit', 'integrar', '⚙'])
  expect(it.logged).toContain('counting the changed lines failed: bar-git: $.process.run: timed out')

  it.broken = 'unpushed'
  await $.turn.complete(TURN)
  expect(await texts(ui)).toBe('engine⎇ main · 2 ficheros +14 -3 ·  ·  ')
  expect(it.logged).toContain('counting the commits no remote has failed: bar-git: $.process.run: timed out')

  // Each part is given a time of its own to read in, short of the engine's 30 seconds.
  expect(it.argvs.map(({ timeoutMs }) => timeoutMs).every(timeoutMs => timeoutMs === 10_000)).toBe(true)
  await ui.unmount()
})

// What the scripts count, in a real repository, is in scripts.test.sh.
test('files are counted as the lines are, an untracked folder file by file', async ($, on) => {
  const it = stage($, on)

  await it.start()

  const [status, lines, unpushed] = it.argvs.map(({ argv }) => argv)

  expect(status).toContain('-uall')
  expect(lines?.[0]).toBe('sh')
  expect(lines?.[1]?.endsWith('/bar-git/scripts/lines.sh')).toBe(true)
  expect(unpushed?.[0]).toBe('sh')
  expect(unpushed?.[1]?.endsWith('/bar-git/scripts/unpushed.sh')).toBe(true)
})

test('an answer that comes back after a newer one is dropped', async ($, on) => {
  const it = stage($, on)

  it.repo = CLEAN
  await it.start()

  const ui = await it.footer()
  let release = () => {}

  // A turn's end reads the repository as it is now, and git is slow answering.
  it.repo = ONE_FILE
  it.hold = new Promise<void>(resolve => (release = resolve))

  const reached = new Promise<void>(resolve => (it.reached = resolve))
  const older = $.turn.complete(TURN)

  await reached
  // Another turn ends once the repository has changed, and its answer is quick.
  it.repo = PENDING
  await $.turn.complete({ ...TURN, turnId: 't2' })
  expect(await texts(ui)).toBe('engine⎇ main · 2 ficheros +14 -3 · 2 sin subir ·  ·  ')

  release()
  await older
  expect(await texts(ui)).toBe('engine⎇ main · 2 ficheros +14 -3 · 2 sin subir ·  ·  ')
  await ui.unmount()
})

const CD = {
  session_id: 'abc',
  cwd: '/other',
  transcript_path: '/tmp/abc.jsonl',
  old_cwd: '/repo',
  new_cwd: '/other',
} as const

test('after a shell cd the session does not report, the folder stays where the cd took it', async ($, on) => {
  const clock = mock.clock(on)
  const it = stage($, on)

  it.repo = CLEAN
  await it.start()

  const ui = await it.footer()

  // The session still says /repo: only the move tells where it went.
  await $.classic.CwdChanged(CD)
  it.ranIn = []
  await $.turn.complete(TURN)
  await $.classic.PostToolUse({
    session_id: 'abc',
    cwd: '/repo',
    transcript_path: '/tmp/abc.jsonl',
    tool_name: 'Bash',
    tool_input: {},
    tool_response: {},
    tool_use_id: 'u1',
  })
  await clock.advance(1000)
  expect(it.ranIn).toEqual(Array(6).fill('/other'))
  await ui.unmount()
})

test('after a cd the session follows, or a move it tells of later, the session’s own folder is read', async ($, on) => {
  const it = stage($, on)

  it.repo = CLEAN
  await it.start()

  const ui = await it.footer()

  // The session follows the cd: its folder is the one the move named.
  it.cwd = '/other'
  await $.classic.CwdChanged(CD)
  it.ranIn = []
  await $.turn.complete(TURN)
  expect(it.ranIn).toEqual(['/other', '/other', '/other'])

  // A worktree move, told by no CwdChanged: the session's folder differs, and wins.
  it.cwd = '/worktree'
  it.ranIn = []
  await $.turn.complete(TURN)
  await $.turn.complete(TURN)
  expect(it.ranIn).toEqual(Array(6).fill(undefined))
  await ui.unmount()
})

test('a prompt the button sends that is refused says so, as a command does', async ($, on) => {
  const it = stage($, on)

  it.unsendable = 'a turn is running'
  await it.start()

  const ui = await it.footer()

  await ui.press({ key: 'commit' })
  expect(it.toasts).toHaveLength(1)
  expect(it.toasts[0]).toMatch(/^No se pudo ejecutar haz commit: /)
  await ui.unmount()
})

test('a store that cannot be read leaves the session on its defaults, and says why in the debug log', async ($, on) => {
  const it = stage($, on, 'terminal', true)

  await it.start()

  const ui = await it.footer()

  expect(await buttons(ui)).toEqual(['commit', 'integrar', '⚙'])
  expect(it.logged).toContain('reading the saved settings failed: bar-git: $.store.get: store down')
  await ui.unmount()
})

test('a save or a forget the store refuses says so, and the pane does not mark it done', async ($, on) => {
  const it = stage($, on, 'terminal', 'unwritable')

  await it.start()

  const pane = await $.ui.mount({
    plugin: 'bar-git',
    component: 'Pane',
    requestId: 'bar-git',
    surface: 'terminal',
    props: {
      title: 'Git',
      isFocused: false,
      bodyColumns: 60,
      placement: 'dock',
      scroll: { offset: 0, bodyRows: 40 },
      view: {},
    },
  })
  const source = async () => (await pane.find({ type: 'Text', text: /^Ajustes/ }))?.text

  await pane.press({ key: 'showIcon' })
  await pane.press({ key: 'save-project' })
  await pane.press({ key: 'save-global' })
  await pane.press({ key: 'forget-project' })
  expect(it.toasts).toEqual([
    'No se pudieron guardar los ajustes: bar-git: $.store.set: disk full',
    'No se pudieron guardar los ajustes: bar-git: $.store.set: disk full',
    'No se pudieron olvidar los ajustes del proyecto: bar-git: $.store.delete: disk full',
  ])
  expect(it.logged).toContain('saving the settings failed: bar-git: $.store.set: disk full')
  expect(it.logged).toContain("forgetting the project's settings failed: bar-git: $.store.delete: disk full")
  // Still the project's, still unsaved, and the project's settings still there to forget.
  expect(await source()).toBe('Ajustes de este proyecto · cambios sin guardar')
  expect(await pane.find({ key: 'forget-project' })).toBeDefined()
  await pane.unmount()
})

test('a start that fails says why in the debug log, and the next drawing starts again', async ($, on) => {
  const it = stage($, on)
  const clock = mock.clock(on)

  it.isStateDown = true
  await it.start()
  expect(it.logged).toContain('starting failed: bar-git: $.state.set: state down')

  it.isStateDown = false

  const ui = await it.footer()

  await clock.settle()
  expect(await buttons(ui)).toEqual(['commit', 'integrar', '⚙'])
  await ui.unmount()
})

test('changes pressed together all land', async ($, on) => {
  const it = stage($, on)

  await it.start()

  const ui = await it.footer()
  const pane = await $.ui.mount({
    plugin: 'bar-git',
    component: 'Pane',
    requestId: 'bar-git',
    surface: 'terminal',
    props: {
      title: 'Git',
      isFocused: false,
      bodyColumns: 60,
      placement: 'dock',
      scroll: { offset: 0, bodyRows: 40 },
      view: {},
    },
  })

  await Promise.all([
    pane.press({ key: 'showIcon' }),
    pane.press({ key: 'showFiles' }),
    pane.press({ key: 'showAhead' }),
    pane.press({ key: 'showIntegrate' }),
  ])
  expect(await texts(ui)).toBe('enginemain · +14 -3 ·  ')
  expect(await buttons(ui)).toEqual(['commit', '⚙'])
  await pane.unmount()
  await ui.unmount()
})

test('a resumed session drawn before session.start reached the mod: the row fills in', async ($, on) => {
  const it = stage($, on)
  const clock = mock.clock(on)
  const ui = await it.footer()

  await clock.settle()
  expect(await buttons(ui)).toEqual(['commit', 'integrar', '⚙'])
  await ui.unmount()
})

test('the pane shows its fields in the mobile app too', async ($, on) => {
  await stage($, on).start()

  const pane = await $.ui.mount({
    plugin: 'bar-git',
    component: 'Pane',
    requestId: 'bar-git',
    surface: 'mobile',
    props: {
      title: 'Git',
      isFocused: false,
      bodyColumns: 60,
      placement: 'dock',
      scroll: { offset: 0, bodyRows: 40 },
      view: {},
    },
  })

  expect(await pane.find({ type: 'Input', key: 'commitLabel' })).toBeDefined()
  await pane.unmount()
})

const PANE_BASE = {
  plugin: 'bar-git',
  component: 'Pane',
  requestId: 'bar-git',
  props: {
    title: 'Git',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const
const CHANGERS = ['Bash', 'Edit', 'Write', 'NotebookEdit']

test('outside the terminal and the desktop app only the buttons are drawn, and only while there is work for them', async ($, on) => {
  const it = stage($, on, 'mobile')

  await it.start()

  const ui = await it.footer()

  expect(await texts(ui)).toBe('engine')
  expect(await buttons(ui)).toEqual(['commit', 'integrar'])

  it.repo = COMMITTED
  await $.turn.complete(TURN)
  expect(await buttons(ui)).toEqual(['integrar'])

  // Nothing to press: no row at all.
  it.repo = CLEAN
  await $.turn.complete(TURN)
  expect(await buttons(ui)).toEqual([])
  expect(await ui.findAll({ type: 'Box' })).toEqual([])
  await ui.unmount()
})

test('the row is drawn in the colors set for each part, the dots between them', async ($, on) => {
  const it = stage($, on)

  await it.start()

  const ui = await it.footer()
  const colorOf = async (text: string) =>
    (await ui.findAll({ type: 'Text' })).find(found => found.text === text)?.props.color

  expect(await colorOf('⎇ ')).toBe('red')
  expect(await colorOf('main')).toBe('#8a8a8a')
  expect(await colorOf('2 ficheros')).toBe('#8a8a8a')
  expect(await colorOf(' +14')).toBe('success')
  expect(await colorOf(' -3')).toBe('error')
  expect(await colorOf('2 sin subir')).toBe('#8a8a8a')
  expect(await colorOf(' · ')).toBe('#8a8a8a')
  await ui.unmount()
})

test('the pane hides the branch, the head, the files and the lines, each on its own', async ($, on) => {
  const it = stage($, on)

  await it.start()

  const ui = await it.footer()
  const pane = await $.ui.mount({ ...PANE_BASE, surface: 'terminal' })

  await pane.press({ key: 'showBranch' })
  expect(await texts(ui)).toBe('engine⎇  · 2 ficheros +14 -3 · 2 sin subir ·  ·  ')
  await pane.press({ key: 'showIcon' })
  expect(await texts(ui)).toBe('engine2 ficheros +14 -3 · 2 sin subir ·  ·  ')
  await pane.press({ key: 'showIcon' })
  await pane.press({ key: 'showBranch' })

  await pane.press({ key: 'showLines' })
  expect(await texts(ui)).toBe('engine⎇ main · 2 ficheros · 2 sin subir ·  ·  ')
  await pane.press({ key: 'showFiles' })
  expect(await texts(ui)).toBe('engine⎇ main · 2 sin subir ·  ·  ')
  await pane.press({ key: 'showLines' })
  expect(await texts(ui)).toBe('engine⎇ main · +14 -3 · 2 sin subir ·  ·  ')

  // An icon left empty shows nothing, not the space after it.
  await pane.press({ key: 'showFiles' })
  await pane.input({ key: 'icon', text: '' })
  expect(await texts(ui)).toBe('enginemain · 2 ficheros +14 -3 · 2 sin subir ·  ·  ')
  await pane.unmount()
  await ui.unmount()
})

test('a button sends a command with its arguments, and any other text as a prompt of the person’s', async ($, on) => {
  const it = stage($, on)

  on('command.run', (_, e) => (it.sent.push(`/${e.command} ${e.args}`.trim()), { text: '' }))
  await it.start()

  const ui = await it.footer()
  const pane = await $.ui.mount({ ...PANE_BASE, surface: 'terminal' })

  await pane.input({ key: 'commitPrompt', text: '/commit -m "dos palabras"' })
  await ui.press({ key: 'commit' })
  expect(it.sent).toEqual(['/commit -m "dos palabras"'])

  // A slash inside a text does not make it a command.
  await pane.input({ key: 'commitPrompt', text: 'revisa /tmp/x y haz commit' })
  await ui.press({ key: 'commit' })
  expect(it.sent).toEqual(['/commit -m "dos palabras"', 'revisa /tmp/x y haz commit'])
  expect(it.origins).toMatchObject([{ kind: 'plugin', asUser: true }])
  await pane.unmount()
  await ui.unmount()
})

test('each tool that may change the repository is read after a second, the others not', async ($, on) => {
  const clock = mock.clock(on)
  const it = stage($, on)
  const used = (tool_name: string) =>
    $.classic.PostToolUse({
      session_id: 'abc',
      cwd: '/repo',
      transcript_path: '/tmp/abc.jsonl',
      tool_name,
      tool_input: {},
      tool_response: {},
      tool_use_id: tool_name,
    })

  await it.start()

  const ui = await it.footer()

  for (const tool of [...CHANGERS, 'Read', 'Grep']) {
    it.repo = CLEAN
    await $.turn.complete(TURN)
    expect(await buttons(ui)).toEqual(['⚙'])

    it.repo = ONE_FILE
    await used(tool)
    await clock.advance(1000)
    expect(await buttons(ui)).toEqual(CHANGERS.includes(tool) ? ['commit', 'integrar', '⚙'] : ['⚙'])
  }

  await ui.unmount()
})

test('the status is read with no lock, and git’s count of lines that failed is left out', async ($, on) => {
  const it = stage($, on)

  it.linesExit = 1
  await it.start()

  const ui = await it.footer()

  expect(it.argvs[0]?.argv).toEqual(['git', '--no-optional-locks', 'status', '--porcelain=v2', '--branch', '-uall'])
  expect(await texts(ui)).toBe('engine⎇ main · 2 ficheros · 2 sin subir ·  ·  ')
  await ui.unmount()
})

test('a new session forgets the folder an earlier cd took the session to, and one that cannot be read keeps it', async ($, on) => {
  const it = stage($, on)

  it.repo = CLEAN
  await it.start()

  const ui = await it.footer()

  await $.classic.CwdChanged(CD)
  it.cwdRefusal = 'no folder'
  it.ranIn = []
  await $.turn.complete(TURN)
  expect(it.ranIn).toEqual(['/other', '/other', '/other'])

  it.cwdRefusal = null
  it.ranIn = []
  await it.start()
  expect(it.ranIn).toEqual([undefined, undefined, undefined])
  await ui.unmount()
})

test('the other mods’ slots are laid in their rows’ and places’ order, the git row among them', async ($, on) => {
  const it = stage($, on)

  it.slots = [
    { key: 'slot:9.3:late', label: 'late' },
    { key: 'slot:9:none', label: 'none' },
    { key: 'slot:10.1:below', label: 'below' },
    { key: 'slot:9.0:early', label: 'early' },
    { key: 'x-slot:11.1:not-a-slot', label: 'plain' },
  ]
  await it.start()

  const ui = await it.footer()

  expect(await buttons(ui)).toEqual(['plain', 'early', 'commit', 'integrar', '⚙', 'late', 'none', 'below'])
  expect(await ui.find({ type: 'Text', text: 'engine' })).toBeDefined()
  expect((await ui.findAll({ type: 'Box' })).filter(box => box.children.length === 0)).toEqual([])
  await ui.unmount()
})

test('the Box that held another mod’s slot is taken out with it', async ($, on) => {
  const it = stage($, on)

  it.other = true
  await it.start()

  const ui = await it.footer()

  expect((await ui.findAll({ type: 'Box' })).filter(box => box.children.length === 0)).toEqual([])
  await ui.unmount()
})

test('the ⚙ button opens the pane while another pane is open', async ($, on) => {
  const it = stage($, on)
  const open = new Set(['other'])

  on('ui.open', ($, e) => (open.add(e.id), { value: { isPlaced: true } }))
  on('ui.close', ($, e) => (open.delete(e.id), { value: undefined }))
  on('ui.panes', () => ({
    value: [...open].map(id => ({ id, title: id, isShown: true, isFocused: false, isPlaced: true })),
  }))
  await it.start()

  const ui = await it.footer()

  await ui.press({ key: 'bar-git-settings' })
  expect([...open]).toEqual(['other', 'bar-git'])
  await ui.unmount()
})

test('the pane shows a switch on as a full square and off dim, and a swatch per color', async ($, on) => {
  const it = stage($, on)

  await it.start()

  const pane = await $.ui.mount({ ...PANE_BASE, surface: 'terminal' })
  const icon = async () => {
    const found = await pane.find({ type: 'Button', key: 'showIcon' })

    return [found?.text, found?.props.dimColor]
  }

  expect(await icon()).toEqual(['■ Icono de rama', false])
  await pane.press({ key: 'showIcon' })
  expect(await icon()).toEqual(['□ Icono de rama', true])
  expect((await pane.findAll({ type: 'Text', text: '■' })).map(swatch => swatch.props.color)).toEqual([
    'red',
    '#8a8a8a',
    'success',
    'error',
    '#8a8a8a',
  ])
  await pane.unmount()
})

test('only the terminal marks a field with a ground', async ($, on) => {
  await stage($, on).start()

  const grounds = async (surface: 'terminal' | 'mobile') => {
    const pane = await $.ui.mount({ ...PANE_BASE, surface })
    const found = (await pane.findAll({ type: 'Box' })).filter(box => box.props.backgroundColor === 'subtle')

    await pane.unmount()

    return found.length > 0
  }

  expect(await grounds('terminal')).toBe(true)
  expect(await grounds('mobile')).toBe(false)
})

test('a text takes the length its field allows, a color three or six digits or a name, trimmed', async ($, on) => {
  const it = stage($, on)

  await it.start()

  const pane = await $.ui.mount({ ...PANE_BASE, surface: 'terminal' })
  const refusals = async (key: string, texts: string[]) => {
    const before = it.toasts.length

    for (const text of texts) {
      await pane.input({ key, text })
    }

    return it.toasts.length - before
  }

  expect(await refusals('icon', ['12345', '*'.repeat(40)])).toBe(2)
  expect(await refusals('icon', ['', '1234'])).toBe(0)
  expect(await refusals('commitLabel', ['', 'x'.repeat(25)])).toBe(2)
  expect(await refusals('commitLabel', ['x'.repeat(24), 'x'])).toBe(0)
  expect(await refusals('integrateLabel', ['', 'x'.repeat(25)])).toBe(2)
  expect(await refusals('commitPrompt', ['', 'x'.repeat(501)])).toBe(2)
  expect(await refusals('commitPrompt', ['x'.repeat(500), 'x'])).toBe(0)
  expect(await refusals('integratePrompt', ['', 'x'.repeat(501)])).toBe(2)
  expect(await refusals('iconColor', ['#123456789', '#12345', 'not a color!'])).toBe(3)
  expect(await refusals('iconColor', ['  #0f0  ', '#00ff00', 'warning'])).toBe(0)
  await pane.unmount()
})

test('a session that tells no project root saves nothing for a project, and says so', async ($, on) => {
  const it = stage($, on)

  it.rootRefusal = 'no root'
  await it.start()

  const pane = await $.ui.mount({ ...PANE_BASE, surface: 'terminal' })

  await pane.press({ key: 'showIcon' })
  await pane.press({ key: 'save-project' })
  expect(it.toasts).toEqual(['Esta sesión no dice cuál es su proyecto'])
  expect(it.saved['settings:null']).toBeUndefined()
  expect((await pane.find({ type: 'Text', text: /^Ajustes/ }))?.text).toBe('Ajustes por defecto · cambios sin guardar')
  await pane.unmount()
})

test('a session starts with its project’s saved settings, else the global ones, and the pane says which', async ($, on) => {
  const it = stage($, on)

  it.saved['settings:/repo'] = { showBranch: false }
  it.saved.settings = { showIcon: false }
  await it.start()

  const ui = await it.footer()
  const pane = await $.ui.mount({ ...PANE_BASE, surface: 'terminal' })
  const source = async () => (await pane.find({ type: 'Text', text: /^Ajustes/ }))?.text
  const note = () => pane.find({ type: 'Text', text: 'Este proyecto tiene los suyos, que mandan al arrancar.' })

  expect(await texts(ui)).toBe('engine⎇  · 2 ficheros +14 -3 · 2 sin subir ·  ·  ')
  expect(await source()).toBe('Ajustes de este proyecto')
  expect(await note()).toBeUndefined()

  // Forgotten, the session takes the global ones.
  await pane.press({ key: 'forget-project' })
  expect(it.saved['settings:/repo']).toBeUndefined()
  expect(await source()).toBe('Ajustes globales')
  expect(await texts(ui)).toBe('enginemain · 2 ficheros +14 -3 · 2 sin subir ·  ·  ')
  expect(await note()).toBeUndefined()
  await pane.unmount()
  await ui.unmount()
})

test('a change saved for the project is the project’s at once, and unsaved against it', async ($, on) => {
  const it = stage($, on)

  await it.start()

  const pane = await $.ui.mount({ ...PANE_BASE, surface: 'terminal' })
  const source = async () => (await pane.find({ type: 'Text', text: /^Ajustes/ }))?.text
  const variant = async () => (await pane.find({ type: 'Button', key: 'save-project' }))?.props.variant

  expect(await variant()).toBe('secondary')
  await pane.press({ key: 'showIcon' })
  expect(await variant()).toBe('primary')
  await pane.press({ key: 'save-project' })
  expect(await source()).toBe('Ajustes de este proyecto')
  expect(await variant()).toBe('secondary')
  expect(await pane.find({ key: 'forget-project' })).toBeDefined()
  expect(it.saved['settings:/repo']).toMatchObject({ showIcon: false })
  expect(it.saved.settings).toBeUndefined()

  // Changed and changed back, it is the saved one again.
  await pane.press({ key: 'showFiles' })
  expect(await source()).toBe('Ajustes de este proyecto · cambios sin guardar')
  await pane.press({ key: 'showFiles' })
  expect(await source()).toBe('Ajustes de este proyecto')
  expect(it.toasts).toEqual([])
  await pane.unmount()
})

test('settings from the defaults are unsaved against the defaults, whatever another session saved since', async ($, on) => {
  const it = stage($, on)

  await it.start()

  const pane = await $.ui.mount({ ...PANE_BASE, surface: 'terminal' })

  it.saved.settings = { showIcon: false }
  await pane.press({ key: 'showFiles' })
  await pane.press({ key: 'showFiles' })
  expect((await pane.find({ type: 'Text', text: /^Ajustes/ }))?.text).toBe('Ajustes por defecto')
  await pane.unmount()
})

test('saved globally, the settings are every project’s, and the project’s own are said to rule', async ($, on) => {
  const it = stage($, on)

  await it.start()

  const pane = await $.ui.mount({ ...PANE_BASE, surface: 'terminal' })
  const note = () => pane.find({ type: 'Text', text: 'Este proyecto tiene los suyos, que mandan al arrancar.' })

  await pane.press({ key: 'showIcon' })
  await pane.press({ key: 'save-global' })
  expect(it.saved.settings).toMatchObject({ showIcon: false })
  expect(it.saved['settings:/repo']).toBeUndefined()
  expect(await note()).toBeUndefined()

  // Saved for the project, they are the session's own, which needs no note; saved globally again, the project's rule.
  await pane.press({ key: 'save-project' })
  expect(await note()).toBeUndefined()
  await pane.press({ key: 'save-global' })
  expect(await note()).toBeDefined()
  await pane.unmount()
})

test('a saved setting missing or of another type takes its default', async ($, on) => {
  const it = stage($, on)

  it.saved.settings = { showIcon: false, branchColor: 42 }
  await it.start()

  const ui = await it.footer()

  expect(await texts(ui)).toBe('enginemain · 2 ficheros +14 -3 · 2 sin subir ·  ·  ')
  // The branch's own Text, and the one around it that tells its words.
  expect((await ui.findAll({ type: 'Text' })).map(found => found.props.color)).toContain('#8a8a8a')
  expect((await ui.findAll({ type: 'Text' })).map(found => found.props.color)).not.toContain(42)
  await ui.unmount()
})
