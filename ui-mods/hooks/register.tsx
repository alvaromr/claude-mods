import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderSurface } from 'claude-code'

import type { Mod } from '../types'
import { failureOf, messageOf, switchArgs } from './cli'
import type { RowsProps } from './list'
import { isMod, keyOf, listedMods, modOf } from './mods'
import type { Installed } from './mods'
import { activeOf, BOXES, groupsOf, hoverBgOf } from './pane'
import { slotted } from './slots'
import { flipped, folded, pressOf, restored, switchable, withSwitch } from './switches'
import { TEXT } from './text'

const PANE = 'mods'

const mods = atom({ plugin: 'ui-mods', key: 'mods' } as const, [])
const shown = atom({ plugin: 'ui-mods', key: 'shown' } as const, [])
const pending = atom({ plugin: 'ui-mods', key: 'pending' } as const, [])
const error = atom({ plugin: 'ui-mods', key: 'error' } as const, null)

type Engine = Pick<EngineInterface, 'command' | 'fs' | 'process' | 'prompt' | 'settings' | 'state' | 'ui'>

// The CLI keeps the installed plugins and their switch in settings, whatever
// marketplace or scope they come from.
const claude = async ($: Engine, args: readonly string[]) => {
  const result = await $.process.run(['claude', 'plugin', ...args])

  if (result.exitCode !== 0) {
    throw new Error(failureOf(args, result))
  }

  return result.stdout
}

const json = ($: Engine, path: string): Promise<Record<string, unknown> | undefined> =>
  $.fs
    .read(path)
    .then(text => JSON.parse(text) as Record<string, unknown>)
    .catch((failure: unknown) => {
      $.ui.log(`reading ${path} failed: ${messageOf(failure)}`, { to: 'debug' })

      return undefined
    })

const asMod = async ($: Engine, plugin: Installed): Promise<Mod[]> => {
  if (!isMod(await json($, `${plugin.installPath}/hooks/hooks.json`))) {
    return []
  }

  return [modOf(plugin, await json($, `${plugin.installPath}/.claude-plugin/plugin.json`))]
}

// How many switches were pressed, how many are not settled, and the line they
// wait on: the CLI writes the settings file, so two at once race on it, and a
// list read while one was pressed or running is older than it.
let switched = 0
let running = 0
let line: Promise<void> = Promise.resolve()
// What the switches that failed said, for the pane once the list is read again.
const refused: string[] = []

// Reads the list once no switch is pending or running, and again if one was
// pressed meanwhile: what is drawn is never a read older than a switch.
const refresh = async ($: Engine) => {
  try {
    for (;;) {
      await line

      const before = switched
      const installed = JSON.parse(await claude($, ['list', '--json'])) as Installed[]
      const listed = (await Promise.all(installed.map(plugin => asMod($, plugin)))).flat()
      const all = listedMods(listed, await $.settings.read({ key: 'enabledPlugins' }))

      if (switched === before && running === 0) {
        await update($, mods, () => all)
        await update($, error, () => null)

        return
      }
    }
  } catch (failure) {
    await update($, error, () => messageOf(failure))
  }
}

// Drawn switched at once: the CLI takes about half a second. The switches run
// one after another, and once the last has, the list is read back: what is
// drawn is then what is saved, and a failed one says why.
const toggle = async ($: Engine, mod: Mod) => {
  const key = keyOf(mod)
  const flip = (keys: string[]) => flipped(keys, key)

  switched++
  running++
  await update($, mods, list => withSwitch(list, key, !mod.isEnabled))
  // Switched twice is back to what the session runs.
  await update($, pending, flip)

  line = line.then(async () => {
    try {
      await claude($, switchArgs(mod))
    } catch (failure) {
      await update($, pending, flip)
      refused.push(messageOf(failure))
    } finally {
      running--
    }
  })
  await line

  if (running === 0) {
    await refresh($)

    if (refused.length > 0) {
      await update($, error, () => refused.splice(0).join('\n'))
    }
  }
}

// What each of the pane's commands does, as a toast says it.
const DOES = { 'reload-plugins': TEXT.doesReload, restart: TEXT.doesRestart }

// The desktop app refuses a command run by a mod, as from a remote
// connection, so there it is left in the prompt box for the person's Enter.
// Elsewhere it runs as the person typing it would, once the session is idle.
const run = async ($: Engine, surface: RenderSurface, command: keyof typeof DOES) => {
  if (surface === 'desktop') {
    const { isFilled } = await $.prompt.fill({ text: `/${command}` })
    $.ui.toast(isFilled ? TEXT.pressEnter(DOES[command]) : TEXT.typeCommand(command, DOES[command]))

    return
  }

  await $.command.run({ command }).catch((failure: unknown) => {
    $.ui.toast(TEXT.couldNot(DOES[command], messageOf(failure)))
  })
}

