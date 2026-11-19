import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Preferences } from '../types'
import { reasonOf } from './failure'
import { fileUrl, pathOf, placeOf, stillMoved } from './path'
import type { Moved } from './path'
import {
  COLORS,
  DEFAULTS,
  PARTS,
  differs,
  entered,
  isColor,
  loaded,
  projectKeyOf,
  provenanceOf,
  savedAs,
} from './preferences'
import type { Words } from './preferences'
import { slotted } from './slots'
import { TEXT } from './text'

const PANE = 'bar-path'

const place = atom({ plugin: 'bar-path', key: 'place' } as const, null)
const settings = atom({ plugin: 'bar-path', key: 'settings' } as const, DEFAULTS)
const origin = atom({ plugin: 'bar-path', key: 'origin' } as const, {
  source: 'defaults',
  isChanged: false,
  hasProject: false,
})

let hasStarted = false

/** A call that failed gives `fallback`, the mod showing less, and its cause goes to the debug log. */
const orElse =
  <T,>($: EngineInterface, doing: string, fallback: T) =>
  (failure: unknown): T => {
    $.ui.log(`${doing} failed: ${reasonOf(failure)}`, { to: 'debug' })

    return fallback
  }

// --- Settings: this session's, saved for its project or for every project ---

// The store's key for the session's project; none where the session tells no root.
const projectKey = async ($: EngineInterface) => {
  const root = await $.session.root().catch(orElse($, 'reading the project root', null))

  return projectKeyOf(root)
}

// The settings a session starts with: its project's, else the global ones,
// else the defaults.
const loadSettings = async ($: EngineInterface) => {
  const key = await projectKey($)
  const reading = orElse($, 'reading the saved settings', undefined)
  const project = key === undefined ? undefined : await $.store.get(key).catch(reading)
  const global = await $.store.get('settings').catch(reading)

  await update($, settings, () => loaded(project ?? global))
  await update($, origin, () => provenanceOf(project, global))
}

// Unsaved while the session's settings differ from what they came from: the
// project's saved ones, the global ones or the defaults.
const isUnsaved = async ($: EngineInterface, now: Preferences) => {
  const { source } = await read($, origin)
  const key = source === 'project' ? await projectKey($) : 'settings'
  const saved =
    source === 'defaults' || key === undefined
      ? DEFAULTS
      : loaded(await $.store.get(key).catch(orElse($, 'reading the saved settings', undefined)))

  return differs(now, saved)
}

// A change holds for this session alone, until it is saved.
const change = async ($: EngineInterface, patch: Partial<Preferences>) => {
  // The patch lands on the settings as they stand when it is written, so quick clicks keep each other's.
  const changed = await update($, settings, current => ({ ...current, ...patch }))
  const unsaved = await isUnsaved($, changed)
  await update($, origin, now => ({ ...now, isChanged: unsaved }))
}

const save = async ($: EngineInterface, where: 'project' | 'global') => {
  const key = where === 'project' ? await projectKey($) : 'settings'

  if (key === undefined) {
    $.ui.toast(TEXT.noProject)

    return
  }

  // A save that fails is not marked as saved: the pane keeps showing the changes as unsaved.
  try {
    await $.store.set(key, await read($, settings))
  } catch (failure) {
    orElse($, 'saving the settings', undefined)(failure)
    $.ui.toast(TEXT.cannotSave(reasonOf(failure)))

    return
  }

  await update($, origin, now => savedAs(now, where))
}

// The project's saved settings dropped: the session takes the global ones,
// else the defaults. Where they cannot be dropped, the session keeps its own.
const forgetProject = async ($: EngineInterface) => {
  const key = await projectKey($)

  if (key !== undefined) {
    try {
      await $.store.delete(key)
    } catch (failure) {
      orElse($, "forgetting the project's settings", undefined)(failure)
      $.ui.toast(TEXT.cannotForget(reasonOf(failure)))

      return
    }
  }

  await loadSettings($)
}

// Where a shell `cd` took the session, kept while the session itself still
// reports the folder it did when the move was told: Claude Code tells the
// move, and whether `$.session.cwd()` follows it is not promised.
let moved: Moved | undefined

// The session's folder, or the one a move took it to while the session has not
// moved since.
const folderOf = async ($: EngineInterface) => {
  const now = await $.session.cwd().catch(orElse($, "reading the session's folder", null))
  const to = stillMoved(moved, now)

  if (to !== undefined) {
    return to
  }

  moved = undefined

  return now
}

const locate = async ($: EngineInterface) => {
  const cwd = await folderOf($)
  const home = await $.env.get('HOME').catch(orElse($, 'reading HOME', undefined))

  await update($, place, () => placeOf(cwd, home))
}

// The settings and the folder read again. Run by session.start, and by the
// first drawing where a resumed session drew before session.start reached
// this mod. A start that fails says why in the debug log and lets the next
// drawing try again.
const start = async ($: EngineInterface) => {
  hasStarted = true
  moved = undefined

  try {
    await loadSettings($)
    await locate($)
  } catch (failure) {
    hasStarted = false
    orElse($, 'starting', undefined)(failure)
  }
}

