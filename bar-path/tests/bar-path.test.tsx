import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

const FOOTER = { plugin: 'bar-path', component: 'SessionMode', props: { modes: [] } } as const
const PANE = {
  plugin: 'bar-path',
  component: 'Pane',
  requestId: 'bar-path',
  props: {
    title: 'Ruta',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

// A session in a folder under the home one, the footer holding another mod's
// slot row (bar-git's, the last but this one), the panes open recorded.
const stage = ($: Engine, on: On, isStoreDown: boolean | 'unwritable' = false) => {
  const open = new Set<string>()
  const it = {
    cwd: '/Users/me/claude-mods',
    /** What the store holds, by key: the settings saved, global and each project's. */
    saved: {} as Record<string, unknown>,
    /** The home folder the environment tells, where it tells one. */
    home: '/Users/me' as string | undefined,
    /** Why the session's folder cannot be read, as a hook that denies it says. */
    refusal: null as string | null,
    /** Why the session's project root cannot be read, as a hook that denies it says. */
    rootRefusal: null as string | null,
    /** The slots of other mods in the footer, as drawn beneath this one's, in the order drawn. */
    slots: [{ key: 'slot:9.1:bar-git', label: 'git' }] as { key: string; label: string }[],
    /** The state refuses to keep the folder, so a start fails. */
    isStateDown: false,
    logged: [] as string[],
    toasts: [] as string[],
    open,
    clock: mock.clock(on),
    start: () => $.session.start({ cwd: it.cwd, surface: 'terminal', isInteractive: true }),
  }

  if (isStoreDown === 'unwritable') {
    // A project with saved settings, in a store that keeps and drops nothing.
    on('store.get', (_, e) => ({ value: e.key === 'settings:/Users/me/claude-mods' ? {} : undefined }))
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

  on('env.get', (_, e) => ({ value: e.name === 'HOME' ? it.home : undefined }))
  on('state.set', (_, e, next) => (it.isStateDown && e.key === 'place' ? { deny: 'state down' } : next(e)))
  on('ui.log', (_, e) => (it.logged.push(e.text), { value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => (it.refusal === null ? { value: it.cwd } : { deny: it.refusal }))
  on('session.root', () => (it.rootRefusal === null ? { value: '/Users/me/claude-mods' } : { deny: it.rootRefusal }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('classic.CwdChanged', () => ({}))
  on('ui.open', ($, e) => (open.add(e.id), { value: { isPlaced: true } }))
  on('ui.close', ($, e) => (open.delete(e.id), { value: undefined }))
  on('ui.panes', () => ({
    value: [...open].map(id => ({ id, title: id, isShown: true, isFocused: false, isPlaced: true })),
  }))
  on('ui.toast', (_, e) => (it.toasts.push(e.text), { value: undefined }))
  on('ui.render', { component: 'SessionMode' }, (engine, e) => {
    const { Box, Button, Text } = engine.ui.resolve(e)

    return (
      <Box flexDirection="column">
        <Text>engine</Text>
        <Box width="100%">
          {it.slots.map(({ key, label }) => (
            <Box key={key}>
              <Button key={label} plain label={label} onPress={() => undefined} />
            </Box>
          ))}
        </Box>
      </Box>
    )
  })

  return it
}

// The row's words, each once (a Text that holds others is told by them), past
// what the engine draws; undefined where the row is not drawn.
const path = async (footer: {
  findAll: (q: { type: 'Text' }) => Promise<readonly { text: string; children: readonly unknown[] }[]>
}) => {
  const words = (await footer.findAll({ type: 'Text' }))
    .filter(found => found.children.every(child => typeof child === 'string') && found.text !== 'engine')
    .map(found => found.text)
    .join('')
    .trim()

  return words === '' ? undefined : words
}

test('the folder, home as ~, as the footer’s last row; ⚙ opens and closes the pane', async ($, on) => {
  const it = stage($, on)

  await it.start()

  const footer = await $.ui.mount({ ...FOOTER, surface: 'terminal' })

  expect(await path(footer)).toBe('~/claude-mods')
  expect((await footer.find({ type: 'Text', text: /^claude-mods$/ }))?.props.color).toBe('cyan')
  // The folder's name is a file link to it.
  expect((await footer.find({ type: 'Link' }))?.props.href).toBe('file:///Users/me/claude-mods')
  expect((await footer.findAll({ type: 'Button' })).map(button => button.props.label)).toEqual(['git', '⚙'])

  await footer.press({ key: 'bar-path-settings' })
  expect([...it.open]).toEqual(['bar-path'])
  await footer.press({ key: 'bar-path-settings' })
  expect([...it.open]).toEqual([])
  await footer.unmount()
})

test('a folder it cannot read leaves the footer as the engine draws it, and why in the debug log', async ($, on) => {
  const it = stage($, on)

  it.refusal = 'no folder'
  await it.start()

  const footer = await $.ui.mount({ ...FOOTER, surface: 'terminal' })

  expect(await path(footer)).toBeUndefined()
  expect(it.logged).toContain("reading the session's folder failed: bar-path: $.session.cwd: no folder")
  await footer.unmount()
})

test('a session that moves is followed once its turn ends', async ($, on) => {
  const it = stage($, on)

  await it.start()

  const footer = await $.ui.mount({ ...FOOTER, surface: 'terminal' })

  it.cwd = '/tmp/a worktree (2)'
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  expect(await path(footer)).toBe('/tmp/a worktree (2)')
  expect((await footer.find({ type: 'Link' }))?.props.href).toBe('file:///tmp/a%20worktree%20%282%29')
  await footer.unmount()
})

test('a /cd is followed at once, before the session reads it, and a subagent’s end keeps the folder', async ($, on) => {
  const it = stage($, on)

  await it.start()

  const footer = await $.ui.mount({ ...FOOTER, surface: 'terminal' })

  await $.classic.CwdChanged({
    session_id: 'abc',
    cwd: '/tmp/other',
    transcript_path: '/tmp/abc.jsonl',
    old_cwd: '/Users/me/claude-mods',
    new_cwd: '/tmp/other',
  })
  expect(await path(footer)).toBe('/tmp/other')

  // The subagent's hook reads the subagent's own folder.
  it.cwd = '/tmp/subagent'
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't2', reason: 'answer', agentId: 'a1' })
  expect(await path(footer)).toBe('/tmp/other')
  await footer.unmount()
})

const MOVED = {
  session_id: 'abc',
  cwd: '/tmp/other',
  transcript_path: '/tmp/abc.jsonl',
  old_cwd: '/Users/me/claude-mods',
  new_cwd: '/tmp/other',
} as const
const ENDED = { answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as const

test('after a shell cd the session does not report, the folder stays where the cd took it, until it moves again', async ($, on) => {
  const it = stage($, on)

  await it.start()

  const footer = await $.ui.mount({ ...FOOTER, surface: 'terminal' })

  // The session still says it is in the folder it started in: only the move tells.
  await $.classic.CwdChanged(MOVED)
  await $.turn.complete(ENDED)
  expect(await path(footer)).toBe('/tmp/other')

  // A move no CwdChanged told of (a worktree's) is read once the session reports it.
  it.cwd = '/tmp/a-worktree'
  await $.turn.complete(ENDED)
  expect(await path(footer)).toBe('/tmp/a-worktree')
  await $.turn.complete(ENDED)
  expect(await path(footer)).toBe('/tmp/a-worktree')
  await footer.unmount()
})

test('after a cd the session follows, the folder is the same one', async ($, on) => {
  const it = stage($, on)

  await it.start()

  const footer = await $.ui.mount({ ...FOOTER, surface: 'terminal' })

  it.cwd = '/tmp/other'
  await $.classic.CwdChanged(MOVED)
  await $.turn.complete(ENDED)
  expect(await path(footer)).toBe('/tmp/other')
  await footer.unmount()
})

test('a store that cannot be read leaves the session on its defaults, and says why in the debug log', async ($, on) => {
  const it = stage($, on, true)

  await it.start()

  const footer = await $.ui.mount({ ...FOOTER, surface: 'terminal' })

  expect(await path(footer)).toBe('~/claude-mods')
  expect(it.logged).toContain('reading the saved settings failed: bar-path: $.store.get: store down')
  await footer.unmount()
})

test('a save or a forget the store refuses says so, and the pane does not mark it done', async ($, on) => {
  const it = stage($, on, 'unwritable')

  await it.start()

  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const source = async () => (await pane.find({ type: 'Text', text: /^Ajustes/ }))?.text

  await pane.press({ key: 'showParents' })
  await pane.press({ key: 'save-project' })
  await pane.press({ key: 'save-global' })
  await pane.press({ key: 'forget-project' })
  expect(it.toasts).toEqual([
    'No se pudieron guardar los ajustes: bar-path: $.store.set: disk full',
    'No se pudieron guardar los ajustes: bar-path: $.store.set: disk full',
    'No se pudieron olvidar los ajustes del proyecto: bar-path: $.store.delete: disk full',
  ])
  expect(it.logged).toContain('saving the settings failed: bar-path: $.store.set: disk full')
  expect(it.logged).toContain("forgetting the project's settings failed: bar-path: $.store.delete: disk full")
  // Still the project's, still unsaved, and the project's settings still there to forget.
  expect(await source()).toBe('Ajustes de este proyecto · cambios sin guardar')
  expect(await pane.find({ key: 'forget-project' })).toBeDefined()
  await pane.unmount()
})

test('a start that fails says why in the debug log, and the next drawing starts again', async ($, on) => {
  const it = stage($, on)

  it.isStateDown = true
  await it.start()
  expect(it.logged).toContain('starting failed: bar-path: $.state.set: state down')

  it.isStateDown = false

  const footer = await $.ui.mount({ ...FOOTER, surface: 'terminal' })

  await it.clock.settle()
  expect(await path(footer)).toBe('~/claude-mods')
  await footer.unmount()
})

test('changes pressed together all land', async ($, on) => {
  const it = stage($, on)

  await it.start()

  const footer = await $.ui.mount({ ...FOOTER, surface: 'terminal' })
  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })

  await Promise.all([pane.press({ key: 'showTilde' }), pane.press({ key: 'showParents' })])
  expect(await path(footer)).toBe('claude-mods')
  await pane.unmount()
  await footer.unmount()
})

test('the pane hides the parents, keeps home whole and recolors', async ($, on) => {
  const it = stage($, on)

  await it.start()

  const footer = await $.ui.mount({ ...FOOTER, surface: 'terminal' })
  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })

  await pane.press({ key: 'showTilde' })
  expect(await path(footer)).toBe('/Users/me/claude-mods')
  await pane.press({ key: 'showParents' })
  await pane.input({ key: 'nameColor', text: '#ff00ff' })
  expect(await path(footer)).toBe('claude-mods')
  expect((await footer.find({ type: 'Text', text: /^claude-mods$/ }))?.props.color).toBe('#ff00ff')

  await pane.press({ key: 'reset' })
  expect(await path(footer)).toBe('~/claude-mods')
  await pane.unmount()
  await footer.unmount()
})

test("a change holds for the session; saved, the next one starts with it, the project's before the global ones", async ($, on) => {
  const it = stage($, on)

  await it.start()

  const footer = await $.ui.mount({ ...FOOTER, surface: 'terminal' })
  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const source = async () => (await pane.find({ type: 'Text', text: /^Ajustes/ }))?.text

  expect(await source()).toBe('Ajustes por defecto')

  // Unsaved, a change is gone the next session; undone, nothing is unsaved.
  await pane.press({ key: 'showParents' })
  expect(await source()).toBe('Ajustes por defecto · cambios sin guardar')
  await pane.press({ key: 'showParents' })
  expect(await source()).toBe('Ajustes por defecto')
  await pane.press({ key: 'showParents' })
  expect(await path(footer)).toBe('claude-mods')
  await it.start()
  expect(await path(footer)).toBe('~/claude-mods')

  // Saved as global, it stays; reset to the defaults, it differs from them unsaved.
  await pane.press({ key: 'showParents' })
  await pane.press({ key: 'save-global' })
  expect(await source()).toBe('Ajustes globales')
  await pane.press({ key: 'reset' })
  expect(await source()).toBe('Ajustes globales · cambios sin guardar')
  await it.start()
  expect(await path(footer)).toBe('claude-mods')

  // Saved for the project, it wins over the global ones.
  await pane.press({ key: 'showParents' })
  await pane.press({ key: 'showTilde' })
  await pane.press({ key: 'save-project' })
  await it.start()
  expect(await source()).toBe('Ajustes de este proyecto')
  expect(await path(footer)).toBe('/Users/me/claude-mods')

  // Forgotten, the session takes the global ones.
  await pane.press({ key: 'forget-project' })
  expect(await source()).toBe('Ajustes globales')
  expect(await path(footer)).toBe('claude-mods')
  expect(await pane.find({ key: 'forget-project' })).toBeUndefined()
  await pane.unmount()
  await footer.unmount()
})

test('a resumed session drawn before session.start reached the mod: the row fills in', async ($, on) => {
  const it = stage($, on)
  const footer = await $.ui.mount({ ...FOOTER, surface: 'terminal' })

  await it.clock.settle()
  expect(await path(footer)).toBe('~/claude-mods')
  await footer.unmount()
})

test('desktop, which tells the folder itself: the footer as the engine draws it', async ($, on) => {
  const it = stage($, on)

  await it.start()

  const footer = await $.ui.mount({ ...FOOTER, surface: 'desktop' })

  expect(await path(footer)).toBeUndefined()
  await footer.unmount()
})

test('the pane shows its fields in the mobile app too', async ($, on) => {
  await stage($, on).start()

  const pane = await $.ui.mount({ ...PANE, surface: 'mobile' })

  expect(await pane.find({ type: 'Input', key: 'nameColor' })).toBeDefined()
  await pane.unmount()
})

test('the parents are dim gray and give way at their start, the folder is bold, and nothing is left empty', async ($, on) => {
  await stage($, on).start()

  const footer = await $.ui.mount({ ...FOOTER, surface: 'terminal' })
  const parents = await footer.find({ type: 'Text', text: '~/' })
  const name = await footer.find({ type: 'Text', text: 'claude-mods' })

  expect(parents?.props.color).toBe('#8a8a8a')
  expect(parents?.props.wrap).toBe('truncate-start')
  expect(name?.props.weight).toBe('semibold')
  // What the engine drew stays, and the Box that held the other mod's slot is gone with it.
  expect(await footer.find({ type: 'Text', text: 'engine' })).toBeDefined()
  expect((await footer.findAll({ type: 'Box' })).filter(box => box.children.length === 0)).toEqual([])
  await footer.unmount()
})

test('the parents and the folder take the colors set for each', async ($, on) => {
  await stage($, on).start()

  const footer = await $.ui.mount({ ...FOOTER, surface: 'terminal' })
  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })

  await pane.input({ key: 'parentColor', text: 'red' })
  await pane.input({ key: 'nameColor', text: 'warning' })
  expect((await footer.find({ type: 'Text', text: '~/' }))?.props.color).toBe('red')
  expect((await footer.find({ type: 'Text', text: 'claude-mods' }))?.props.color).toBe('warning')
  // Each field shows its own swatch.
  expect((await pane.findAll({ type: 'Text', text: '■' })).map(swatch => swatch.props.color)).toEqual([
    'red',
    'warning',
  ])
  await pane.unmount()
  await footer.unmount()
})