// The panel away when it is up, back when it is not, the list read again.
// Resolves whether it is up now.
const togglePane = async ($: Engine) => {
  if ((await $.ui.panes()).some(pane => pane.id === PANE)) {
    await $.ui.close({ id: PANE })

    return false
  }

  await $.ui.open({ id: PANE, title: TEXT.title })
  void refresh($)

  return true
}

// The button, first in the first slot row: in the terminal, of the prompt's
// footer; in the desktop app, whose footer is one short line that hides what
// does not fit, of the band above the prompt.
const drawn = ($: Engine, { Box, Button }: Pick<ReturnType<EngineInterface['ui']['resolve']>, 'Box' | 'Button'>) => (
  <Box key="slot:1.1:ui-mods">
    <Button key="mods" plain dimColor label="mods" onPress={() => void togglePane($)} />
  </Box>
)

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'mods',
      description: TEXT.commandDescription,
    })

    // A reload runs this again with the panel still up: the read the old
    // module started died with it.
    if ((await $.ui.panes()).some(pane => pane.id === PANE)) {
      void refresh($)
    }

    return next(e)
  })

  // Whoever runs it in this session, the button or the person, the switches
  // are applied once it has, and the list is read again, a plugin installed
  // or removed since. A reload in another session applies nothing here.
  on('command.run', { command: 'reload-plugins' }, async ($, e, next) => {
    // Cleared before the reload, not after: one that reloads this mod too may
    // not return to do it. A reload that fails puts the switches back.
    const unapplied = await read($, pending)
    await update($, pending, () => [])

    try {
      return await next(e)
    } catch (failure) {
      await update($, pending, now => restored(unapplied, now))

      throw failure
    } finally {
      void refresh($)
    }
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'mods' }, async $ => ({
    text: (await togglePane($)) ? TEXT.paneOpened : TEXT.paneClosed,
  }))

  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const beneath = await next(e)

    return e.surface === 'desktop' ? beneath : slotted(beneath, drawn($, $.ui.resolve(e)))
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const beneath = await next(e)

    return e.surface !== 'desktop' || e.props.hasSurvey ? beneath : slotted(beneath, drawn($, $.ui.resolve(e)))
  })

  // The rows' presses: the checkbox switches its mod, the rest of the row unfolds it.
  on('ui.message', async ($, e, next) => {
    if (e.requestId !== PANE || e.element !== 'rows') {
      return next(e)
    }

    const { toggle: key, fold } = pressOf(e.data)
    const mod = switchable(await read($, mods), key)

    if (mod !== undefined) {
      void toggle($, mod)
    }

    if (fold !== undefined) {
      await update($, shown, ids => folded(ids, fold))
    }

    return {}
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const elements = $.ui.resolve(e)
    const { Box, Button, Text } = elements
    const listed = await read($, mods)
    const unfolded = await read($, shown)
    const changed = await read($, pending)
    const failed = await read($, error)
    const active = activeOf(listed)
    const rows: RowsProps = {
      groups: groupsOf(listed, changed, unfolded),
      boxes: BOXES,
      hoverBg: hoverBgOf(e.surface),
    }

    return (
      <Box flexDirection="column" paddingTop={1} rowGap={1}>
        <Box flexDirection="row" justifyContent="space-between" alignItems="center">
          <Text>
            <Text weight="semibold">{active}</Text>
            <Text dimColor>{TEXT.active(listed.length)}</Text>
            {changed.length > 0 && <Text color="warning">{TEXT.unapplied(changed.length)}</Text>}
          </Text>
          <Box flexDirection="row" gap={1}>
            <Button
              key="restart"
              variant="secondary"
              label={TEXT.restart}
              onPress={press => void run($, press.surface, 'restart')}
            />
            <Button
              key="reload"
              variant={changed.length > 0 ? 'primary' : 'secondary'}
              label={TEXT.reload}
              onPress={press => void run($, press.surface, 'reload-plugins')}
            />
          </Box>
        </Box>
        {failed !== null && <Text color="error">{failed}</Text>}
        {listed.length === 0 && failed === null && <Text dimColor>{TEXT.searching}</Text>}
        {/* The rows' surface module runs where a Client is drawn: the terminal and the desktop app. */}
        {'Client' in elements ? (
          <elements.Client key="rows" module="./rows.tsx" props={rows} />
        ) : (
          <Text dimColor>{TEXT.noList}</Text>
        )}
      </Box>
    )
  })
}
