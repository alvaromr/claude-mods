import type { Digest, Mode, Note } from '../types'
import { ROLLING, titleOf } from './modes'
import { isSilent } from './reply'
import { TEXT } from './text'

type Digests = Partial<Record<Mode, Digest>>

/** How many notes a mode keeps: the newest. */
const KEPT = 20

/** Whether a note is the one given: the same mode, number and text, so one written in its place is not. */
export const isSame = (note: Note, other: Note | undefined) =>
  other !== undefined && note.mode === other.mode && note.n === other.n && note.text === other.text

/**
 * The notes once a mode's reply is in. Each mode keeps and numbers its own.
 * Made again (`target` is the note it was made from), the new note takes the
 * place of the one it was made from, and silence leaves none there; if the
 * person discarded that one meanwhile, the notes stay as they were and
 * `isGone` says there was nothing to make again.
 */
export const withNote = (
  list: Note[],
  { mode, text, target }: { mode: Mode; text: string; target: Note | undefined },
) => {
  const all = list.filter(kept => kept.mode === mode)
  const own = all.filter(kept => !isSame(kept, target))
  const added: Note = { n: (own.at(-1)?.n ?? 0) + 1, text, mode }
  const isGone = target !== undefined && own.length === all.length

  return {
    isGone,
    list: isGone
      ? list
      : [...list.filter(kept => kept.mode !== mode), ...(isSilent(text) ? own : [...own, added]).slice(-KEPT)],
  }
}

/** The notes without one of the mode's, by its number. */
export const withoutNote = (list: Note[], chosen: Mode, n: number) =>
  list.filter(note => !(note.mode === chosen && note.n === n))

/** The notes without any of the mode's; the next one is numbered 1 again. */
export const withoutNotes = (list: Note[], chosen: Mode) => list.filter(note => note.mode !== chosen)

/**
 * The kept texts once a compaction replaced the transcript they count their
 * messages in: what they cover is nothing now.
 */
export const afterCompaction = (all: Digests): Digests => ({
  ...all,
  ...Object.fromEntries(
    ROLLING.flatMap(each => {
      const kept = all[each]

      return kept === undefined ? [] : [[each, { ...kept, covered: 0 }]]
    }),
  ),
})

/** A card of the pane: a mode's kept text, or one of its notes. */
export type Card = {
  text: string
  sent: string[] | undefined
  title: string
  isOld: boolean
  /** The number of the note, absent for a kept text. */
  n: number | undefined
  sendKey: string
  discardKey: string
}

/**
 * What the pane shows of a mode: its kept text alone; or its own notes, newest
 * first, the ones before it old.
 */
export const cardsOf = (chosen: Mode, digests: Digests, notes: readonly Note[]): Card[] => {
  if (ROLLING.includes(chosen)) {
    const kept = digests[chosen]

    return kept === undefined
      ? []
      : [
          {
            text: kept.text,
            sent: kept.sent,
            title: titleOf(chosen),
            isOld: false,
            n: undefined,
            sendKey: 'send',
            discardKey: 'discard',
          },
        ]
  }

  return notes
    .filter(note => note.mode === chosen)
    .reverse()
    .map((note, index) => ({
      text: note.text,
      sent: note.sent,
      title: TEXT.note(note.n),
      isOld: index > 0,
      n: note.n,
      sendKey: `send-${note.n}`,
      discardKey: `discard-${note.n}`,
    }))
}