// The panel away when it is up, back when it is not.
const togglePane = async ($: EngineInterface) => {
  if ((await $.ui.panes()).some(pane => pane.id === PANE)) {
    await $.ui.close({ id: PANE })

    return
  }

  await $.ui.open({ id: PANE, title: TEXT.title })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await start($)

    return next(e)
  })

  // `/cd` and a shell `cd` take the session elsewhere, as the move tells it;
  // later reads stay there while the session's folder is still the one it
  // reported at the move.
  on('classic.CwdChanged', async ($, e, next) => {
    const done = await next(e)
    moved = {
      to: e.new_cwd,
      reported: await $.session.cwd().catch(orElse($, "reading the session's folder", null)),
    }
    await locate($)

    return done
  }).catch(($, e, next) => next(e))

  // A worktree move, told by no move: read again as a turn of the main loop
  // ends. A subagent's end would read its own folder.
  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      await locate($)
    }

    return next(e)
  })

  // The footer's last slot row, after bar-git's, whatever order the mods run
  // in. A long path gives way at its start, so the project's folder stays;
  // no zsh arrow, which told the last command's status there and here tells nothing.
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    // Drawing writes no state: the start runs on a timer of its own.
    if (!hasStarted) {
      hasStarted = true
      $.clock.after(0, () => void start($))
    }

    const beneath = await next(e)
    const found = await read($, place)

    // The desktop app tells the session's folder itself.
    if (found === null || e.surface === 'desktop') {
      return beneath
    }

    const s = await read($, settings)
    const { Box, Button, Link, Text } = $.ui.resolve(e)
    const { name, parents } = pathOf(found, s)

    return slotted(
      beneath,
      <Box key="slot:10.1:bar-path" width="100%">
        <Box flexShrink={1}>
          {s.showParents && (
            <Text wrap="truncate-start" color={s.parentColor}>
              {parents}
            </Text>
          )}
        </Box>
        {/* The folder's name opens it, as a file link does: underlined, as the link draws itself. */}
        <Box flexShrink={0}>
          <Link href={fileUrl(found.cwd)}>
            <Text color={s.nameColor} weight="semibold">
              {name}
            </Text>
          </Link>
          <Text> </Text>
          <Button key="bar-path-settings" plain dimColor label="⚙" onPress={() => void togglePane($)} />
        </Box>
      </Box>,
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Input, Text } = $.ui.resolve(e)
    const s = await read($, settings)
    const o = await read($, origin)
    // No surface draws a native checkbox. As in the companion's pane: a switch
    // on a full square, one off an empty square, dim.
    const check = (key: string, label: string, isChecked: boolean, toggle: () => void) => (
      <Button key={key} plain dimColor={!isChecked} onPress={toggle}>
        {isChecked ? '■' : '□'} {label}
      </Button>
    )
    const heading = (text: string) => <Text weight="semibold">{text}</Text>
    // The terminal draws a field as bare text: a ground of its own marks it, its label beside.
    const field = (key: Words, label: string, isValid: (text: string) => boolean, refusal: string) => (
      <Box key={`field-${key}`} flexDirection="row" gap={1}>
        <Text>{label}</Text>
        <Box backgroundColor={e.surface === 'terminal' ? 'subtle' : undefined}>
          <Input
            key={key}
            value={s[key]}
            onSubmit={value => {
              const { text, isRefused } = entered(value, isValid)

              if (isRefused) {
                $.ui.toast(refusal)

                return
              }

              void change($, { [key]: text })
            }}
          />
        </Box>
      </Box>
    )

    return (
      <Box flexDirection="column" paddingTop={1} rowGap={1}>
        <Box flexDirection="column">
          <Text>
            {TEXT.sources[o.source]}
            {o.isChanged && <Text color="warning">{TEXT.unsaved}</Text>}
          </Text>
          {o.hasProject && o.source !== 'project' && <Text dimColor>{TEXT.projectHasOwn}</Text>}
          <Text dimColor>{TEXT.scope}</Text>
        </Box>
        <Box flexDirection="column">
          {heading(TEXT.parts)}
          {PARTS.map(([key, label]) => check(key, label, s[key], () => void change($, { [key]: !s[key] })))}
        </Box>
        <Box flexDirection="column">
          {heading(TEXT.colors)}
          <Text dimColor>{TEXT.colorsNote}</Text>
          {COLORS.map(([key, label]) => (
            <Box key={`swatch.${key}`} flexDirection="row" gap={1}>
              <Text color={s[key]}>■</Text>
              {field(key, label, isColor, TEXT.notAColor)}
            </Box>
          ))}
        </Box>
        <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
          <Button
            key="save-project"
            variant={o.isChanged ? 'primary' : 'secondary'}
            label={TEXT.saveProject}
            onPress={() => void save($, 'project')}
          />
          <Button
            key="save-global"
            variant="secondary"
            label={TEXT.saveGlobal}
            onPress={() => void save($, 'global')}
          />
          {o.hasProject && (
            <Button
              key="forget-project"
              variant="secondary"
              label={TEXT.forgetProject}
              onPress={() => void forgetProject($)}
            />
          )}
          <Button key="reset" variant="secondary" label={TEXT.reset} onPress={() => void change($, DEFAULTS)} />
        </Box>
      </Box>
    )
  })
}
