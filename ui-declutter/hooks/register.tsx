import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, StateDollar, ToolGroupCall } from 'claude-code'

import type { Level, Preferences, Timing } from '../types'
import { isEnding, kindOf, levelKeyOf, noticeCall, noticeId, toolOf } from './calls'
import { arrivalOf, isGoneFrom, scan, unread } from './conversation'
import type { Scanned, Span } from './conversation'
import { slotted } from './footer'
import {
  callGaps,
  deniedOf,
  diffRows,
  entriesOf,
  failedOf,
  fileRowOf,
  filesIn,
  filesOf,
  foldLabel,
  glyphOf,
  isTall,
  isTallSpan,
  labelOf,
  layoutOf,
  restLabel,
  resultLine,
  resultOf,
  statusOf,
  timesOf,
} from './layout'
import type { CallLine, FileLine } from './layout'
import { jqNotice, jqUnchecked, messageOf } from './notices'
import { rowToggled, isSpanOpen, toggled, withFull, withoutSpans } from './opened'
import { outcomeOf, unified, withoutBashEdit } from './outcome'
import type { Outcome } from './outcome'
import { DEFAULTS, LEVELS, isUnsaved, loaded, projectKeyOf, provenanceOf, savedAs } from './settings'
import {
  callsOf,
  drawerOf,
  editsOf,
  engineUnfolds,
  foldable,
  isEngineRow,
  itemOf,
  shownFor,
  splitEdits,
  treatmentOf,
  wantedOf,
} from './span'
import type { Shown } from './span'
import { lineOf, padOf } from './summary'
import { TEXT } from './text'
import { beforesOf, barRuns, clockOf, endTiming, isLive, rowsOf, timeOf, verdictTiming } from './timeline'
import type { Row, Time } from './timeline'
import { foundFor, isKept, lostIn, resultsFrom, retriable, transcriptCommand, unknownOf } from './transcript'

// A web-fetch agent stands in for WebFetch where a session lacks it, and the
// engine draws it as one: it is that tool, its result too, which names no input.
const fetches = new Set<string>()
const nameOf = (id: string, tool: string, input?: unknown) => toolOf(fetches, id, tool, input)

const isOn = atom({ plugin: 'ui-declutter', key: 'isOn' } as const, true)
const diffs = atom({ plugin: 'ui-declutter', key: 'diffs' } as const, 'summary')
const commands = atom({ plugin: 'ui-declutter', key: 'commands' } as const, 'summary')
const skills = atom({ plugin: 'ui-declutter', key: 'skills' } as const, 'summary')
const startsOpen = atom({ plugin: 'ui-declutter', key: 'startsOpen' } as const, false)

// The engine reads each atom where it is named, so the key picks one by name.
const levelOf = async ($: EngineInterface, tool: string): Promise<Level> => {
  const key = levelKeyOf(tool)

  return key === 'diffs' ? read($, diffs) : key === 'skills' ? read($, skills) : read($, commands)
}
const PANE = 'declutter'
const origin = atom({ plugin: 'ui-declutter', key: 'origin' } as const, {
  source: 'defaults',
  isChanged: false,
  hasProject: false,
})

// --- Settings: this session's, saved for its project or for every project ---

const current = async ($: EngineInterface): Promise<Preferences> => ({
  isOn: await read($, isOn),
  diffs: await read($, diffs),
  commands: await read($, commands),
  skills: await read($, skills),
  startsOpen: await read($, startsOpen),
})

// Every span takes the start the settings give: the presses that turned some are forgotten.
const apply = async ($: EngineInterface, s: Preferences) => {
  await update($, isOn, () => s.isOn)
  await update($, diffs, () => s.diffs)
  await update($, commands, () => s.commands)
  await update($, skills, () => s.skills)
  await update($, opened, withoutSpans)
  await update($, startsOpen, () => s.startsOpen)
}

/** A call that failed gives `fallback`, the mod showing less, and its cause goes to the debug log. */
const orElse =
  <T,>($: EngineInterface, doing: string, fallback: T) =>
  (failure: unknown): T => {
    $.ui.log(`${doing} failed: ${messageOf(failure)}`, { to: 'debug' })

    return fallback
  }

