import type { ToolGroupCall } from 'claude-code'

import { clip, widthOf } from './cells'
import { idOf } from './conversation'
import type { Item } from './conversation'
import { countsOf, fitting } from './outcome'
import type { Hunk } from './outcome'
import type { EditLine } from './span'
import { relative, seconds, subject } from './summary'
import type { Row, Time } from './timeline'

// The lines of a call's result an opened row shows, as the engine's row does.
const OUTPUT_LINES = 10
// Past this many rows an unfolded span, or an opened diff, ends with a button
// that folds it, for when its line has scrolled out of sight.
const TALL = 15
const STATUS_ROOM = 9
// The least room a row's label keeps, however narrow the screen.
const MIN_LABEL = 8

/** Whether that many rows are past what a fold button waits for. */
export const isTall = (rows: number) => rows > TALL

/**
 * A file's row: an edit, or a file a command changed. Edits of one file made
 * one after another are one row, their changes summed; another row between
 * them starts a new one. `ids`: the edits whose times the row draws; a
 * command's files have none, their time being the command's.
 */
export type FileLine = {
  kind: 'file'
  key: string
  button: string
  path: string
  shown: string
  hunks: Hunk[]
  isKnown: boolean
  failure?: string
  ids: string[]
}
/** A call's row, or a run of calls alike one after another as one: all its rows. */
export type CallLine = { kind: 'calls'; rows: [Row, ...Row[]] }

/** The file rows among a span's rows. */
export const filesIn = (entries: readonly (CallLine | FileLine)[]) =>
  entries.filter((entry): entry is FileLine => entry.kind === 'file')

/** The times a span's row draws its bar of: a file's, its edits' own (a command's files have none); a call's, its rows'. */
export const timesOf = (entry: CallLine | FileLine, editTimes: ReadonlyMap<string, Time>): (Time | undefined)[] =>
  entry.kind === 'file' ? entry.ids.map(id => editTimes.get(id)) : entry.rows

/** How many rows a diff takes: a line for each hunk's head and one for each of its lines. */
export const diffRows = (hunks: readonly Hunk[]) => hunks.reduce((sum, hunk) => sum + 1 + hunk.lines.length, 0)

// A call that ended well, unrefused and not stopped.
const isPlain = ({ call, deny }: Row) => deny === undefined && !call.isRunning && !call.isErrored && !call.isInterrupted

/** The files the edits that changed something made, each with all its hunks. */
export const filesOf = (done: readonly EditLine[], cwd: string) => {
  const byPath = new Map<string, EditLine[]>()

  for (const edit of done) {
    byPath.set(edit.path, [...(byPath.get(edit.path) ?? []), edit])
  }

  return [...byPath].map(([path, some]) => ({
    path,
    shown: relative(path, cwd),
    hunks: some.flatMap(edit => edit.hunks ?? []),
    isKnown: some.every(edit => edit.hunks !== null),
  }))
}

/**
 * The span's rows in the order they ran: a call shown, by its id; a file row
 * for each edit and each file a command changed, by the id that made it, `n`
 * telling apart the files one command changed. Calls alike one after another
 * (one tool on one input, each ended well and unrefused) are one.
 */
export const entriesOf = (items: readonly Item[], rows: readonly Row[], edits: readonly EditLine[], cwd: string) => {
  const entries: (CallLine | FileLine)[] = []
  const rowAt = new Map(rows.map(row => [row.call.tool_use_id ?? '', row]))

  for (const item of items) {
    const id = idOf(item)
    const row = rowAt.get(id)

    if (item.kind === 'calls' && row !== undefined) {
      const last = entries.at(-1)
      const lastCall = last?.kind === 'calls' ? last.rows[0].call : undefined

      if (
        last?.kind === 'calls' &&
        lastCall?.tool === row.call.tool &&
        subject(lastCall.input) === subject(row.call.input) &&
        last.rows.every(isPlain) &&
        isPlain(row)
      ) {
        last.rows.push(row)
      } else {
        entries.push({ kind: 'calls', rows: [row] })
      }
    }

    edits
      .filter(edit => edit.id === id)
      .forEach((edit, n) => {
        const last = entries.at(-1)

        if (
          !edit.isChange &&
          edit.failure === undefined &&
          last?.kind === 'file' &&
          last.path === edit.path &&
          last.failure === undefined &&
          last.ids.length > 0
        ) {
          last.hunks.push(...(edit.hunks ?? []))
          last.isKnown &&= edit.hunks !== null
          last.ids.push(edit.id)

          return
        }

        entries.push({
          kind: 'file',
          key: `file:${id}:${edit.path}`,
          button: `file-${id}-${n}`,
          path: edit.path,
          shown: relative(edit.path, cwd),
          hunks: [...(edit.hunks ?? [])],
          isKnown: edit.hunks !== null,
          failure: edit.failure,
          ids: edit.isChange ? [] : [edit.id],
        })
      })
  }

  return entries
}