test('home as ~ only for home itself and what is under it; the root is its own name', async ($, on) => {
  const it = stage($, on)
  const shown = async (cwd: string) => {
    it.cwd = cwd
    await it.start()

    const footer = await $.ui.mount({ ...FOOTER, surface: 'terminal' })
    const words = await path(footer)
    const name = (await footer.findAll({ type: 'Text' })).find(found => found.props.color === 'cyan')?.text

    await footer.unmount()

    return [words, name]
  }

  expect(await shown('/Users/me')).toEqual(['~', '~'])
  expect(await shown('/Users/mellon/x')).toEqual(['/Users/mellon/x', 'x'])
  expect(await shown('/')).toEqual(['/', '/'])

  // Where the environment tells no home folder, the path shows whole.
  it.home = undefined
  expect(await shown('/Users/me/claude-mods')).toEqual(['/Users/me/claude-mods', 'claude-mods'])
})

test('a start drops the folder an earlier cd took the session to', async ($, on) => {
  const it = stage($, on)

  await it.start()

  const footer = await $.ui.mount({ ...FOOTER, surface: 'terminal' })

  await $.classic.CwdChanged(MOVED)
  expect(await path(footer)).toBe('/tmp/other')
  await it.start()
  expect(await path(footer)).toBe('~/claude-mods')
  await footer.unmount()
})

