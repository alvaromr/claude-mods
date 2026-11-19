import type { Digest, Mode, Note } from '../types'
import { TEXT } from './text'

/**
 * The points of a text, each sent on its own: every list item with the lines
 * that continue it, and what comes before the first; the whole text when it
 * has no list.
 */
export const points = (text: string) =>
  text
    .split('\n')
    .filter(line => line.trim() !== '')
    .reduce<string[]>((all, line) => {
      const isItem = /^\s*([-*•]|\d+[.)])\s/.test(line)

      return isItem || all.length === 0 ? [...all, line] : [...all.slice(0, -1), `${all.at(-1)}\n${line}`]
    }, [])

/**
 * The text of a note of the mode (`n`), or with no number of its kept text,
 * when it still holds every point of `part`; none when it is gone, or was
 * rewritten since `part` was drawn.
 */
export const sharable = (
  digests: Partial<Record<Mode, Digest>>,
  notes: readonly Note[],
  chosen: Mode,
  part: string,
  n?: number,
) => {
  const text = n === undefined ? digests[chosen]?.text : notes.find(note => note.mode === chosen && note.n === n)?.text

  return text !== undefined && points(part).every(point => points(text).includes(point)) ? text : undefined
}

/**
 * The lines the transcript shows of what was sent: a header naming the mode
 * (and the note), then the part, a line of it to a row.
 */
export const sentLines = (chosen: Mode, n: number | undefined, part: string) => [
  TEXT.sentHeader(chosen, n),
  ...part.split('\n'),
]

/** Whether a point was already sent. */
export const isSent = (sent: readonly string[] | undefined, point: string) => sent?.includes(point) === true

/** An item with the points of `part` marked sent. */
const marked = <T extends { text: string; sent?: string[] }>(item: T, part: string): T => ({
  ...item,
  sent: [...(item.sent ?? []), ...points(part)],
})

/** The kept texts with the points sent marked, in the text sent and not in one written in its place meanwhile. */
export const sentDigest = (all: Partial<Record<Mode, Digest>>, chosen: Mode, text: string, part: string) => {
  const now = all[chosen]

  return now?.text === text ? { ...all, [chosen]: marked(now, part) } : all
}

/** The notes with the points sent marked, in the note sent and not in one written in its place meanwhile. */
export const sentNote = (list: readonly Note[], chosen: Mode, n: number, text: string, part: string) =>
  list.map(note => (note.mode === chosen && note.n === n && note.text === text ? marked(note, part) : note))
