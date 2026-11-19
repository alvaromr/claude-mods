import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Alert, Mode, Preferences, Setup } from '../types'
import { afterOpening, afterReset, alertHeading, isWarnable, shownAlerts } from './alerts'
import { brief, toAsk } from './brief'
import type { Ask } from './brief'
import {
  ACCENT,
  afterSetUp,
  asEffort,
  EFFORTS,
  effortAsked,
  keptPrompt,
  MODELS,
  MODES,
  modesOn,
  NOTHING,
  promptHeading,
  promptOf,
  ROLLING,
  rollingOn,
  SETUPS,
  titleOf,
  WHENS,
  whenLabel,
  whenOf,
} from './modes'
import { afterCompaction, cardsOf, withNote, withoutNote, withoutNotes } from './notes'
import {
  DEFAULTS,
  isMigrating,
  isUnsaved,
  loaded,
  migrated,
  originOf,
  projectKeyOf,
  savedTo,
  startMode,
} from './preferences'
import { isSilent, messageOf, whyUnanswered } from './reply'
import { isSent, points, sentDigest, sentLines, sentNote, sharable } from './share'
import { slotted } from './slots'
import { TEXT } from './text'
import { isCompaction, isOwnAnswer, isQueued, isSameTurn, keeping } from './turns'
import { isCommenting, isReading, startView } from './view'

const PANE = 'consejero'
/** The columns the pane's option rows give their label, the gap after it counted. */
const LABEL = 10

const view = atom({ plugin: 'ui-companion', key: 'view' } as const, 'off')
const mode = atom({ plugin: 'ui-companion', key: 'mode' } as const, 'vigilante')
const notes = atom({ plugin: 'ui-companion', key: 'notes' } as const, [])
const digests = atom({ plugin: 'ui-companion', key: 'digests' } as const, {})
const isThinking = atom({ plugin: 'ui-companion', key: 'isThinking' } as const, false)
const errors = atom({ plugin: 'ui-companion', key: 'errors' } as const, {})
const isOn = atom({ plugin: 'ui-companion', key: 'isOn' } as const, true)
const startsOpen = atom({ plugin: 'ui-companion', key: 'startsOpen' } as const, false)
const prompts = atom({ plugin: 'ui-companion', key: 'prompts' } as const, {})
const isEditingPrompts = atom({ plugin: 'ui-companion', key: 'isEditingPrompts' } as const, false)
const setups = atom({ plugin: 'ui-companion', key: 'setups' } as const, SETUPS)
const alerts = atom({ plugin: 'ui-companion', key: 'alerts' } as const, {})
const origin = atom({ plugin: 'ui-companion', key: 'origin' } as const, {
  source: 'defaults',
  isChanged: false,
  hasProject: false,
})

type Engine = Pick<EngineInterface, 'clock' | 'model' | 'session' | 'state' | 'store' | 'ui'>

/** Says in the pane why a mode wrote nothing; the mode's next success takes it away. */
const fail = ($: Engine, chosen: Mode, why: string) =>
  update($, errors, all => ({ ...all, [chosen]: TEXT.noComment(why).trim() }))

/** The transcript's length at each mode's last comment of its own. */
const commented = new Map<Mode, number>()