test('after a cd the folder stays while the session cannot be read, and follows once the session reports a move', async ($, on) => {
  const it = stage($, on)

  await it.start()

  const footer = await $.ui.mount({ ...FOOTER, surface: 'terminal' })

  await $.classic.CwdChanged(MOVED)
  it.refusal = 'no folder'
  await $.turn.complete(ENDED)
  expect(await path(footer)).toBe('/tmp/other')

  // A move reported, then a move back to the folder the session reported at the cd: the cd is no longer held.
  it.refusal = null
  it.cwd = '/tmp/a-worktree'
  await $.turn.complete(ENDED)
  expect(await path(footer)).toBe('/tmp/a-worktree')
  it.cwd = '/Users/me/claude-mods'
  await $.turn.complete(ENDED)
  expect(await path(footer)).toBe('~/claude-mods')
  await footer.unmount()
})

test('the other mods’ slots are laid in their rows’ and places’ order, those with no place last', async ($, on) => {
  const it = stage($, on)

  it.slots = [
    { key: 'slot:10.3:late', label: 'late' },
    { key: 'slot:10:none', label: 'none' },
    { key: 'slot:11.1:below', label: 'below' },
    { key: 'slot:10.0:early', label: 'early' },
    { key: 'x-slot:12.1:not-a-slot', label: 'plain' },
  ]
  await it.start()

  const footer = await $.ui.mount({ ...FOOTER, surface: 'terminal' })

  expect((await footer.findAll({ type: 'Button' })).map(button => button.props.label)).toEqual([
    'plain',
    'early',
    '⚙',
    'late',
    'none',
    'below',
  ])
  await footer.unmount()
})

