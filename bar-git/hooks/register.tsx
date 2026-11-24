import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { Preferences, Repo } from '../types'
import { reasonOf } from './failure'
import { nextMove } from './moves'
import type { Move } from './moves'
import {
  COLORS,
  DEFAULTS,
  PARTS,
  TEXTS,
  differs,
  entered,
  isColor,
  isLength,
  loaded,
  projectKeyOf,
  provenanceOf,
  savedAs,
} from './preferences'
import type { Words } from './preferences'
import { isRead, readOf, repoOf } from './repo'
import { asCommand, rowOf } from './row'
import { slotted } from './slots'
import { TEXT } from './text'

const PANE = 'bar-git'

const repo = atom({ plugin: 'bar-git', key: 'repo' } as const, null)
const settings = atom({ plugin: 'bar-git', key: 'settings' } as const, DEFAULTS)
const origin = atom({ plugin: 'bar-git', key: 'origin' } as const, {
  source: 'defaults',
  isChanged: false,
  hasProject: false,
})

/** A call that failed gives `fallback`, the mod showing less, and its cause goes to the debug log. */
const orElse =
  <T,>($: EngineInterface, doing: string, fallback: T) =>
  (failure: unknown): T => {
    $.ui.log(`${doing} failed: ${reasonOf(failure)}`, { to: 'debug' })

    return fallback
  }

// The repository of `cwd`, by default the session's folder. Each part is read
// on its own: one that fails (a tree so big that git outlasts `READ_MS`) leaves
// that part out, with its cause in the debug log, and not the whole row.
const inspect = async ($: EngineInterface, cwd?: string): Promise<Repo | null> => {
  const at = readOf(cwd)
  const run = (doing: string, argv: string[]) => $.process.run(argv, at).catch(orElse($, doing, undefined))
  const [status, lines, unpushed] = await Promise.all([
    run('running git status', ['git', '--no-optional-locks', 'status', '--porcelain=v2', '--branch', '-uall']),
    run('counting the changed lines', ['sh', `${$.plugin.root}/scripts/lines.sh`]),
    run('counting the commits no remote has', ['sh', `${$.plugin.root}/scripts/unpushed.sh`]),
  ])

  if (!isRead(status)) {
    return null
  }

  return repoOf(status.stdout, lines, unpushed)
}

// The newest read wins: one that started earlier and ends later is dropped,
// and with it a slow git run's out-of-date answer.
let latest = 0

let moved: Move

// The folder to read, none for the session's own.
const folderOf = async ($: EngineInterface) => {
  if (moved === undefined) {
    return undefined
  }

  const now = await $.session.cwd().catch(orElse($, "reading the session's folder", null))

  moved = nextMove(moved, { kind: 'read', now })

  return moved?.to
}

const refresh = async ($: EngineInterface) => {
  const mine = ++latest
  const found = await inspect($, await folderOf($))

  if (mine === latest) {
    await update($, repo, () => found)
  }
}

// The tools that may change the repository, and how long they stay still
// before it is read again.
const CHANGERS = new Set(['Bash', 'Edit', 'Write', 'NotebookEdit'])
const SETTLE_MS = 1000
let settling: Timer | undefined