const advise = async ($: Engine, chosen: Mode, ask: Ask) => {
  const { model: named, effort: picked } = (await read($, setups))[chosen]
  const messages = await $.session.messages()

  // A turn's end and a mode turned on that land together are one comment, not two.
  if (isSameTurn(ask, commented.get(chosen), messages.length)) {
    return undefined
  }

  // Made again, it takes the place of the note shown last now, not of whichever
  // is last when the model answers.
  const target = ask === 'redo' ? (await read($, notes)).findLast(kept => kept.mode === chosen) : undefined

  // Uncached on purpose: the one text every call repeats, the mode's prompt, is
  // under the cache's minimum, so a mark caches nothing; and `$.model.fork`
  // rereads the whole session on its model, measured at 3 to 5 times the cost.
  const reply = await $.model.complete({
    model: named,
    system: promptOf(await read($, prompts), chosen),
    prompt: brief({ chosen, messages, ask, target, digests: await read($, digests), notes: await read($, notes) }),
    maxTokens: 2000,
    timeoutMs: 120_000,
    ...effortAsked(picked),
  })

  if (!reply.isAnswered) {
    return fail($, chosen, whyUnanswered(reply))
  }

  await update($, errors, all => ({ ...all, [chosen]: undefined }))

  if (ask === 'own') {
    // A comment of a mode the person turned off meanwhile is not theirs to read.
    if (!(await read($, setups))[chosen].isOn) {
      return undefined
    }

    commented.set(chosen, messages.length)
  }

  const text = reply.text.trim()
  const isQuiet = isSilent(text)
  const keep = keeping(chosen, isQuiet, ask)

  if (keep === 'text') {
    await update($, digests, all => ({ ...all, [chosen]: { text, covered: messages.length } }))
    await warn($, { mode: chosen, title: titleOf(chosen), text })
  }

  if (keep !== 'note') {
    return undefined
  }

  // Set by the callback below, which the compiler does not follow: typed wide.
  let isGone = false as boolean
  const note = await update($, notes, list => {
    const written = withNote(list, { mode: chosen, text, target })

    isGone = written.isGone

    return written.list
  }).then(list => list.findLast(kept => kept.mode === chosen))

  if (!isGone && !isQuiet && note !== undefined) {
    await warn($, { mode: chosen, title: TEXT.note(note.n), text, n: note.n })
  }

  return undefined
}

/**
 * What a mode on writes also shows above the prompt, when its setup says so;
 * the summary made for another mode to start from, with its own mode off, does not.
 */
const warn = async ($: Engine, written: Alert) => {
  if (isWarnable((await read($, setups))[written.mode], await read($, view))) {
    await update($, alerts, all => ({ ...all, [written.mode]: written }))
  }
}

/** Puts a mode's alert away. */
const dismiss = ($: Engine, chosen: Mode) => update($, alerts, all => ({ ...all, [chosen]: undefined }))

let isBusy = false
const waiting: { mode: Mode; ask: Ask }[] = []

/** Not awaited by the turn: the comment arrives when the model answers. */
const think = async ($: Engine, chosen: Mode, ask: Ask = 'own') => {
  // What is asked while the model answers is answered once it has, each once.
  if (!isQueued(waiting, chosen, ask)) {
    waiting.push({ mode: chosen, ask })
  }

  if (isBusy) {
    return
  }

  isBusy = true
  await update($, isThinking, () => true)

  try {
    for (let next = waiting.shift(); next !== undefined; next = waiting.shift()) {
      // One mode's failure (a model the engine refuses) leaves the others asked.
      await advise($, next.mode, next.ask).catch((caught: unknown) => fail($, next.mode, messageOf(caught)))
    }
  } finally {
    isBusy = false
    await update($, isThinking, () => false)
  }
}

/** Whether the advisor reads the turns now. */
const reads = async ($: Engine) => isReading(await read($, view), await read($, isOn))

/** A mode turned on in a conversation under way answers at once. */
const answerNow = async ($: Engine, chosen: Mode) => {
  const length = (await $.session.messages()).length

  if (length === 0 || !(await reads($))) {
    return
  }

  for (const { mode: asked, ask } of toAsk(chosen, await read($, digests), length)) {
    void think($, asked, ask)
  }
}

/** Asks again for what the shown mode shows: its text made anew, or its last note. */
const redo = async ($: Engine) => {
  if ((await $.session.messages()).length > 0) {
    void think($, await read($, mode), 'redo')
  }
}

/**
 * Puts one point of a note, or the whole note, or with no number of the mode's
 * kept text, in the assistant's conversation, said to be the companion's so it
 * is not taken for the person's. Tells whether it went.
 */
const share = async ($: Engine, chosen: Mode, part: string, n?: number) => {
  const text = sharable(await read($, digests), await read($, notes), chosen, part, n)

  // Gone, or rewritten since it was drawn: nothing to send.
  if (text === undefined) {
    return false
  }

  const said = TEXT.shared(chosen, part)

  try {
    const sent = await $.session.append({
      message: { type: 'user', content: [{ type: 'text', text: said }] },
    })

    if (sent.deny !== undefined) {
      await update($, errors, all => ({ ...all, [chosen]: TEXT.noInclude(sent.deny) }))

      return false
    }
  } catch (caught) {
    await update($, errors, all => ({ ...all, [chosen]: TEXT.noInclude(String(caught)) }))

    return false
  }

  await update($, errors, all => ({ ...all, [chosen]: undefined }))
  await (n === undefined
    ? update($, digests, all => sentDigest(all, chosen, text, part))
    : update($, notes, list => sentNote(list, chosen, n, text, part)))
  // The row sent is one the person does not see: the transcript shows them
  // what went, a line of it to a row.
  for (const line of sentLines(chosen, n, part)) {
    $.ui.log(line)
  }

  return true
}