/**
 * Where a span's rows put their words and bars on a screen `columns` wide: the
 * bar's width in cells (none where the label would be left too little room),
 * the label's room, the rows' width and a note's room. `hasEditBars`: whether a
 * file row draws bars too: the span is timed, some edit has a time, and
 * another row is there to set it against; alone, its bar would only scale its
 * few milliseconds to the span's own.
 */
export const layoutOf = (
  columns: number,
  isTimed: boolean,
  entries: readonly (CallLine | FileLine)[],
  editTimes: ReadonlyMap<string, Time>,
) => {
  const room = columns - 8
  const wide = room < 50 ? 10 : Math.max(20, Math.floor(room / 3))
  // A row too narrow for its bar beside the shortest label goes without a bar.
  const cells = room - 3 - (wide + 1) - STATUS_ROOM >= MIN_LABEL ? wide : 0
  const hasBars = isTimed && cells > 0
  const labelRoom = Math.max(MIN_LABEL, room - 3 - (cells > 0 ? cells + 1 : 0) - STATUS_ROOM)

  return {
    cells,
    hasBars,
    hasEditBars:
      hasBars &&
      entries.length > 1 &&
      entries.some(entry => entry.kind === 'file' && entry.ids.some(id => editTimes.get(id)?.startedAt !== undefined)),
    labelRoom,
    statusRoom: STATUS_ROOM,
    // A row: its glyph, its label, its bar and its status.
    rowWidth: 1 + 1 + labelRoom + 1 + (hasBars ? cells + 1 : 0) + STATUS_ROOM,
    noteRoom: Math.floor(room / 2),
  }
}

/** Whether an unfolded span is tall: its rows, an opened call counted as its result's lines, an opened file as its diff's. */
export const isTallSpan = (
  rows: readonly Row[],
  files: readonly FileLine[],
  outputs: ReadonlyMap<string, string>,
  open: readonly string[],
) =>
  isTall(
    rows.length +
      rows.filter(row => row.deny !== undefined).length +
      rows.reduce((sum, { call: { tool_use_id: id = '' } }) => {
        const length = (outputs.get(id) ?? '').split('\n').length

        return (
          sum +
          (open.includes(`row:${id}`) ? Math.min(length, open.includes(`full:${id}`) ? length : OUTPUT_LINES) + 2 : 0)
        )
      }, 0) +
      files.reduce((sum, file) => sum + 1 + (open.includes(file.key) ? diffRows(file.hunks) : 0), 0),
  )

/** The sign a call's row starts with: a command's a dollar, any other tool's the first letter of its name. */
export const glyphOf = (tool: string, name: string) =>
  tool === 'Bash' ? '$' : (Array.from(name)[0] ?? '').toUpperCase()

/** The blanks that set a call row's columns: after its words, up to its bar, and before its status. */
export const callGaps = (
  room: { label: number; status: number },
  words: { name: string; about: string; times: string },
  status: string,
) => ({
  label: Math.max(0, room.label - widthOf(words.name) - 1 - widthOf(words.about) - words.times.length) + 1,
  status: Math.max(0, room.status - status.length),
})

/** The note under a call refused: what it would have run, and why not, each in `room` cells, the reason on one line. */
export const deniedOf = (call: ToolGroupCall, deny: string, room: number) => ({
  would: clip(`⊘ ${subject(call.input)}`, room),
  why: clip(`denied · ${deny.replace(/\s+/g, ' ')}`, room),
})

/** A file's row that failed, struck through in `room` cells with why. */
export const failedOf = (file: { shown: string; failure: string }, room: number) => ({
  name: clip(`✗ ${file.shown}`, room),
  why: clip(file.failure, room),
})