const projectKey = async ($: EngineInterface) =>
  projectKeyOf(await $.session.root().catch(orElse($, 'reading the project root', null)))

// The settings a session starts with: its project's, else the global ones,
// else the defaults.
const loadSettings = async ($: EngineInterface) => {
  const key = await projectKey($)
  const project = key === undefined ? undefined : await $.store.get(key)
  const global = await $.store.get('settings')

  await apply($, loaded(project ?? global))
  await update($, origin, () => provenanceOf(project, global))
}

// A change holds for this session alone, until it is saved: unsaved while the
// session's settings differ from what they came from, the project's saved
// ones, the global ones or the defaults.
const changed = async ($: EngineInterface) => {
  const now = await current($)
  const { source } = await read($, origin)
  const key = source === 'project' ? await projectKey($) : 'settings'
  const saved = source === 'defaults' || key === undefined ? DEFAULTS : loaded(await $.store.get(key))

  await update($, origin, was => ({ ...was, isChanged: isUnsaved(now, saved) }))
}

const save = async ($: EngineInterface, where: 'project' | 'global') => {
  const key = where === 'project' ? await projectKey($) : 'settings'

  if (key === undefined) {
    $.ui.toast(TEXT.noProject)

    return
  }

  await $.store.set(key, await current($))
  await update($, origin, now => savedAs(now, where))
}

// The project's saved settings dropped: the session takes the global ones,
// else the defaults.
const forgetProject = async ($: EngineInterface) => {
  const key = await projectKey($)

  if (key !== undefined) {
    await $.store.delete(key)
  }

  await loadSettings($)
}

let hasStarted = false
// Without jq the results of the rows not drawn yet cannot be read: every row
// is the engine's, as with the mod off. Unknown until the start looks.
let hasJq = true

// Run by session.start, and by the first drawing where a resumed session drew
// before session.start reached this mod.
const start = async ($: EngineInterface) => {
  hasStarted = true

  await loadSettings($)

  // A check that cannot run tells nothing of jq, and the rows would need it.
  const missing = await $.process
    .run(['/bin/sh', '-c', 'command -v jq'])
    .then(({ exitCode }) => jqNotice(exitCode))
    .catch(jqUnchecked)

  if (missing !== undefined && hasJq) {
    hasJq = false
    $.ui.status(missing)
    await update($, revision, n => n + 1)
  }
}

// Whether the mod draws the tool rows: on, and able to.
const isDrawing = async ($: EngineInterface) => hasJq && (await read($, isOn))

const timings = { plugin: 'ui-declutter', key: 'timings' } as const
const opened = atom({ plugin: 'ui-declutter', key: 'opened' } as const, [])
const revision = atom({ plugin: 'ui-declutter', key: 'revision' } as const, 0)

type Elements = Pick<ReturnType<EngineInterface['ui']['resolve']>, 'Box' | 'Button' | 'Code' | 'Text'>

// The calls whose rows a run the engine unfolded draws, while it is: those rows
// are its own, as the run is; a call drawn alone is the mod's, in its span.
const unfolded = new Set<string>()
// The calls of a run the mod itself unfolded, its rows drawn each by its own
// level: they come with `isExpanded` set, as the engine's own do.
const unfoldedHere = new Set<string>()

const toggle = ($: EngineInterface, key: string) => update($, opened, now => toggled(now, key))

const toggleRow = ($: EngineInterface, id: string) => update($, opened, now => rowToggled(now, id))

// --- Diffs ---

// Each call's outcome by its id, null for one found nowhere: kept from the
// rows drawn, else read from the transcript file.
const results = new Map<string, Outcome | null>()
let lookups: Promise<unknown> = Promise.resolve()
// The ids asked for and not read yet: a read takes all of them, those of the
// draws that came while the one before ran too.
const pending = new Set<string>()
// How many times each id was read in vain: the transcript file may not hold a
// result yet, and is read again a little later.
const misses = new Map<string, number>()
const RETRY_MS = 2000

const keep = (id: string | undefined, output: unknown) => {
  if (isKept(id, output)) {
    results.set(id, outcomeOf(output))
  }
}

