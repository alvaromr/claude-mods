import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { Preferences, Ttl } from '../types'
import { reasonOf } from './failure'
import { EFFORTS, MODELS, aliasOf, clickable, toggled } from './picker'
import {
  cachedTokens,
  coldOf,
  isMiss,
  isResume,
  isTtl,
  missCause,
  resumedAt,
  rewarmed,
  ttlOfPlan,
  ttlSaid,
  writtenTtl,
} from './prompt-cache'
import {
  COLORS,
  COUNTS,
  DEFAULTS,
  LABELS,
  PARTS,
  TTLS,
  colorProblem,
  countOf,
  differs,
  entered,
  labelProblem,
  loaded,
  projectKeyOf,
  provenanceOf,
  savedAs,
} from './preferences'
import type { Words } from './preferences'
import { compactShare, runsOf, short, warningShown } from './readout'
import { placed } from './slots'
import { TEXT } from './text'
import { effortStarted, fillAfter, fillAtStart, isTimed, modelAsked, modelNamed, speedAfter } from './usage'

const PANE = 'bar-context'
const EVERY_MS = 15_000

// Claude Code tells a mod nothing of the prompt cache, so its state is worked
// out here as Claude Code works it out for the status line: the cache lives one
// lifetime from the main conversation's last request, sent or answered. `warm`
// is that request; the band draws the cache as cold once the lifetime has
// passed, worked out as it is drawn from `warm` and the clock.
const warm = atom({ plugin: 'bar-context', key: 'warm' } as const, null)
const miss = atom({ plugin: 'bar-context', key: 'miss' } as const, null)
const fill = atom({ plugin: 'bar-context', key: 'fill' } as const, null)
const speed = atom({ plugin: 'bar-context', key: 'speed' } as const, { last: null, tokens: 0, ms: 0 })
const model = atom({ plugin: 'bar-context', key: 'model' } as const, { name: null, effort: null })
const picker = atom({ plugin: 'bar-context', key: 'picker' } as const, null)
const settings = atom({ plugin: 'bar-context', key: 'settings' } as const, DEFAULTS)
const origin = atom({ plugin: 'bar-context', key: 'origin' } as const, {
  source: 'defaults',
  isChanged: false,
  hasProject: false,
})

type Elements = ReturnType<EngineInterface['ui']['resolve']>

/** A call that failed gives `fallback`, the mod showing less, and its cause goes to the debug log. */
const orElse =
  <T,>($: EngineInterface, doing: string, fallback: T) =>
  (failure: unknown): T => {
    $.ui.log(`${doing} failed: ${reasonOf(failure)}`, { to: 'debug' })

    return fallback
  }

// --- Settings: this session's, saved for its project or for every project ---

// The store's key for the session's project, by its root folder; none where
// the session tells no root.
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

// The lifetime of the last cache write the API reported, which the session's
// transcript keeps response by response; undefined where the transcript cannot
// be read or holds no write.
const written = async ($: EngineInterface, transcript: string): Promise<Ttl | undefined> =>
  writtenTtl(await $.fs.read(transcript).catch(orElse($, 'reading the transcript', '')))

// The lifetime Claude Code asks for by its own rules, then the account's.
const ruled = async ($: EngineInterface): Promise<Ttl> => {
  const claudeSettings = await $.settings
    .read()
    .catch(orElse($, "reading Claude Code's settings", { promptCacheTtl: undefined }))
  const said = ttlSaid({
    force5m: await $.env.get('FORCE_PROMPT_CACHING_5M'),
    ttlVariable: await $.env.get('CLAUDE_CODE_PROMPT_CACHE_TTL'),
    setting: claudeSettings.promptCacheTtl,
    force1h: await $.env.get('ENABLE_PROMPT_CACHING_1H'),
  })

  if (said !== undefined) {
    return said
  }

  const usage = await $.session.usage().catch(orElse($, "reading the session's usage", undefined))

  return ttlOfPlan(usage?.rateLimits ?? [])
}