/**
 * Drops one of the mode's notes, or with no number its kept text, which the
 * next turn then writes anew from the whole conversation.
 */
const discard = ($: Engine, chosen: Mode, n?: number) =>
  n === undefined
    ? update($, digests, all => ({ ...all, [chosen]: undefined }))
    : update($, notes, list => withoutNote(list, chosen, n))

/** Drops every note of the mode. */
const discardAll = ($: Engine, chosen: Mode) => update($, notes, list => withoutNotes(list, chosen))

/**
 * The person's prompt for a mode, for this session until saved; one left
 * empty, or the mode's own, is the mode's own again.
 */
const keepPrompt = async ($: Engine, chosen: Mode, text: string) => {
  await update($, prompts, all => ({ ...all, [chosen]: keptPrompt(chosen, text) }))
  await changed($)
}

/** The kept texts of the modes on do not wait for a turn to end. */
const catchUp = async ($: Engine) => {
  for (const each of rollingOn(await read($, setups))) {
    await answerNow($, each)
  }
}

/** A mode turned on answers at once; one turned off stops, its alert gone. */
const setUp = async ($: Engine, chosen: Mode, change: Partial<Setup>) => {
  const was = (await read($, setups))[chosen]
  const { isDismissed, isAnswering } = afterSetUp(was, change)

  await choose($, { setups: { [chosen]: { ...was, ...change } } })

  if (isDismissed) {
    await dismiss($, chosen)
  }

  if (isAnswering) {
    await answerNow($, chosen)
  }
}

const choose = async (
  $: Engine,
  pick: { isOn?: boolean; startsOpen?: boolean; mode?: Mode; setups?: Partial<Record<Mode, Setup>> },
) => {
  const { isOn: power, startsOpen: opens, mode: chosen, setups: altered } = pick

  if (power !== undefined) {
    await update($, isOn, () => power)
  }

  if (opens !== undefined) {
    await update($, startsOpen, () => opens)
  }

  if (altered !== undefined) {
    await update($, setups, all => ({ ...all, ...altered }))
  }

  if (chosen !== undefined) {
    await update($, mode, () => chosen)
  }

  await changed($)
}

// --- Settings: this session's, saved for its project or for every project ---

const current = async ($: Engine): Promise<Preferences> => ({
  isOn: await read($, isOn),
  startsOpen: await read($, startsOpen),
  setups: await read($, setups),
  prompts: await read($, prompts),
})

const apply = async ($: Engine, s: Preferences) => {
  await update($, isOn, () => s.isOn)
  await update($, startsOpen, () => s.startsOpen)
  await update($, setups, () => s.setups)
  await update($, prompts, () => s.prompts)
}

/** A call that failed gives `fallback`, the mod doing less, and its cause goes to the debug log. */
const orElse =
  <T,>($: Engine, doing: string, fallback: T) =>
  (failure: unknown): T => {
    $.ui.log(`${doing} failed: ${messageOf(failure)}`, { to: 'debug' })

    return fallback
  }

const projectKey = async ($: Engine) =>
  projectKeyOf(await $.session.root().catch(orElse($, 'reading the project root', null)))

// The settings a session starts with: its project's, else the global ones,
// else the defaults. The choice and the prompts kept before the settings were
// saved this way become the global ones. A shown mode they turn off gives way
// to the first one on.
const loadSettings = async ($: Engine) => {
  const key = await projectKey($)
  const project = key === undefined ? undefined : await $.store.get(key)
  let global = await $.store.get('settings')
  const choice = await $.store.get('choice')
  const written = await $.store.get('prompts')

  if (isMigrating(global, choice, written)) {
    global = migrated(choice, written)
    await $.store.set('settings', global)
    await $.store.delete('choice')
    await $.store.delete('prompts')
  }

  const s = loaded(project ?? global)

  await apply($, s)
  await update($, mode, shown => startMode(shown, s.setups))
  await update($, origin, () => originOf(project, global))
}