const fromTranscript = async ($: EngineInterface, wanted: string[]) => {
  const root = (await $.env.get('CLAUDE_CONFIG_DIR')) ?? `${await $.env.get('HOME')}/.claude`
  const { exitCode, stdout, isStdoutTruncated } = await $.process.run(
    transcriptCommand(wanted, root, await $.session.id(), $.plugin.root),
  )

  if (exitCode === 0) {
    for (const { id, output } of resultsFrom(stdout, isStdoutTruncated)) {
      keep(id, output)
    }
  }
}

// Reads the pending ids. One found nowhere is null, and read again a little
// later, as often as RETRIES says, the rows drawn again then.
const lookup = async ($: EngineInterface) => {
  const wanted = unknownOf(pending, results)

  if (wanted.length > 0) {
    await fromTranscript($, wanted)
  }

  wanted.forEach(id => pending.delete(id))

  const lost = unknownOf(wanted, results)
  const again = retriable(lost, misses)

  lost.forEach(id => results.set(id, null))
  again.forEach(id => misses.set(id, (misses.get(id) ?? 0) + 1))

  if (again.length > 0) {
    $.clock.after(RETRY_MS, async () => {
      lostIn(again, results).forEach(id => results.delete(id))
      await update($, revision, n => n + 1)
    })
  }
}

const resultsOf = async ($: EngineInterface, ids: readonly string[]) => {
  const unknown = unknownOf(ids, results)

  if (unknown.length > 0) {
    unknown.forEach(id => pending.add(id))
    lookups = lookups
      .then(() => lookup($))
      .catch(() =>
        // Cut short with the draw that asked (one that took its place cancels
        // its calls): asked again off the drawing, then the rows drawn again.
        $.clock.after(0, async () => {
          await lookup($).catch(orElse($, 'reading the results from the transcript', undefined))
          pending.forEach(id => results.set(id, null))
          pending.clear()
          await update($, revision, n => n + 1)
        }),
      )
    await lookups
  }

  return foundFor(ids, results)
}

// --- The conversation's spans ---

let scanned: Promise<Scanned> | undefined

// The scan's only writers: `scanOf` reads the conversation once and keeps it,
// `forgetScan` drops it when the conversation changes.
const forgetScan = () => {
  scanned = undefined
}

const scanOf = ($: EngineInterface) => {
  // A read cut short (a draw that took its place cancels its calls) is not kept.
  scanned ??= $.session
    .messages({ as: 'api' })
    .then(messages => {
      const conversation = scan(messages)

      conversation.webFetches.forEach(id => fetches.add(id))

      return conversation
    })
    .catch((failure: unknown) => {
      forgetScan()

      return orElse($, 'reading the conversation', unread())(failure)
    })

  return scanned
}

// A row gone from the conversation is the engine's, as without the mod.
const isGone = async ($: EngineInterface, id: string, isRunning: boolean) => isGoneFrom(await scanOf($), id, isRunning)

const shownOf = async ($: EngineInterface): Promise<Shown> =>
  shownFor({ diffs: await read($, diffs), commands: await read($, commands), skills: await read($, skills) })

// --- Commands ---

const note = ($: StateDollar, id: string, patch: Timing) =>
  update($, { ...timings, id }, timing => ({ ...timing, ...patch }))

// The border every span sits in, around its rows' own widths.
const FRAME = {
  flexDirection: 'column',
  borderStyle: 'round',
  borderDimColor: true,
  paddingX: 1,
  alignSelf: 'flex-start',
} as const

/**
 * A span as one line, its calls' words, its edits' count and its time, all one
 * button; pressed, unfolded beneath it: a row per call, on a timeline, and a
 * row per file. A call pressed opens its input and the head of its result, a
 * file its diff.
 */