// How long the cache lives: the pane's choice, else what the API said it
// wrote where a transcript is at hand, else what the rules give.
const lifetime = async ($: EngineInterface, transcript?: string): Promise<Ttl> => {
  const { cacheTtl } = await read($, settings)

  if (isTtl(cacheTtl)) {
    return cacheTtl
  }

  return (transcript === undefined ? undefined : await written($, transcript)) ?? ruled($)
}

const nameModel = async ($: EngineInterface, id?: string) => {
  const known = id ?? (await $.session.model().catch(orElse($, "reading the session's model", null)))
  await update($, model, current => modelNamed(current, known))
}

// The window as the engine has it now. Until the first response of a resumed
// session it has no fill, and at the start the one the resume told is kept;
// after a compaction none is right, and the call drops it.
const measure = async ($: EngineInterface, moment: 'start' | 'compaction') => {
  const usage = await $.session.usage().catch(orElse($, "reading the session's usage", undefined))

  if (usage !== undefined) {
    await update($, fill, current => fillAfter(current, usage.context, moment === 'start'))
  }
}

let ticker: Timer | undefined

// The settings, the effort, the model and the window read again; the cache's
// time left counting down. Run by session.start, which every fresh load of
// this mod raises, a reload's too; a drawing before it shows the defaults, as
// drawing writes no state. A start that fails says why in the debug log.
const start = async ($: EngineInterface) => {
  try {
    await loadSettings($)

    const { effortLevel } = await $.settings
      .read()
      .catch(orElse($, "reading Claude Code's settings", { effortLevel: undefined }))
    await update($, model, current => effortStarted(current, effortLevel))
    await nameModel($)
    await measure($, 'start')
    // The cache's time left counts down against the clock: drawn again every so often.
    ticker?.cancel()
    ticker = $.clock.every(EVERY_MS, () => {
      $.ui.invalidate('ui.render')
    })
  } catch (failure) {
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

// Compacts as `/compact` does, between turns; while one runs it cannot, and a
// hook that vetoes it leaves the window as it was.
const compact = async ($: EngineInterface) => {
  const done = await $.session.compact().catch(orElse($, 'compacting', undefined))

  if (done === undefined) {
    $.ui.toast(TEXT.cannotCompact)

    return
  }

  if (done.skip !== undefined) {
    $.ui.toast(TEXT.compactVetoed(done.skip))

    return
  }

  await measure($, 'compaction')
}

// The model or the effort switched as the person typing `/model opus` or
// `/effort low` would, so Claude Code keeps it as it does theirs. The choice
// closes at once: the command runs when the session is idle, which may be a
// turn away. The effort shown is the one asked for until a request tells.
const switchTo = async ($: EngineInterface, what: 'model' | 'effort', value: string) => {
  await update($, picker, () => null)

  try {
    await $.command.run({ command: what, args: value })

    if (what === 'effort') {
      await update($, model, current => ({ ...current, effort: value }))
    }
  } catch (failure) {
    $.ui.toast(TEXT.cannotSwitch(`/${what} ${value}`, reasonOf(failure)))
  }
}

// The parts joined by a dim dot, the model and the effort first, each one a
// click that offers the others; once the window is full enough, the button
// that compacts it, on a block of its color (a Button takes no color of its
// own); and the ⚙ that opens the settings, which stays when no part is shown.
const drawn = async ($: EngineInterface, { Box, Button, Text }: Pick<Elements, 'Box' | 'Button' | 'Text'>) => {
  const s = await read($, settings)
  const window = await read($, fill)
  const cache = { warm: await read($, warm), miss: await read($, miss), now: await $.clock.now() }
  const parts = runsOf(s, window, cache, await read($, speed))
  const full = compactShare(s, window)
  const shown = await read($, model)
  const choosing = await read($, picker)
  // The options as exclusive buttons: the current one a pill, the others dim to press.
  const choices = (what: 'model' | 'effort', label: string, values: string[], current: string | undefined) => (
    <Box key={`bar-context-${what}`} flexDirection="row" columnGap={1}>
      <Text dimColor>{label}</Text>
      {values.map(value =>
        value === current ? (
          <Text key={`pick-${what}-${value}`} weight="semibold" inverse>{` ${value} `}</Text>
        ) : (
          <Button
            key={`pick-${what}-${value}`}
            plain
            dimColor
            label={value}
            onPress={() => void switchTo($, what, value)}
          />
        ),
      )}
      <Button
        key="bar-context-pick-close"
        plain
        dimColor
        label="✕"
        onPress={() => void update($, picker, () => null)}
      />
    </Box>
  )
  const click = (what: 'model' | 'effort', text: string, color: string) => (
    <Button key={`bar-context-${what}`} plain onPress={() => void update($, picker, current => toggled(current, what))}>
      <Text color={color}>{text}</Text>
    </Button>
  )
  const picks = clickable(s, shown).map(({ what, text, color }) =>
    choosing !== what
      ? click(what, text, color)
      : what === 'model'
        ? choices('model', TEXT.pickModel, MODELS, aliasOf(text))
        : choices('effort', TEXT.pickEffort, EFFORTS, text),
  )
  const named = picks.flatMap((part, at) => (at > 0 ? [<Text key="blank"> </Text>, part] : [part]))

  return (
    <Box flexDirection="row" gap={1}>
      {(named.length > 0 || parts.length > 0) && (
        <Box flexShrink={1}>
          {named.length > 0 && <Box flexShrink={0}>{named}</Box>}
          {parts.length > 0 && (
            <Box flexShrink={1}>
              <Text wrap="truncate-end">
                {parts.flatMap((runs, at) => [
                  ...(at > 0 || named.length > 0
                    ? [
                        <Text key={`sep.${at}`} dimColor>
                          {' · '}
                        </Text>,
                      ]
                    : []),
                  ...runs.map((run, i) => (
                    <Text key={`${at}.${i}`} color={run.color} weight={run.isBold ? 'semibold' : undefined}>
                      {run.text}
                    </Text>
                  )),
                ])}
              </Text>
            </Box>
          )}
        </Box>
      )}
      {full !== null && (
        <Box flexShrink={0} backgroundColor={s.compactColor}>
          <Text color="#ffffff" weight="semibold">
            {' ⚠ '}
          </Text>
          <Button key="compact" plain label={`${s.compactLabel} ${full}%`} onPress={() => void compact($)} />
          <Text> </Text>
        </Box>
      )}
      <Box flexShrink={0}>
        <Button key="bar-context-settings" plain dimColor label="⚙" onPress={() => togglePane($)} />
      </Box>
    </Box>
  )
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await start($)

    return next(e)
  })

  // A measurement with no fill keeps the one a resume told until a response
  // reports one: what starts a conversation over drops it (classic.SessionStart).
  on('session.measure', async ($, e, next) => {
    await update($, fill, current => fillAfter(current, e.context, true))

    return next(e)
  })

  // The model switched to, as the switch tells it: the session may not have it yet.
  on('classic.PostModelSwitch', async ($, e, next) => {
    const done = await next(e)
    await nameModel($, e.to_model)

    return done
  }).catch(($, e, next) => next(e))

  // A conversation that starts, or starts over, has no cache to lose yet. One
  // resumed has the cache its last response left, which Claude Code tells of.
  on('classic.SessionStart', async ($, e, next) => {
    const isResumed = isResume(e.source)
    const ago = isResumed ? e.seconds_since_last_response : undefined
    const now = await $.clock.now()
    const at = resumedAt(now, ago, e.prompt_cache_likely_expired === true)
    const left =
      ago === undefined ? null : { at, tokens: e.context_tokens ?? null, ttl: await lifetime($, e.transcript_path) }

    await update($, warm, () => left)
    // A miss of the conversation before is no news of this one.
    await update($, miss, () => null)

    // The window's fill: the one the resumed conversation's last response
    // left, until a response of this session reports it; none for one that
    // starts, or starts over.
    const window =
      (await read($, fill))?.window ??
      (await $.session.usage().catch(orElse($, "reading the session's usage", undefined)))?.context.window
    const tokens = isResumed ? e.context_tokens : undefined

    await update($, fill, current => fillAtStart(current, tokens, window))

    return next(e)
  }).catch(($, e, next) => next(e))

  // Each request of the main conversation starts the cache's lifetime over: as
  // it is sent, where there is a cache for it to read, and as its response ends
  // having read or written one, with all its input in it. A subagent's cache is
  // its own. Its output over the time it took is the speed, and its model and
  // effort the ones shown.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined) {
      return yield* next(e)
    }

    const sentAt = await $.clock.now()
    // What a miss of this request would be down to, told before the request
    // starts the lifetime over: the cache lapsed, or written for another model.
    const before = await read($, warm)
    const cause = missCause(before, sentAt, e.model)

    await update($, model, current => modelAsked(current, e.model, e.effort))
    await update($, warm, left => rewarmed(left, { at: sentAt }))

    const response = yield* next(e)
    const answeredAt = await $.clock.now()
    const usage = response.usage ?? {}
    const output_tokens = response.usage?.output_tokens ?? 0
    const ms = answeredAt - sentAt

    if (isTimed(output_tokens, ms)) {
      await update($, speed, sum => speedAfter(sum, output_tokens, ms))
    }

    const tokens = cachedTokens(usage)

    if (tokens !== null) {
      const ttl = (await read($, warm))?.ttl ?? (await lifetime($))

      await update($, warm, () => ({ at: answeredAt, tokens, ttl, model: e.model }))
    }

    if (isMiss(before, usage)) {
      await update($, miss, () => ({ at: answeredAt, cause }))
    }

    return response
  })

  // Once the turn has ended the transcript holds what the API said it wrote,
  // and the lifetime is the one it names.
  on('classic.Stop', async ($, e, next) => {
    if ((await read($, warm)) !== null) {
      const ttl = await lifetime($, e.transcript_path)

      await update($, warm, left => rewarmed(left, { ttl }))
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const beneath = await next(e)

    return e.surface === 'desktop' ? beneath : placed(beneath, await drawn($, $.ui.resolve(e)))
  })

  // The band holds a row for each mod, which core stacks: what is drawn beneath
  // this one (core's own) stays, after the warning and on the row below where
  // both do not fit. The desktop app's footer is one short line that hides
  // what does not fit: there the row is in the band too.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const beneath = await next(e)
    const cold = coldOf(await read($, warm), await $.clock.now())
    const s = await read($, settings)
    const found = warningShown(e.props, cold, s)
    const { Box, Text } = $.ui.resolve(e)
    const warned =
      found === null ? (
        beneath
      ) : (
        <Box flexWrap="wrap" columnGap={2}>
          <Text color={s.warningColor}>
            {TEXT.cacheExpired}
            {found.tokens !== null && TEXT.cacheRefill(short(found.tokens))}
          </Text>
          {beneath}
        </Box>
      )

    return e.surface !== 'desktop' || e.props.hasSurvey ? warned : placed(warned, await drawn($, $.ui.resolve(e)))
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
              $.ui.toast(TEXT.badCount(min, max))

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
          {heading(TEXT.parts)}
          {PARTS.map(([key, label]) => check(key, label, s[key], () => void change($, { [key]: !s[key] })))}
        </Box>
        <Box flexDirection="column">
          {heading(TEXT.labels)}
          {LABELS.map(([key, label]) => words(key, label, labelProblem))}
        </Box>
        <Box flexDirection="column">
          {heading(TEXT.colors)}
          <Text dimColor>{TEXT.colorsNote}</Text>
          {COLORS.map(([key, label]) => (
            <Box key={`swatch.${key}`} flexDirection="row" gap={1}>
              <Text color={s[key]}>■</Text>
              {words(key, label, colorProblem)}
            </Box>
          ))}
        </Box>
        <Box flexDirection="column">
          {heading(TEXT.thresholds)}
          {COUNTS.map(count)}
        </Box>
        <Box flexDirection="column">
          {heading(TEXT.cache)}
          {/* Options a click picks, not a Select, which only the keyboard drives. */}
          <Box flexDirection="row" gap={2}>
            {TTLS.map(({ value, label }) =>
              pill(`cacheTtl-${value}`, label, value === s.cacheTtl, () => void change($, { cacheTtl: value })),
            )}
          </Box>
          <Text dimColor>{TEXT.cacheNote}</Text>
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
