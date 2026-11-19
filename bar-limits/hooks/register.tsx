import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { Limit, Preferences } from '../types'
import { reasonOf } from './failure'
import { modelsOf, windowsOf } from './limits'
import {
  COLORS,
  COUNTS,
  CYCLE_SECONDS,
  DEFAULTS,
  LABELS,
  NOTES,
  PARTS,
  WINDOWS,
  asColor,
  asLabel,
  countOf,
  differs,
  entered,
  loaded,
  projectKeyOf,
  provenanceOf,
  savedAs,
} from './preferences'
import type { Flag, Words } from './preferences'
import { cycled, runsOf, shownOf } from './readout'
import type { Run } from './readout'
import { slotted } from './slots'
import { TEXT } from './text'
import { cycleMs, fetchWait } from './timing'

const PANE = 'bar-limits'
// The account's usage as /usage reads it: the one place a model's own weekly
// limit (Fable) is told, read at most once a minute.
const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage'
// The times to reset count down against the clock: the line is drawn again each minute.
const REDRAW_EVERY_MS = 60_000

const limits = atom({ plugin: 'bar-limits', key: 'limits' } as const, [])
const models = atom({ plugin: 'bar-limits', key: 'models' } as const, [])
const settings = atom({ plugin: 'bar-limits', key: 'settings' } as const, DEFAULTS)
const origin = atom({ plugin: 'bar-limits', key: 'origin' } as const, {
  source: 'defaults',
  isChanged: false,
  hasProject: false,
})
const view = atom({ plugin: 'bar-limits', key: 'view' } as const, 0)

type Engine = EngineInterface
type Elements = ReturnType<EngineInterface['ui']['resolve']>

// The module's own: they start over with a reload, as register and session.start run again.
let fetchedAt = -Infinity
let ticker: Timer | undefined
let redraw: Timer | undefined
let hasStarted = false

/**
 * Keeps the latest reading, for the next session too until a response reports
 * again. A store that cannot keep it leaves the reading on screen for this
 * session, its cause in the debug log.
 */
const remember = async ($: Engine, found: Limit[]) => {
  if (found.length > 0) {
    await update($, limits, () => found)
    await $.store.set('limits', found).catch(orElse($, 'keeping the last reading', undefined))
  }
}

/** A call that failed gives `fallback`, the mod showing less, and its cause goes to the debug log. */
const orElse =
  <T,>($: Engine, doing: string, fallback: T) =>
  (failure: unknown): T => {
    $.ui.log(`${doing} failed: ${reasonOf(failure)}`, { to: 'debug' })

    return fallback
  }

// The engine holds the session's credential: off a subscription the endpoint
// refuses, and the last reading stays, why in the debug log.
// A read asked for too soon after the last one is made once that wait is over,
// so the last change of the windows is read too.
let trailing: Timer | undefined

const fetchModels = async ($: Engine) => {
  const now = await $.clock.now()
  const wait = fetchWait(now, fetchedAt)

  if (wait > 0) {
    trailing ??= $.clock.after(wait, () => {
      trailing = undefined
      void fetchModels($)
    })

    return
  }

  fetchedAt = now

  try {
    const auth = (await $.session.authorize())?.handle

    if (auth === undefined) {
      return
    }

    const { ok, status, text } = await $.http.fetch(USAGE_URL, {
      auth,
      headers: { 'anthropic-beta': 'oauth-2025-04-20' },
    })

    if (!ok) {
      throw new Error(`status ${status}`)
    }

    const found = modelsOf(text)
    await update($, models, () => found)
    await $.store.set('models', found)
  } catch (failure) {
    orElse($, 'reading the usage endpoint', undefined)(failure)
  }
}

const cycleOn = ($: Engine, s: Preferences) => {
  const every = cycleMs(s)

  ticker?.cancel()
  ticker = every === undefined ? undefined : $.clock.every(every, () => void update($, view, n => n + 1))
}

// --- Settings: this session's, saved for its project or for every project ---

// The store's key for the session's project; none where the session tells no root.
const projectKey = async ($: Engine) => {
  const root = await $.session.root().catch(orElse($, 'reading the project root', null))

  return projectKeyOf(root)
}

// The settings a session starts with: its project's, else the global ones,
// else the defaults; the cycle set going by them.
const loadSettings = async ($: Engine) => {
  const key = await projectKey($)
  const reading = orElse($, 'reading the saved settings', undefined)
  const project = key === undefined ? undefined : await $.store.get(key).catch(reading)
  const global = await $.store.get('settings').catch(reading)
  const s = loaded(project ?? global)

  await update($, settings, () => s)
  await update($, origin, () => provenanceOf(project, global))
  cycleOn($, s)
}