const drawSpan = async (
  $: EngineInterface,
  { Box, Button, Code, Text }: Elements,
  span: Span,
  shown: Shown,
  fresh: readonly ToolGroupCall[],
  columns: number,
) => {
  const calls = callsOf(span, shown, fresh)
  const open = await read($, opened)
  // A press turns the span from how spans start.
  const isOpen = isSpanOpen(await read($, startsOpen), open, span.first)
  const cwd = `${await $.session.cwd()}/`
  const { outputs, pictures } = await scanOf($)

  const wanted = wantedOf(span, shown, calls, pictures, open)
  const found = await resultsOf($, wanted)
  const outcomes = new Map(wanted.map((id, at) => [id, found[at]]))
  const edits = editsOf(span, shown, outcomes)
  const { done, failed } = splitEdits(edits)

  const rows = rowsOf(
    calls,
    await Promise.all(
      calls.map(async call =>
        call.tool_use_id === undefined ? undefined : await read($, { ...timings, id: call.tool_use_id }),
      ),
    ),
  )
  // Each edit's time, as a call's.
  const editTimes = new Map(
    await Promise.all(
      edits
        .filter(edit => !edit.isChange)
        .map(async edit => [edit.id, timeOf(await read($, { ...timings, id: edit.id }))] as const),
    ),
  )
  const now = isLive([...rows, ...editTimes.values()]) ? await $.clock.now() : 0
  const { isTimed, origin, total } = clockOf(rows, [...editTimes.values()], now)

  const files = filesOf(done, cwd)
  const entries = entriesOf(span.items, rows, edits, cwd)
  const fileRows = filesIn(entries)
  const { cells, hasBars, hasEditBars, labelRoom, statusRoom, rowWidth, noteRoom } = layoutOf(
    columns,
    isTimed,
    entries,
    editTimes,
  )

  // The counts, the added green, the removed red.
  const tally = (counts: { plus: string; minus: string }) => [
    <Text color="green">{counts.plus}</Text>,
    <Text color="red">{counts.minus}</Text>,
  ]
  // The line: words, then the counts, then the time and the arrow; unfolded,
  // padded to the rows below it, so a click anywhere on it folds it.
  const head = lineOf({
    calls,
    done: done.length,
    files,
    failed: failed.length,
    fileRows,
    isTimed,
    total,
    isOpen,
    rowWidth,
    hasEditBars,
  })

  // A command alone that changed no file, its kind hidden: nothing to tell.
  if (head === undefined) {
    return <Box />
  }

  const line = (
    <Button key="view" plain onPress={() => void toggle($, `span:${span.first}`)}>
      <Text dimColor>{head.words}</Text>
      {done.length > 0 ? tally(head.counts) : ''}
      <Text dimColor>{`${head.failure}${head.tail}`}</Text>
      {' '.repeat(padOf(head, isOpen))}
    </Button>
  )

  if (!isOpen) {
    return <Box {...FRAME}>{line}</Box>
  }

  // A row's bar: each of its tools' times on the span's clock, in `tone`, the
  // wait since the rows `before` it ended dotted.
  const barOf = (times: readonly (Time | undefined)[], before: number | undefined, tone: string) =>
    barRuns(times, before, { cells, origin, total, now }).map(({ mark, length }) =>
      mark === 'ran' ? (
        <Text color={tone}>{'━'.repeat(length)}</Text>
      ) : (
        <Text dimColor>{(mark === 'wait' ? '┄' : '─').repeat(length)}</Text>
      ),
    )

  // A call's row, or a run of calls alike (one tool on one input, one after
  // another) as one, `×n`; opened beneath it, its input and the head of each
  // result. `before`: when the rows before it ended, the start of its dotted wait.
  const callRow = (group: readonly [Row, ...Row[]], before: number | undefined) => {
    const [{ call, deny, at }] = group
    const id = call.tool_use_id ?? ''
    const isRowOpen = open.includes(`row:${id}`)
    const { name, times, whole, isWhole, about } = labelOf(call, group.length, labelRoom, isRowOpen)
    const { status, tone, hasFailed } = statusOf(group)
    const gaps = callGaps({ label: labelRoom, status: statusRoom }, { name, about, times }, status)

    // The head of one call's result, or all of it that fits once asked.
    const result = ({ call: own, at: place }: Row) => {
      const ownId = own.tool_use_id ?? ''
      const isFull = open.includes(`full:${ownId}`)
      const { said, rest } = resultOf(
        own,
        outputs.get(ownId) ?? '',
        pictures.get(ownId),
        outcomes.get(ownId)?.media,
        isFull,
        rowWidth,
      )

      return (
        <Box flexDirection="column">
          <Box flexDirection="row">
            <Text dimColor>{'⎿  '}</Text>
            <Box flexDirection="column">
              {said.map(text => (
                <Text dimColor={!own.isErrored} color={own.isErrored ? 'error' : undefined}>
                  {resultLine(text, rowWidth)}
                </Text>
              ))}
              {rest > 0 && !isFull ? (
                <Button
                  key={`more-${place}`}
                  plain
                  dimColor
                  label={restLabel(rest)}
                  onPress={() => void update($, opened, now => withFull(now, ownId))}
                />
              ) : rest > 0 ? (
                <Text dimColor>{restLabel(rest)}</Text>
              ) : null}
            </Box>
          </Box>
          {isFull && isTall(said.length) ? (
            <Button
              key={`fold-call-${place}`}
              plain
              dimColor
              label={foldLabel(name, whole, rowWidth)}
              onPress={() => void toggleRow($, id)}
            />
          ) : null}
        </Box>
      )
    }

    // The row is one button, laid out in padded text: a click anywhere on it opens it.
    const row = (
      <Button key={`call-${at}`} plain onPress={() => void toggleRow($, id)}>
        <Text weight="semibold" color={call.tool === 'Bash' ? 'warning' : 'suggestion'}>
          {glyphOf(call.tool, name)}
        </Text>{' '}
        <Text weight="semibold" strikethrough={deny !== undefined} dimColor={deny !== undefined}>
          {name}
        </Text>{' '}
        <Text strikethrough={deny !== undefined} dimColor={deny !== undefined}>
          {about}
        </Text>
        <Text dimColor>{times}</Text>
        {' '.repeat(gaps.label)}
        {/* Untimed, there is no time to draw a bar of; opened, the bar
            would run into the result beneath, so its room is blank. */}
        {hasBars && isRowOpen ? ' '.repeat(cells + 1) : hasBars ? [...barOf(group, before, tone), ' '] : ''}
        {' '.repeat(gaps.status)}
        <Text color={deny !== undefined || hasFailed ? 'error' : undefined} dimColor={call.isRunning}>
          {status}
        </Text>
      </Button>
    )

    return !isRowOpen ? (
      row
    ) : (
      <Box flexDirection="column">
        {row}
        <Box flexDirection="column" paddingLeft={2} width={rowWidth}>
          {isWhole ? null : <Text>{whole}</Text>}
          {group.map(result)}
        </Box>
      </Box>
    )
  }

  // A note under a call refused: what it would have run, and why not.
  const deniedRow = ({ call, deny = '' }: Row) => {
    const { would, why } = deniedOf(call, deny, noteRoom)

    return (
      <Box flexDirection="row" justifyContent="space-between" gap={1}>
        <Text color="error" strikethrough>
          {would}
        </Text>
        <Text color="error">{why}</Text>
      </Box>
    )
  }

  // An edit, or a file a command changed: its counts, opened its diff; one
  // that failed, struck through with why. On a timed span, laid out as a
  // call's row: its name, its bar, its counts where a call's time is.
  const fileRow = (file: FileLine, before: number | undefined) => {
    if (file.failure !== undefined) {
      const { name: struck, why } = failedOf({ shown: file.shown, failure: file.failure }, noteRoom)

      return (
        <Box flexDirection="row" justifyContent="space-between" gap={1}>
          <Text color="error" strikethrough>
            {struck}
          </Text>
          <Text color="error">{why}</Text>
        </Box>
      )
    }

    const key = file.key
    const isFileOpen = open.includes(key)
    const { counts, name, took, gap, tookGap } = fileRowOf(
      file,
      isFileOpen,
      { label: labelRoom, status: statusRoom },
      editTimes,
    )

    return (
      <Box key={key} flexDirection="column">
        <Button key={file.button} plain onPress={() => void toggle($, key)}>
          <Text weight="semibold" color="green">
            ±
          </Text>{' '}
          {name}
          {tally(counts)}
          {hasEditBars
            ? [' '.repeat(gap), ...barOf(timesOf(file, editTimes), before, 'success'), ' ', ' '.repeat(tookGap), took]
            : ''}
        </Button>
        {isFileOpen && file.hunks.length > 0 && (
          <Box paddingLeft={2} flexDirection="column">
            <Code source={unified(file.hunks)} format="diff" path={file.path} />
            {isTall(diffRows(file.hunks)) ? (
              <Button
                key={`fold-${file.button}`}
                plain
                dimColor
                label={`▴ ${file.shown}`}
                onPress={() => void toggle($, key)}
              />
            ) : null}
          </Box>
        )}
      </Box>
    )
  }

  // A call's row, or its run's, and the note under one refused (alone in its run).
  const callRows = ({ rows: group }: CallLine, before: number | undefined) => {
    const [first] = group

    return [callRow(group, before), ...(first.deny === undefined ? [] : [deniedRow(first)])]
  }
  // Every row where it happened in the span: a call (a command, a skill…) and
  // the files it changed, or an edit; each with when the timed rows before it ended.
  const befores = beforesOf(
    entries.map(entry => timesOf(entry, editTimes)),
    now,
  )
  const laid = entries.flatMap((entry, at) =>
    entry.kind === 'file' ? [fileRow(entry, befores[at])] : callRows(entry, befores[at]),
  )

  return (
    <Box {...FRAME}>
      {line}
      {laid}
      {isTallSpan(rows, fileRows, outputs, open) ? (
        <Button
          key="fold"
          plain
          dimColor
          label={`▴ ${TEXT.fold}`}
          onPress={() => void toggle($, `span:${span.first}`)}
        />
      ) : null}
    </Box>
  )
}

