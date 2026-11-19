import type { SessionMessage, ToolUseSummary } from 'claude-code'

import type { Digest, Mode, Note } from '../types'
import { ROLLING } from './modes'
import { isSame } from './notes'
import { TEXT } from './text'

/**
 * What is asked of the model: the picked mode's own answer, the summary the
 * modes of notes start from, or the picked mode's answer made again.
 */
export type Ask = 'own' | 'summary' | 'redo'

const clip = (text: string, room: number) => (text.length > room ? `${text.slice(0, room)}…` : text)

/** One tool call: what was called, with what, and the error it gave when it failed. */
const called = ({ tool, input, isError, text }: ToolUseSummary) => {
  const failed = text === undefined ? TEXT.failed : TEXT.failedWith(clip(text.trim(), 300))

  return `${TEXT.toolCall(tool, clip(JSON.stringify(input), 200))}${isError ? failed : ''}`
}

/** One message as the advisor reads it: who spoke, what, and the tools called. */
const told = ({ role, text, toolUses }: SessionMessage) => {
  const said = [clip(text.trim(), 1500), ...toolUses.map(called)].filter(part => part !== '')

  return said.length === 0 ? '' : TEXT.speaker(role === 'user', said.join('\n'))
}

const transcript = (messages: readonly SessionMessage[]) => messages.map(told).filter(Boolean).join('\n\n')

/**
 * What the model reads: the mode's kept text and what it lacks, or the notes
 * and the conversation's end under the summary made when the mode was picked.
 * Made again, it reads as if the text, or the note being made again (`target`),
 * had not been written.
 */
export const brief = ({
  chosen,
  messages,
  ask,
  target,
  digests,
  notes,
}: {
  chosen: Mode
  messages: readonly SessionMessage[]
  ask: Ask
  target: Note | undefined
  digests: Partial<Record<Mode, Digest>>
  notes: readonly Note[]
}) => {
  const { [chosen]: kept, resumen: summary } = digests

  if (ROLLING.includes(chosen)) {
    const own = ask === 'redo' ? undefined : kept
    // A compaction zeroes what the text covers (`session.compact`); a
    // transcript still shorter than it was compacted unseen: read it whole.
    const from = own === undefined || own.covered > messages.length ? 0 : own.covered

    return [TEXT.youWrote, own?.text ?? TEXT.blank, '', TEXT.whatsNew, transcript(messages.slice(from))].join('\n')
  }

  const earlier = notes.filter(note => note.mode === chosen && !isSame(note, target))
  // The turn whole, from the person's prompt, and never less than the last 12 messages.
  const prompted = messages.findLastIndex(message => message.role === 'user' && message.text.trim() !== '')
  const tail = messages.length - 12
  const from = Math.max(0, prompted === -1 ? tail : Math.min(prompted, tail))

  return [
    ...(summary === undefined ? [] : [TEXT.earlierSummary, summary.text, '']),
    TEXT.yourNotes,
    earlier.length === 0
      ? TEXT.noNotes
      : earlier
          .slice(-5)
          .map(note => note.text)
          .join('\n'),
    '',
    TEXT.conversationEnd,
    transcript(messages.slice(from)),
  ].join('\n')
}

/**
 * What a mode turned on in a conversation under way asks at once, given how
 * many messages the kept texts cover and the transcript holds. One that keeps
 * a text brings it up to date; one of notes comments from the summary, made
 * first of what it lacks.
 */
export const toAsk = (
  chosen: Mode,
  digests: Partial<Record<Mode, Digest>>,
  length: number,
): { mode: Mode; ask: Ask }[] => {
  const lacks = (rolling: Mode) => (digests[rolling]?.covered ?? 0) !== length

  if (ROLLING.includes(chosen)) {
    return lacks(chosen) ? [{ mode: chosen, ask: 'own' }] : []
  }

  return [
    ...(lacks('resumen') ? [{ mode: 'resumen' as const, ask: 'summary' as const }] : []),
    { mode: chosen, ask: 'own' },
  ]
}