// The settings and the repository read again. Run by session.start, which
// every fresh load of this mod raises, a reload's too; a drawing before it
// shows the defaults, as drawing writes no state. A start that fails says why
// in the debug log.
const start = async ($: EngineInterface) => {
  moved = nextMove(moved, { kind: 'started' })

  try {
    await loadSettings($)
    await refresh($)
  } catch (failure) {
    orElse($, 'starting', undefined)(failure)
  }
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

  // A turn of the main loop that ends; a subagent's would read its own folder.
  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      await refresh($)
    }

    return next(e)
  })

  // A tool that may change the repository (a checkout, a commit, an edit)
  // within a long turn: read once the tools have been still for a while, on a
  // timer, which runs in the session's folder whoever called the tool.
  on('classic.PostToolUse', async ($, e, next) => {
    const done = await next(e)

    if (CHANGERS.has(e.tool_name)) {
      settling?.cancel()
      settling = $.clock.after(SETTLE_MS, () => void refresh($))
    }

    return done
  }).catch(($, e, next) => next(e))

  // `/cd` and a shell `cd` take the session to another folder, maybe another
  // repository: read where the move tells, and later reads stay there while
  // the session's folder is still the one it reported at the move.
  on('classic.CwdChanged', async ($, e, next) => {
    const done = await next(e)
    const reported = await $.session.cwd().catch(orElse($, "reading the session's folder", null))
    moved = nextMove(moved, { kind: 'moved', to: e.new_cwd, reported })
    await refresh($)

    return done
  }).catch(($, e, next) => next(e))

  // The last of the footer's slot rows, under what is drawn there beneath (the
  // engine's mode labels, the other mods' rows), whatever order the mods run
  // in; the whole width, so the footer goes under the status line instead of
  // beside it. The branch alone gives way: cut at the row's end so the counts
  // and buttons fit.
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const beneath = await next(e)
    const found = await read($, repo)
    const s = await read($, settings)
    const row = rowOf(found, s, e.surface)

    if (found === null || row === null) {
      return beneath
    }

    const { isTerminal, hasCommit, hasIntegrate, hasLines, hasChanges, hasAhead, hasHead } = row
    const { Box, Button, Text } = $.ui.resolve(e)
    // A prompt goes to the model as the person's; a slash command (`/commit`),
    // which a mod may not submit as a prompt, runs as the person typing it would.
    const send = (text: string) => () => {
      const slash = asCommand(text)

      void (slash === undefined ? $.prompt.submit({ text, asUser: true }) : $.command.run(slash)).catch(
        (failure: unknown) => {
          $.ui.toast(TEXT.commandFailed(text, reasonOf(failure)))
        },
      )
    }
    // The parts after the branch, each led by a dot but the first.
    const counts = [
      hasChanges && (
        <Text key="changes">
          {s.showFiles && <Text color={s.mutedColor}>{TEXT.files(found.dirty)}</Text>}
          {hasLines && <Text color={s.addedColor}>{`${s.showFiles ? ' ' : ''}+${found.added}`}</Text>}
          {hasLines && <Text color={s.removedColor}> -{found.removed}</Text>}
        </Text>
      ),
      hasAhead && (
        <Text key="ahead" color={s.mutedColor}>
          {TEXT.ahead(found.ahead)}
        </Text>
      ),
      hasCommit && <Button key="commit" plain label={s.commitLabel} onPress={send(s.commitPrompt)} />,
      hasIntegrate && <Button key="integrate" plain label={s.integrateLabel} onPress={send(s.integratePrompt)} />,
    ].filter(part => part !== false)

    return slotted(
      beneath,
      <Box key="slot:9.1:bar-git" width="100%">
        {hasHead && (
          <Box flexShrink={1}>
            <Text wrap="truncate-end">
              {s.showIcon && s.icon !== '' && <Text color={s.iconColor}>{`${s.icon} `}</Text>}
              {s.showBranch && <Text color={s.branchColor}>{found.branch}</Text>}
            </Text>
          </Box>
        )}
        <Box flexShrink={0}>
          {counts.flatMap((part, at) => [
            ...(isTerminal && (at > 0 || hasHead)
              ? [
                  <Text key={`sep.${at}`} color={s.mutedColor}>
                    {' · '}
                  </Text>,
                ]
              : []),
            part,
          ])}
          {isTerminal && <Text> </Text>}
          {isTerminal && <Button key="bar-git-settings" plain dimColor label="⚙" onPress={() => togglePane($)} />}
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
          {heading(TEXT.texts)}
          {TEXTS.map(([key, label, min, max]) =>
            field(key, label, text => isLength(text, min, max), TEXT.length(min, max)),
          )}
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