test('the ⚙ button opens the pane while another pane is open', async ($, on) => {
  const it = stage($, on)

  await it.start()
  it.open.add('other')

  const footer = await $.ui.mount({ ...FOOTER, surface: 'terminal' })

  await footer.press({ key: 'bar-path-settings' })
  expect([...it.open]).toEqual(['other', 'bar-path'])
  await footer.unmount()
})

test('the switches show on as a full square and off dim, and a color that is none is refused with a toast', async ($, on) => {
  const it = stage($, on)

  await it.start()

  const footer = await $.ui.mount({ ...FOOTER, surface: 'terminal' })
  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const parents = async () => {
    const found = await pane.find({ type: 'Button', key: 'showParents' })

    return [found?.text, found?.props.dimColor]
  }

  expect(await parents()).toEqual(['■ Carpetas superiores', false])
  await pane.press({ key: 'showParents' })
  expect(await parents()).toEqual(['□ Carpetas superiores', true])

  // A color is a hex of three or six digits, or a name; one typed with spaces around is trimmed.
  for (const text of ['not a color!', '#123456789', '#12345', '']) {
    await pane.input({ key: 'nameColor', text })
  }

  expect(it.toasts).toEqual(Array.from({ length: 4 }, () => 'No es un color: usa #rrggbb, red o warning'))
  expect((await footer.find({ type: 'Text', text: 'claude-mods' }))?.props.color).toBe('cyan')
  await pane.input({ key: 'nameColor', text: '  #f0f  ' })
  expect((await footer.find({ type: 'Text', text: 'claude-mods' }))?.props.color).toBe('#f0f')
  expect(it.toasts).toHaveLength(4)
  await pane.unmount()
  await footer.unmount()
})