// A change holds for this session alone, until it is saved: unsaved while the
// session's settings differ from what they came from, the project's saved
// ones, the global ones or the defaults.
const changed = async ($: Engine) => {
  const { source } = await read($, origin)
  const key = source === 'project' ? await projectKey($) : 'settings'
  const saved = source === 'defaults' || key === undefined ? DEFAULTS : loaded(await $.store.get(key))
  const unsaved = isUnsaved(await current($), saved)

  await update($, origin, was => ({ ...was, isChanged: unsaved }))
}

const save = async ($: Engine, where: 'project' | 'global') => {
  const key = where === 'project' ? await projectKey($) : 'settings'

  if (key === undefined) {
    $.ui.toast(TEXT.noProject)

    return
  }

  await $.store.set(key, loaded(await current($)))
  await update($, origin, now => savedTo(now, where))
}

// The project's saved settings dropped: the session takes the global ones,
// else the defaults.
const forgetProject = async ($: Engine) => {
  const key = await projectKey($)

  if (key !== undefined) {
    await $.store.delete(key)
  }

  await loadSettings($)
}

// The defaults, for this session until saved; the modes turned off stop, their alerts gone.
const reset = async ($: Engine) => {
  await apply($, DEFAULTS)
  await update($, alerts, afterReset)
  await changed($)
}

const show = async ($: Engine) => {
  const all = await read($, setups)

  await update($, view, () => 'open')
  // Seen in the pane: the alerts shown while minimized go; the ones always shown stay.
  await update($, alerts, shown => afterOpening(shown, all))
  void catchUp($)

  return $.ui.open({ id: PANE, title: TEXT.title, columns: 46 })
}

/** Puts the pane away and leaves the advisor commenting. */
const minimize = async ($: Engine) => {
  await update($, view, () => 'minimized')
  await $.ui.close({ id: PANE })
}

/** The footer's button: the pane away when it is open, back when it is not. */
const toggle = async ($: Engine) => ((await read($, view)) === 'open' ? minimize($) : show($))

