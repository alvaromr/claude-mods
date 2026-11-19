import type { ToolGroupCall } from 'claude-code'

import { callsWord } from './calls'
import { clipStart, widthOf } from './cells'
import { countsOf } from './outcome'
import type { Hunk } from './outcome'
import { TEXT } from './text'

/** A time in words: «1.4s» under a minute, else «2m 5s». */
export const seconds = (ms: number) => {
  const whole = Math.round(ms / 1000)

  // Under a minute as it rounds to a tenth, else in whole seconds: 119.6 s is 2m 0s, not 1m 60s.
  return Math.round(ms / 100) < 600 ? `${(ms / 1000).toFixed(1)}s` : `${Math.floor(whole / 60)}m ${whole % 60}s`
}

/** What a call's input is about, on one line: its command, else its file's name, else its first text. */
export const subject = (input: unknown) => {
  if (typeof input !== 'object' || input === null) {
    return ''
  }

  const { command, file_path: file, ...rest } = input as Record<string, unknown>
  const text =
    typeof command === 'string'
      ? command
      : typeof file === 'string'
        ? file.split('/').pop()
        : Object.values(rest).find(value => typeof value === 'string')

  return typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : ''
}

// The longest path a line names; a longer one keeps its end, its file's name.
const PATH_LENGTH = 60

/** A path under the session's folder from it; any path cut from the left to fit. */
export const relative = (path: string, cwd: string) => {
  const shown = path.startsWith(cwd) ? path.slice(cwd.length) : path

  return widthOf(shown) > PATH_LENGTH ? `…${clipStart(shown, PATH_LENGTH - 1)}` : shown
}

/** The blanks that pad an unfolded span's line to the rows' width beneath it; none folded. */
export const padOf = (head: { width: number; length: number }, isOpen: boolean) =>
  isOpen ? Math.max(0, head.width - head.length) : 0

// The edits' words: «3 cambios · 2 ficheros», the file named when one.
const editsWord = (edits: number, shown: readonly string[]) => {
  const files = [...new Set(shown)]

  return `${TEXT.changes(edits)} · ${files.length === 1 ? (files[0] ?? '') : TEXT.files(files.length)}`
}

type FileLine = { shown: string; hunks: readonly Hunk[]; isKnown: boolean }

/**
 * A span's line: the words of its calls and edits, the edits that failed
 * counted apart, its counts, its time and its arrow, and how wide its rows
 * are. Nothing for a span with nothing to tell (a command alone that changed
 * no file, its kind hidden).
 */
export const lineOf = (span: {
  calls: readonly ToolGroupCall[]
  /** The edits that changed something, and the files they changed. */
  done: number
  files: readonly FileLine[]
  failed: number
  /** The rows beneath it, a file's failed too. */
  fileRows: readonly (FileLine & { failure?: string })[]
  isTimed: boolean
  total: number
  isOpen: boolean
  /** The width of the calls' rows, and whether the files' draw bars as they do. */
  rowWidth: number
  hasEditBars: boolean
}) => {
  const words = [
    span.calls.length > 0 ? callsWord(span.calls) : '',
    span.done > 0
      ? editsWord(
          span.done,
          span.files.map(file => file.shown),
        )
      : '',
  ]
    .filter(Boolean)
    .join(' · ')
  // The edits that changed nothing, counted apart, after the rest.
  const failure = span.failed === 0 ? '' : `${words === '' ? '' : ' · '}${TEXT.failed(span.failed)}`

  if (words === '' && failure === '') {
    return undefined
  }

  const counts = countsOf(
    span.files.flatMap(file => file.hunks),
    span.files.every(file => file.isKnown),
  )
  const tail = `${span.calls.length > 0 && span.isTimed ? ` · ${seconds(span.total)}` : ''} ${span.isOpen ? '▾' : '▸'}`

  return {
    words,
    failure,
    tail,
    counts,
    // The line's own width, and the rows' beneath it: the calls' rows, or the files' with their bars, else the longest file's.
    length: widthOf(words) + (span.done > 0 ? counts.length : 0) + widthOf(failure) + widthOf(tail),
    width:
      span.calls.length > 0 || span.hasEditBars
        ? span.rowWidth
        : Math.max(
            0,
            ...span.fileRows.map(file =>
              file.failure === undefined
                ? widthOf(`± ${file.shown} ▸`) + countsOf(file.hunks, file.isKnown).length
                : widthOf(`✗ ${file.shown}`) + 1 + widthOf(file.failure),
            ),
          ),
  }
}