test('only the terminal marks a field with a ground', async ($, on) => {
  await stage($, on).start()

  const grounds = async (surface: 'terminal' | 'mobile') => {
    const pane = await $.ui.mount({ ...PANE, surface })
    const found = (await pane.findAll({ type: 'Box' })).filter(box => box.props.backgroundColor === 'subtle')

    await pane.unmount()

    return found.length
  }

  expect(await grounds('terminal')).toBe(2)
  expect(await grounds('mobile')).toBe(0)
})

test('a saved setting missing or of another type takes its default', async ($, on) => {
  const it = stage($, on)

  it.saved.settings = { showParents: false, nameColor: 42 }
  await it.start()

  const footer = await $.ui.mount({ ...FOOTER, surface: 'terminal' })

  expect(await path(footer)).toBe('claude-mods')
  expect((await footer.find({ type: 'Text', text: 'claude-mods' }))?.props.color).toBe('cyan')
  await footer.unmount()
})

test('a session that tells no project root saves nothing for a project, and says so', async ($, on) => {
  const it = stage($, on)

  it.rootRefusal = 'no root'
  await it.start()

  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })

  await pane.press({ key: 'showParents' })
  await pane.press({ key: 'save-project' })
  expect(it.toasts).toEqual(['Esta sesión no dice cuál es su proyecto'])
  expect(it.saved['settings:null']).toBeUndefined()
  expect(await pane.find({ type: 'Text', text: /^Ajustes por defecto · cambios sin guardar/ })).toBeDefined()
  await pane.unmount()
})