// The button, second in the first slot row, after the mods': in the terminal, of the prompt's
// footer, under what is drawn there beneath (the engine's mode labels, another
// mod's row), which stays, the whole width so the footer goes under the status
// line instead of beside it; in the desktop app, whose footer is one short line
// that hides what does not fit, of the band above the prompt. Its dot is
// green while some mode comments, gray while none does.
const drawn = async (
  $: Engine,
  { Box, Button, Text }: Pick<ReturnType<EngineInterface['ui']['resolve']>, 'Box' | 'Button' | 'Text'>,
) => {
  const now = await read($, view)
  const commenting = isCommenting(now, await read($, isOn), await read($, setups))

  return (
    <Box key="slot:1.2:ui-companion">
      <Button key="consejero" plain dimColor={now !== 'minimized'} onPress={() => void toggle($)}>
        <Text color={commenting ? 'success' : 'inactive'}>{commenting ? '●' : '○'}</Text> companion
      </Button>
    </Box>
  )
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'consejero',
      description: TEXT.commandDescription,
    })

    // A reload while the model answers leaves the flag up with nobody to lower it.
    await update($, isThinking, () => false)

    await loadSettings($)

    const started = await startView(
      {
        isUp: (await $.ui.panes()).some(pane => pane.id === PANE),
        now: await read($, view),
        isInteractive: e.isInteractive,
        startsOpen: await read($, startsOpen),
      },
      async () => (await $.session.messages()).length === 0,
    )

    if (started !== undefined) {
      await update($, view, () => started)
    }

    void catchUp($)

    return next(e)
  })

  on('command.run', { command: 'consejero' }, async $ => {
    if ((await read($, view)) === 'off') {
      await show($)

      return { text: TEXT.opened }
    }

    await update($, view, () => 'off')
    await $.ui.close({ id: PANE })

    return { text: TEXT.turnedOff }
  })

  // The person's own close turns the advisor off; minimizing closes the pane
  // as the plugin and leaves it commenting.
  on('ui.close', async ($, e, next) => {
    if (e.id === PANE && e.origin.kind === 'person') {
      await update($, view, () => 'off')
    }

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)

    if (isOwnAnswer(e.agentId, e.reason) && (await reads($))) {
      for (const each of modesOn(await read($, setups))) {
        void think($, each)
      }
    }

    return done
  })

  // A compaction replaces the transcript the kept texts count their messages
  // in, so what they cover is nothing now: they read the new one whole, and not
  // only what lies past a count the shrunken transcript may outgrow again.
  // Neither a precompute, which installs nothing, nor an agent's own is the
  // conversation's.
  on('session.compact', async ($, e, next) => {
    const done = await next(e)

    if (isCompaction(e.trigger, e.agentId, done.skip)) {
      await update($, digests, afterCompaction)
    }

    return done
  })

  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const beneath = await next(e)

    return e.surface === 'desktop' ? beneath : slotted(beneath, await drawn($, $.ui.resolve(e)))
  })

  // In the desktop app, the button's row; and the last each mode wrote, as its
  // setup says (while the pane is put away, or always), in its color: a press
  // on it brings the pane back, ✕ puts it away, and under it the whole is
  // included in the conversation or deleted, the alert gone with it. A question
  // asked there has the band to itself.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const beneath = await next(e)
    const elements = $.ui.resolve(e)

    if (e.props.hasSurvey) {
      return beneath
    }

    const laid = e.surface === 'desktop' ? slotted(beneath, await drawn($, elements)) : beneath
    const now = await read($, view)
    const all = await read($, setups)
    const kept = await read($, alerts)
    const shown = shownAlerts(kept, all, now)

    if (shown.length === 0) {
      return laid
    }

    const { Box, Button, Text } = elements

    return (
      <Box flexDirection="column">
        {laid}
        {shown.map(warned => {
          const accent = ACCENT[warned.mode]
          return (
            <Box
              key={`alert-${warned.mode}`}
              flexDirection="column"
              borderStyle="round"
              borderColor={accent}
              paddingX={1}
            >
              <Box flexDirection="row" justifyContent="space-between">
                <Button key={`alert-open-${warned.mode}`} plain onPress={() => void show($)}>
                  <Text weight="semibold" color={accent}>
                    {alertHeading(warned)}
                  </Text>
                </Button>
                <Button
                  key={`alert-dismiss-${warned.mode}`}
                  plain
                  dimColor
                  role="dismiss"
                  label="✕"
                  onPress={() => void dismiss($, warned.mode)}
                />
              </Box>
              <Button key={`alert-text-${warned.mode}`} plain onPress={() => void show($)}>
                <Text color={accent}>{warned.text}</Text>
              </Button>
              <Box flexDirection="row" justifyContent="flex-end" columnGap={2}>
                <Button
                  key={`alert-send-${warned.mode}`}
                  plain
                  dimColor
                  label={TEXT.include}
                  onPress={() =>
                    void share($, warned.mode, warned.text, warned.n).then(isSent =>
                      isSent ? dismiss($, warned.mode) : undefined,
                    )
                  }
                />
                <Button
                  key={`alert-discard-${warned.mode}`}
                  plain
                  dimColor
                  label={TEXT.discard}
                  onPress={() => void discard($, warned.mode, warned.n).then(() => dismiss($, warned.mode))}
                />
              </Box>
            </Box>
          )
        })}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const elements = $.ui.resolve(e)
    const { Box, Button, Markdown, Text } = elements
    const isEditing = await read($, isEditingPrompts)
    const written = await read($, prompts)
    const chosen = await read($, mode)
    const powered = await read($, isOn)
    const opensAtStart = await read($, startsOpen)
    const setup = await read($, setups)
    const isModeOn = setup[chosen].isOn
    const thinking = await read($, isThinking)
    const failed = (await read($, errors))[chosen]
    const shown = cardsOf(chosen, await read($, digests), await read($, notes))
    const accent = ACCENT[chosen]
    const rule = (
      <Text dimColor wrap="truncate">
        {'─'.repeat(e.props.bodyColumns)}
      </Text>
    )
    // One button per option, so a click picks it: a Select takes the keys. The
    // one picked is a pill in the mode's color, and nothing to press.
    const options = (
      name: string,
      label: string,
      values: readonly string[],
      current: string,
      pick: (value: string) => void,
    ) => (
      <Box flexDirection="row">
        <Box width={LABEL}>
          <Text dimColor>{label}</Text>
        </Box>
        {/* Options past the pane's edge wrap under the first one, not the label. */}
        <Box flexDirection="row" flexWrap="wrap" columnGap={2} width={e.props.bodyColumns - LABEL}>
          {values.map(value =>
            value === current ? (
              <Text weight="semibold" inverse color={accent}>{` ${value} `}</Text>
            ) : (
              <Button
                key={`${name}-${value}`}
                plain
                dimColor
                label={value}
                onPress={() => {
                  pick(value)
                }}
              />
            ),
          )}
        </Box>
      </Box>
    )

    // The switch, and the buttons to the prompts and to put the pane away.
    const o = await read($, origin)
    // As every pane's switch: a full square on, an empty one off, dim.
    const header = (
      <Box flexDirection="row" justifyContent="space-between">
        <Button
          key="power"
          plain
          dimColor={!powered}
          onPress={() => void choose($, { isOn: !powered }).then(() => catchUp($))}
        >
          {powered ? '■' : '□'} {TEXT.active}
        </Button>
        <Box flexDirection="row" columnGap={2}>
          <Button
            key="prompts"
            plain
            dimColor
            label={isEditing ? TEXT.backToNotes : TEXT.prompts}
            onPress={() => void update($, isEditingPrompts, now => !now)}
          />
          <Button key="minimize" plain dimColor label={TEXT.minimize} onPress={() => void minimize($)} />
        </Box>
      </Box>
    )

    // Where the settings came from, and the buttons that save them, as in every pane.
    const source = (
      <Box flexDirection="column">
        <Text>
          {TEXT.sources[o.source]}
          {o.isChanged && <Text color="warning">{TEXT.unsaved}</Text>}
        </Text>
        {o.hasProject && o.source !== 'project' && <Text dimColor>{TEXT.projectHasOwn}</Text>}
        <Text dimColor>{TEXT.scope}</Text>
      </Box>
    )
    const saving = (
      <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
        <Button
          key="save-project"
          variant={o.isChanged ? 'primary' : 'secondary'}
          label={TEXT.saveProject}
          onPress={() => void save($, 'project')}
        />
        <Button key="save-global" variant="secondary" label={TEXT.saveGlobal} onPress={() => void save($, 'global')} />
        {o.hasProject && (
          <Button
            key="forget-project"
            variant="secondary"
            label={TEXT.forgetProject}
            onPress={() => void forgetProject($)}
          />
        )}
        <Button key="reset" variant="secondary" label={TEXT.reset} onPress={() => void reset($)} />
      </Box>
    )

    // Each mode's prompt in a field of its own.
    if (isEditing) {
      return (
        <Box flexDirection="column" paddingTop={1} rowGap={1}>
          {header}
          {rule}
          {source}
          <Box flexDirection="column" rowGap={1}>
            <Text dimColor>{TEXT.promptsNote(NOTHING)}</Text>
            {MODES.map(each => (
              <Box flexDirection="column">
                <Box flexDirection="row" justifyContent="space-between">
                  <Text weight="semibold" color={ACCENT[each]}>
                    {promptHeading(written, each)}
                  </Text>
                  {written[each] !== undefined && (
                    <Button
                      key={`prompt-reset-${each}`}
                      plain
                      dimColor
                      label={TEXT.resetPrompt}
                      onPress={() => void keepPrompt($, each, '')}
                    />
                  )}
                </Box>
                {/* The terminal draws a field as bare text: a ground of its own marks it. */}
                <Box backgroundColor={e.surface === 'terminal' ? 'subtle' : undefined}>
                  <elements.Input
                    key={`prompt-${each}`}
                    rows={8}
                    submitLabel={TEXT.savePrompt}
                    value={promptOf(written, each)}
                    onSubmit={value => void keepPrompt($, each, value)}
                  />
                </Box>
              </Box>
            ))}
          </Box>
          {saving}
        </Box>
      )
    }

    return (
      <Box flexDirection="column" paddingTop={1}>
        {header}
        {rule}
        <Box flexDirection="column" rowGap={1}>
          {/* The mode the pane shows; of the others, the ones on at full strength, the ones off dim. */}
          <Box flexDirection="row">
            <Box width={LABEL}>
              <Text dimColor>{TEXT.mode}</Text>
            </Box>
            <Box flexDirection="row" flexWrap="wrap" columnGap={2} width={e.props.bodyColumns - LABEL}>
              {MODES.map(each =>
                each === chosen ? (
                  <Text weight="semibold" inverse color={accent}>{` ${each} `}</Text>
                ) : (
                  <Button
                    key={`mode-${each}`}
                    plain
                    dimColor={!setup[each].isOn}
                    label={each}
                    onPress={() => void choose($, { mode: each })}
                  />
                ),
              )}
            </Box>
          </Box>
          {/* The shown mode's own: whether it comments, when what it writes
              shows above the prompt, and the model and effort it asks. */}
          <Box flexDirection="row">
            <Box width={LABEL}>
              <Text dimColor>{TEXT.state}</Text>
            </Box>
            <Button key="state" plain dimColor={!isModeOn} onPress={() => void setUp($, chosen, { isOn: !isModeOn })}>
              {isModeOn ? '■' : '□'} {TEXT.on}
            </Button>
          </Box>
          {options(
            'when',
            TEXT.alert,
            WHENS.map(when => when.label),
            whenLabel(setup[chosen].alert),
            value => {
              void setUp($, chosen, { alert: whenOf(value) })
            },
          )}
          {options('model', TEXT.model, MODELS, setup[chosen].model, value => {
            void setUp($, chosen, { model: value })
          })}
          {options('effort', TEXT.effort, EFFORTS, setup[chosen].effort, value => {
            void setUp($, chosen, { effort: asEffort(value) ?? 'auto' })
          })}
          {/* The pane's own, whatever the mode. */}
          <Box flexDirection="row">
            <Box width={LABEL}>
              <Text dimColor>{TEXT.start}</Text>
            </Box>
            <Button
              key="starts-open"
              plain
              dimColor={!opensAtStart}
              onPress={() => void choose($, { startsOpen: !opensAtStart })}
            >
              {opensAtStart ? '■' : '□'} {TEXT.startsOpen}
            </Button>
          </Box>
        </Box>
        {source}
        {saving}
        {rule}
        {(powered || shown.length > 0) && (
          <Box flexDirection="row" justifyContent="flex-end" columnGap={2}>
            {/* A kept text is one card, with its own button to drop it. */}
            {!ROLLING.includes(chosen) && shown.length > 0 && (
              <Button
                key="discard-all"
                plain
                dimColor
                label={TEXT.discardAll}
                onPress={() => void discardAll($, chosen)}
              />
            )}
            {powered && <Button key="redo" plain dimColor label={TEXT.redo} onPress={() => void redo($)} />}
          </Box>
        )}
        {powered && thinking && (
          <Text italic color={accent}>
            {TEXT.thinking}
          </Text>
        )}
        {failed !== undefined && <Text color="error">✗ {failed}</Text>}
        {!powered && (
          <Text dimColor italic>
            {TEXT.powerOff}
          </Text>
        )}
        {powered && shown.length === 0 && !thinking && (
          <Text dimColor italic>
            {isModeOn ? TEXT.idle[chosen] : TEXT.modeOff}
          </Text>
        )}
        {/* A card to each, the current ones in the mode's color and the old dim. */}
        {shown.map(entry => (
          <Box
            flexDirection="column"
            borderStyle="round"
            borderColor={accent}
            borderDimColor={entry.isOld}
            paddingX={1}
          >
            <Box flexDirection="row" justifyContent="space-between">
              <Text weight={entry.isOld ? undefined : 'semibold'} dimColor={entry.isOld} color={accent}>
                {entry.title}
              </Text>
              <Button
                key={entry.discardKey}
                plain
                dimColor
                label={TEXT.discard}
                onPress={() => void discard($, chosen, entry.n)}
              />
            </Box>
            {/* Each point with its own sending under it. */}
            {points(entry.text).map((point, index) => (
              <Box flexDirection="column">
                <Markdown text={point} />
                <Box flexDirection="row" justifyContent="flex-end">
                  {isSent(entry.sent, point) ? (
                    <Text dimColor>{TEXT.included}</Text>
                  ) : (
                    <Button
                      key={`${entry.sendKey}-${index + 1}`}
                      plain
                      dimColor
                      label={TEXT.include}
                      onPress={() => {
                        void share($, chosen, point, entry.n)
                      }}
                    />
                  )}
                </Box>
              </Box>
            ))}
          </Box>
        ))}
      </Box>
    )
  })
}