/**
 * What a file's row says: its name with how many edits made it and an arrow
 * for its diff, the counts, and, on a span whose file rows draw bars, the
 * edits' own time summed (a command's files tell none) and the blanks that
 * set the bar's column and the time's.
 */
export const fileRowOf = (
  file: FileLine,
  isOpen: boolean,
  room: { label: number; status: number },
  editTimes: ReadonlyMap<string, Time>,
) => {
  const counts = countsOf(file.hunks, file.isKnown)
  // Edits of the file one after another, how many.
  const times = file.ids.length > 1 ? ` ×${file.ids.length}` : ''
  const name = clip(`${file.shown}${times} ${isOpen ? '▾' : '▸'}`, Math.max(4, room.label - counts.length))
  const isTimed = file.ids.some(id => editTimes.get(id)?.ms !== undefined)
  const took = isTimed ? seconds(file.ids.reduce((sum, id) => sum + (editTimes.get(id)?.ms ?? 0), 0)) : ''

  return {
    counts,
    name,
    took,
    gap: Math.max(0, room.label - widthOf(name) - counts.length) + 1,
    tookGap: Math.max(0, room.status - took.length),
  }
}

/** The label of the button that folds an opened result, the call's name and its whole input in `width` cells. */
export const foldLabel = (name: string, whole: string, width: number) => `▴ ${clip(`${name} ${whole}`, width - 4)}`

/** A result's line in a row `width` cells wide, past its «⎿» margin. */
export const resultLine = (text: string, width: number) => clip(text, width - 5)

/** The words that tell how many lines of a result are left out. */
export const restLabel = (rest: number) => `… +${rest} lines`

/** How a call's row ends: its status in a word or the time, and the tone it takes. */
export const statusOf = (group: readonly [Row, ...Row[]]) => {
  const [{ call, deny }] = group
  const isTimedRow = group.some(row => row.ms !== undefined)
  const took = isTimedRow ? seconds(group.reduce((sum, row) => sum + (row.ms ?? 0), 0)) : ''
  const hasFailed = call.isErrored || call.isInterrupted

  return {
    hasFailed,
    tone: deny !== undefined ? ('warning' as const) : hasFailed ? ('error' as const) : ('success' as const),
    status:
      deny !== undefined
        ? 'denied'
        : call.isRunning
          ? 'running'
          : call.isInterrupted
            ? 'stopped'
            : `${took}${call.isErrored ? ' ✗' : ''}`,
  }
}

/**
 * A call's row's words in `room` cells: its tool's name, its input (kept out
 * where it is whole beneath an opened row), and how many alike it stands for.
 */
export const labelOf = (call: ToolGroupCall, count: number, room: number, isOpen: boolean) => {
  const name = clip(call.tool.split('__').pop() ?? call.tool, room)
  const times = count > 1 ? ` ×${count}` : ''
  const whole = subject(call.input)
  const clipped = clip(whole, room - widthOf(name) - 1 - times.length)
  // Opened, a clipped input is drawn whole beneath alone, not twice.
  const isWhole = !isOpen || clipped === whole

  return { name, times, whole, isWhole, about: isWhole ? clipped : '' }
}

/**
 * The head of one call's result, or all of it that fits once asked, and how
 * many lines are left out. A read tells what it took in.
 */
export const resultOf = (
  call: ToolGroupCall,
  output: string,
  picture: string | undefined,
  media: string | undefined,
  isFull: boolean,
  width: number,
) => {
  // The notes the engine adds for the model are not the tool's output.
  const lines = output
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '')
    .replace(/\n+$/, '')
    .split('\n')
  const said = call.isRunning
    ? ['Running…']
    : call.tool === 'Read' && !call.isErrored
      ? [
          picture === undefined
            ? `Read ${lines.length} ${lines.length === 1 ? 'line' : 'lines'}`
            : (media ?? `Read ${picture}`),
        ]
      : lines.join('') === ''
        ? [picture === undefined ? '(No output)' : `(${picture})`]
        : isFull
          ? fitting(lines.map(text => resultLine(text, width)))
          : lines.slice(0, OUTPUT_LINES)

  return { said, rest: call.tool === 'Read' ? 0 : lines.length - said.length }
}