test('a change saved for the project is the project’s at once, and unsaved against it', async ($, on) => {
  const it = stage($, on)

  await it.start()

  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const source = async () => (await pane.find({ type: 'Text', text: /^Ajustes/ }))?.text
  const variant = async () => (await pane.find({ type: 'Button', key: 'save-project' }))?.props.variant

  expect(await variant()).toBe('secondary')
  await pane.press({ key: 'showParents' })
  expect(await variant()).toBe('primary')
  await pane.press({ key: 'save-project' })
  expect(await source()).toBe('Ajustes de este proyecto')
  expect(await variant()).toBe('secondary')
  expect(await pane.find({ key: 'forget-project' })).toBeDefined()
  expect(it.saved['settings:/Users/me/claude-mods']).toMatchObject({ showParents: false })
  expect(it.saved.settings).toBeUndefined()

  // Changed and changed back, it is the saved one again.
  await pane.press({ key: 'showTilde' })
  expect(await source()).toBe('Ajustes de este proyecto · cambios sin guardar')
  await pane.press({ key: 'showTilde' })
  expect(await source()).toBe('Ajustes de este proyecto')
  expect(it.toasts).toEqual([])
  await pane.unmount()
})

test('settings from the defaults are unsaved against the defaults, whatever another session saved since', async ($, on) => {
  const it = stage($, on)

  await it.start()

  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const source = async () => (await pane.find({ type: 'Text', text: /^Ajustes/ }))?.text

  it.saved.settings = { showParents: false }
  await pane.press({ key: 'showTilde' })
  await pane.press({ key: 'showTilde' })
  expect(await source()).toBe('Ajustes por defecto')
  await pane.unmount()
})

test('saved globally, the settings are every project’s and the project’s own are said to rule', async ($, on) => {
  const it = stage($, on)

  await it.start()

  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const note = () => pane.find({ type: 'Text', text: 'Este proyecto tiene los suyos, que mandan al arrancar.' })

  // No settings of its own for the project: nothing to say of them.
  expect(await note()).toBeUndefined()
  await pane.press({ key: 'showParents' })
  await pane.press({ key: 'save-global' })
  expect(it.saved.settings).toMatchObject({ showParents: false })
  expect(it.saved['settings:/Users/me/claude-mods']).toBeUndefined()
  expect(await note()).toBeUndefined()

  // Saved for the project, they are the session's own, which needs no note; saved globally again, the project's rule.
  await pane.press({ key: 'save-project' })
  expect(await note()).toBeUndefined()
  await pane.press({ key: 'save-global' })
  expect(await note()).toBeDefined()
  await pane.unmount()
})