// --- The footer ---

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
    // A new conversation (/clear, /resume) in the same process: nothing read of the last one holds.
    forgetScan()
    unfolded.clear()
    unfoldedHere.clear()
    fetches.clear()
    results.clear()
    pending.clear()
    misses.clear()

    await start($)

    return next(e)
  })

  // --- Timings, for the commands' timeline ---

  on('tool.call', async ($, e, next) => {
    await note($, e.tool_use_id, { startedAt: await $.clock.now() })
    const ran = await next(e)
    await note($, e.tool_use_id, endTiming(await $.clock.now(), ran.deny))

    return ran
  })

  on('tool.check', async ($, e, next) => {
    const verdict = await next(e)
    const timing = verdictTiming(verdict)

    if (e.tool_use_id !== undefined && timing !== undefined) {
      await note($, e.tool_use_id, timing)
    }

    return verdict
  })

  on('classic.PermissionDenied', async ($, e, next) => {
    await note($, e.tool_use_id, { deny: e.reason })

    return next(e)
  })

  on('classic.PostToolUse', async ($, e, next) => {
    await note($, e.tool_use_id, { hasRun: true, ranMs: e.duration_ms })

    return next(e)
  })

  on('classic.PostToolUseFailure', async ($, e, next) => {
    await note($, e.tool_use_id, { hasRun: true, ranMs: e.duration_ms })

    return next(e)
  })

  // A button in the footer's first slot row, third after the mods' and the
  // companion's, that opens the pane. The mod draws on the terminal only, so elsewhere it
  // lays the slot rows and adds nothing.
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const beneath = await next(e)

    if (e.surface !== 'terminal') {
      return slotted(beneath, [])
    }

    // Drawing writes no state: the start runs on a timer of its own.
    if (!hasStarted) {
      hasStarted = true
      $.clock.after(0, () => void start($))
    }

    const isActive = await isDrawing($)
    const { Box, Button, Text } = $.ui.resolve(e)

    // As the companion's: its dot green while it draws, gray while it leaves Claude Code's.
    return slotted(beneath, [
      <Box key="slot:1.3:ui-declutter">
        <Button key="declutter" plain dimColor onPress={() => void togglePane($)}>
          <Text color={isActive ? 'success' : 'inactive'}>{isActive ? '●' : '○'}</Text> declutter
        </Button>
      </Box>,
    ])
  })

  // The switch, the diffs', the commands' and the skills' levels, how grouped
  // spans start, and where the settings are saved.
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const isActive = await read($, isOn)
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
    // A level is a row of options a click picks, not a Select, which only the keyboard drives.
    const choose = async (key: 'diffs' | 'commands' | 'skills', value: Level) => {
      await (key === 'diffs'
        ? update($, diffs, () => value)
        : key === 'commands'
          ? update($, commands, () => value)
          : update($, skills, () => value))
      await changed($)
    }
    const level = (key: 'diffs' | 'commands' | 'skills', label: string, now: Level) => (
      <Box key={key} flexDirection="row" gap={2}>
        <Text>{label}:</Text>
        {LEVELS.map(({ value, label: name }) =>
          pill(`${key}-${value}`, name, value === now, () => void choose(key, value)),
        )}
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
          {check('switch', TEXT.active, isActive, () => void update($, isOn, was => !was).then(() => changed($)))}
          <Text dimColor>{TEXT.activeNote}</Text>
        </Box>
        {isActive && (
          <Box flexDirection="column">
            {level('diffs', TEXT.diffs, await read($, diffs))}
            {level('commands', TEXT.commands, await read($, commands))}
            {level('skills', TEXT.skills, await read($, skills))}
            <Text dimColor>{TEXT.levelsNote}</Text>
          </Box>
        )}
        {isActive && (
          <Box flexDirection="column">
            {check('startsOpen', TEXT.startsOpen, await read($, startsOpen), async () => {
              // Every span takes the new start: the presses that turned some are forgotten.
              await update($, opened, withoutSpans)
              await update($, startsOpen, was => !was)
              await changed($)
            })}
            <Text dimColor>{TEXT.startsOpenNote}</Text>
          </Box>
        )}
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
          <Button
            key="reset"
            variant="secondary"
            label={TEXT.reset}
            onPress={() => void apply($, DEFAULTS).then(() => changed($))}
          />
        </Box>
      </Box>
    )
  })

  // --- Rows ---

  // An edit's row, or a call's the engine draws alone: the engine's in full,
  // nothing hidden; in summary, its span's line where the span draws, nothing
  // elsewhere. A row drawn in full (a run the engine unfolded, ctrl+o,
  // --verbose) is the engine's, but for those of a run the mod unfolded.
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const id = e.props.tool_use_id
    const tool = nameOf(id, e.props.tool, e.props.input)
    const kind = kindOf(tool)

    if (kind !== undefined) {
      keep(id, e.props.output)
    }

    await read($, revision)

    if (
      kind === undefined ||
      isEngineRow(id, e.props.isExpanded, unfolded, unfoldedHere) ||
      e.surface !== 'terminal' ||
      !(await isDrawing($)) ||
      (await isGone($, id, e.props.isRunning))
    ) {
      return next(e)
    }

    const level = await levelOf($, tool)
    const { Box, Button, Code, Text } = $.ui.resolve(e)

    if (level === 'full') {
      return next(e)
    }

    const shown = await shownOf($)
    const own: ToolGroupCall = {
      tool_use_id: id,
      tool,
      input: e.props.input,
      isRunning: e.props.isRunning,
      isErrored: e.props.isErrored,
      isInterrupted: e.props.isInterrupted,
    }
    // A row the conversation does not hold yet is a span of its own.
    const span = foldable(
      (await scanOf($)).spans.get(id) ?? { first: id, items: [itemOf(own, e.props.output)] },
      unfolded,
    )

    // A hidden kind draws no span, but a command may for the files it changed.
    if (drawerOf(span, shown) !== id) {
      return <Box />
    }

    return drawSpan($, { Box, Button, Code, Text }, span, shown, [own], e.viewport?.columns ?? 80)
  })

  // A background task's notice that it ended, a call of its span: drawn as one.
  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    const { task } = e.props

    if (
      e.props.origin.kind !== 'task-notification' ||
      task?.id === undefined ||
      !isEnding(task.status ?? '') ||
      e.props.isExpanded ||
      e.surface !== 'terminal'
    ) {
      return next(e)
    }

    await read($, revision)

    const id = noticeId(task.id)

    if (!(await isDrawing($)) || (await isGone($, id, false)) || (await read($, commands)) === 'full') {
      return next(e)
    }

    const { Box, Button, Code, Text } = $.ui.resolve(e)
    const shown = await shownOf($)
    // A notice the conversation does not hold yet is a span of its own; one it
    // does is drawn as it holds it, its summary the same on every row of the span.
    const span = foldable(
      (await scanOf($)).spans.get(id) ?? {
        first: id,
        items: [{ kind: 'calls', call: noticeCall(task.id, task.status ?? '', e.props.text) }],
      },
      unfolded,
    )

    if (drawerOf(span, shown) !== id) {
      return <Box />
    }

    return drawSpan($, { Box, Button, Code, Text }, span, shown, [], e.viewport?.columns ?? 80)
  })

  // The result under a row drawn alone: an edit's, or a call's, is in its
  // span short of full; a shell command's, full, is the engine's whole, the
  // files it changed but for the diffs hidden.
  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    const tool = nameOf(e.props.tool_use_id, e.props.tool)
    const kind = kindOf(tool)

    if (kind !== undefined) {
      keep(e.props.tool_use_id, e.props.output)
    }

    await read($, revision)

    // Drawn in full (ctrl+o, --verbose): as the engine draws it.
    if (
      e.props.isExpanded === true ||
      e.surface !== 'terminal' ||
      !(await isDrawing($)) ||
      (await isGone($, e.props.tool_use_id, false))
    ) {
      return next(e)
    }

    const level = kind === undefined ? undefined : await levelOf($, tool)

    if (level !== undefined && level !== 'full') {
      const { Box } = $.ui.resolve(e)

      return <Box />
    }

    if (e.props.tool === 'Bash' && (await read($, diffs)) === 'hidden') {
      const output = withoutBashEdit(e.props.output)

      if (output !== undefined) {
        return next({ ...e, props: { ...e.props, output } })
      }
    }

    return next(e)
  })

  // A run the engine folds, of calls or of edits: as the engine draws it if
  // every kind of it is full; its rows if some kind is, each drawn by its own
  // kind's level; nothing if all are hidden; else its span's line where the
  // span draws, nothing elsewhere.
  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    const ids = e.props.calls.map(call => call.tool_use_id ?? '')

    e.props.calls.forEach(call => {
      keep(call.tool_use_id, call.output)
    })

    // Unfolded by the engine itself (ctrl+o, --verbose, a click on its row):
    // its rows are the engine's, while it is.
    engineUnfolds(ids, e.props.isExpanded, unfolded, unfoldedHere)

    if (e.props.isExpanded) {
      return next(e)
    }

    await read($, revision)

    if (
      e.surface !== 'terminal' ||
      !(await isDrawing($)) ||
      (await isGone(
        $,
        ids[0] ?? '',
        e.props.calls.some(call => call.isRunning),
      ))
    ) {
      return next(e)
    }

    const { Box, Button, Code, Text } = $.ui.resolve(e)
    const levels = await Promise.all(e.props.calls.map(call => levelOf($, call.tool)))
    const treatment = treatmentOf(levels)

    if (treatment === 'engine') {
      return next(e)
    }

    if (treatment === 'rows') {
      ids.forEach(id => unfoldedHere.add(id))

      return next({ ...e, props: { ...e.props, isExpanded: true } })
    }

    const shown = await shownOf($)
    // A run the conversation does not hold yet is a span of its own.
    const span = foldable(
      (await scanOf($)).spans.get(ids[0] ?? '') ?? {
        first: ids[0] ?? '',
        items: e.props.calls.map(call => itemOf(call, call.output)),
      },
      unfolded,
    )

    // A kind hidden draws nothing, all hidden no span, but for the files a command changed.
    if (!ids.includes(drawerOf(span, shown) ?? '')) {
      return <Box />
    }

    return drawSpan($, { Box, Button, Code, Text }, span, shown, e.props.calls, e.viewport?.columns ?? 80)
  })

  // A new row may start a span, join one or bring a call's result, a notice of
  // a task's end too: read the conversation again, and redraw the tool rows
  // and the notices alone rather than every row.
  on('session.append', async ($, e, next) => {
    const kept = await next(e)
    const { resultIds, isCall } = arrivalOf(e.message.content, e.origin.kind)

    forgetScan()
    lostIn(resultIds, results).forEach(id => results.delete(id))

    if (isCall && (await isDrawing($))) {
      await update($, revision, n => n + 1)
    }

    return kept
  })
}