// Unsaved while the session's settings differ from what they came from: the
// project's saved ones, the global ones or the defaults.
const isUnsaved = async ($: Engine, now: Preferences) => {
  const { source } = await read($, origin)
  const key = source === 'project' ? await projectKey($) : 'settings'
  const saved =
    source === 'defaults' || key === undefined
      ? DEFAULTS
      : loaded(await $.store.get(key).catch(orElse($, 'reading the saved settings', undefined)))

  return differs(now, saved)
}

// A change holds for this session alone, until it is saved.
const change = async ($: Engine, patch: Partial<Preferences>) => {
  // The patch lands on the settings as they stand when it is written, so quick clicks keep each other's.
  const changed = await update($, settings, current => ({ ...current, ...patch }))
  const unsaved = await isUnsaved($, changed)
  await update($, origin, now => ({ ...now, isChanged: unsaved }))
  cycleOn($, changed)
}

const save = async ($: Engine, where: 'project' | 'global') => {
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
const forgetProject = async ($: Engine) => {
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

// The settings and the last readings, read again; the line kept counting down.
// Run by session.start, and by the first drawing where a resumed session drew
// before session.start reached this mod. A start that fails says why in the
// debug log and lets the next drawing try again.
const start = async ($: Engine) => {
  hasStarted = true

  try {
    await loadSettings($)

    const reading = orElse($, 'reading the last readings', undefined)
    const [savedLimits, savedModels] = [
      await $.store.get('limits').catch(reading),
      await $.store.get('models').catch(reading),
    ]
    if (Array.isArray(savedLimits)) await update($, limits, () => savedLimits as Limit[])
    if (Array.isArray(savedModels)) await update($, models, () => savedModels as Limit[])

    const usage = await $.session.usage().catch(orElse($, "reading the session's usage", undefined))
    await remember($, windowsOf(usage?.rateLimits ?? []))
    void fetchModels($)
    redraw?.cancel()
    redraw = $.clock.every(REDRAW_EVERY_MS, () => {
      $.ui.invalidate('ui.render')
    })
  } catch (failure) {
    hasStarted = false
    orElse($, 'starting', undefined)(failure)
  }
}

// The panel away when it is up, back when it is not.
const togglePane = async ($: Engine) => {
  if ((await $.ui.panes()).some(pane => pane.id === PANE)) {
    await $.ui.close({ id: PANE })

    return
  }

  await $.ui.open({ id: PANE, title: TEXT.title })
}

// A row of its own, the first of the slot rows, where the status line drew it:
// the windows, all in a line or one at a time that a click passes on, and the
// ⚙ that opens the settings, which stays when no window is shown.
const drawn = async ($: Engine, { Box, Button, Text }: Pick<Elements, 'Box' | 'Button' | 'Text'>) => {
  // Drawing writes no state: the start runs on a timer of its own.
  if (!hasStarted) {
    hasStarted = true
    $.clock.after(0, () => void start($))
  }

  const s = await read($, settings)
  const now = await $.clock.now()
  const shown = shownOf(await read($, limits), await read($, models), s)
  const texts = (runs: Run[], at: number) =>
    runs.map((run, i) => (
      <Text key={`${at}.${i}`} color={run.color} weight={run.isBold ? 'semibold' : undefined}>
        {run.text}
      </Text>
    ))
  const one = cycled(shown, s, await read($, view))

  return (
    <Box key="slot:0.1:bar-limits" flexDirection="row" gap={1}>
      {one !== undefined ? (
        <Button key="bar-limits-next" plain onPress={() => void update($, view, n => n + 1)}>
          {texts(runsOf(one, s, now), 0)}
        </Button>
      ) : (
        shown.length > 0 && (
          <Box flexShrink={1}>
            <Text wrap="truncate-end">
              {shown.flatMap((limit, at) => [
                ...(at > 0
                  ? [
                      <Text key={`sep.${at}`} dimColor>
                        {' · '}
                      </Text>,
                    ]
                  : []),
                ...texts(runsOf(limit, s, now), at),
              ])}
            </Text>
          </Box>
        )
      )}
      <Box flexShrink={0}>
        <Button key="bar-limits-settings" plain dimColor label="⚙" onPress={() => void togglePane($)} />
      </Box>
    </Box>
  )
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await start($)

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await remember($, windowsOf(e.rateLimits))

    if (e.changed.includes('rateLimits')) {
      void fetchModels($)
    }

    return next(e)
  })

  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const beneath = await next(e)

    return e.surface === 'desktop' ? beneath : slotted(beneath, await drawn($, $.ui.resolve(e)))
  })

  // The desktop app's footer is one short line that hides what does not fit:
  // there the row is in the band above the prompt.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const beneath = await next(e)

    return e.surface !== 'desktop' || e.props.hasSurvey ? beneath : slotted(beneath, await drawn($, $.ui.resolve(e)))
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Input, Text } = $.ui.resolve(e)
    const s = await read($, settings)
    const o = await read($, origin)
    // No surface draws a native checkbox or radio. As in the companion's pane:
    // the option picked a pill, the others dim to press; a switch on a full
    // square, one off an empty square, dim.
    const pill = (key: string, label: string, isPicked: boolean, pick: () => void) =>
      isPicked ? (
        <Text weight="semibold" inverse>{` ${label} `}</Text>
      ) : (
        <Button key={key} plain dimColor label={label} onPress={pick} />
      )
    const check = (key: string, label: string, isChecked: boolean, toggle: () => void) => (
      <Button key={key} plain dimColor={!isChecked} onPress={toggle}>
        {isChecked ? '■' : '□'} {label}
      </Button>
    )
    // The terminal draws a field as bare text: a ground of its own marks it, its label beside.
    const field = (key: string, label: string, input: JSX.Element) => (
      <Box key={`field-${key}`} flexDirection="row" gap={1}>
        <Text>{label}</Text>
        <Box backgroundColor={e.surface === 'terminal' ? 'subtle' : undefined}>{input}</Box>
      </Box>
    )
    const heading = (text: string) => <Text weight="semibold">{text}</Text>
    const switches = (fields: [Flag, string][]) =>
      fields.map(([key, label]) => check(key, label, s[key], () => void change($, { [key]: !s[key] })))
    // `refusal` says what is wrong with a text the field cannot hold, nothing for one it can.
    const words = (key: Words, label: string, refusal: (text: string) => string | undefined) =>
      field(
        key,
        label,
        <Input
          key={key}
          value={s[key]}
          onSubmit={value => {
            const { text, refused } = entered(value, refusal)

            if (refused !== undefined) {
              $.ui.toast(refused)

              return
            }

            void change($, { [key]: text })
          }}
        />,
      )
    const count = ([key, label, min, max]: (typeof COUNTS)[number]) =>
      field(
        key,
        label,
        <Input
          key={key}
          value={String(s[key])}
          onSubmit={value => {
            const n = countOf(value, min, max)

            if (n === undefined) {
              $.ui.toast(TEXT.wholeNumber(min, max))

              return
            }

            void change($, { [key]: n })
          }}
        />,
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
          {heading(TEXT.windows)}
          {switches(WINDOWS)}
        </Box>
        <Box flexDirection="column">
          {heading(TEXT.parts)}
          {switches(PARTS)}
        </Box>
        <Box flexDirection="column">
          {heading(TEXT.mode)}
          {/* Options a click picks, not a Select, which only the keyboard drives. */}
          {[
            { isCycle: false, label: TEXT.modeAll },
            { isCycle: true, label: TEXT.modeOne },
          ].map(({ isCycle, label }) =>
            pill(isCycle ? 'cycle' : 'all', label, isCycle === s.cycle, () => void change($, { cycle: isCycle })),
          )}
          {count(CYCLE_SECONDS)}
        </Box>
        <Box flexDirection="column">
          {heading(TEXT.labels)}
          {LABELS.map(([key, label]) => words(key, label, asLabel))}
        </Box>
        <Box flexDirection="column">
          {heading(TEXT.colors)}
          <Text dimColor>{TEXT.colorsNote}</Text>
          {COLORS.map(([key, label]) => (
            <Box key={`swatch.${key}`} flexDirection="row" gap={1}>
              <Text color={s[key]}>■</Text>
              {words(key, label, asColor)}
            </Box>
          ))}
        </Box>
        <Box flexDirection="column">
          {heading(TEXT.thresholds)}
          {COUNTS.slice(1, 3).map(count)}
        </Box>
        <Box flexDirection="column">
          {heading(TEXT.pace)}
          <Text dimColor>{TEXT.paceNote}</Text>
          {COUNTS.slice(3).map(field => (
            <Box key={`note.${field[0]}`} flexDirection="column" paddingTop={1}>
              {count(field)}
              <Text dimColor>{NOTES[field[0]]}</Text>
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
