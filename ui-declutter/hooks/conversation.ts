import type { ToolGroupCall } from 'claude-code'

import { clip } from './cells'
import { isEnding, kindOf, noticeCall, toolOf } from './calls'
import { TEXT } from './text'

// An edit, or a file a command changed; one that failed, with why.
export type Edit = { id: string; path: string; failure?: string }
export type Item = { kind: 'calls'; call: ToolGroupCall } | { kind: 'edits'; edit: Edit }
// A span: the folded calls and the edits made with nothing else between them,
// in order, keyed by its first.
export type Span = { first: string; items: readonly Item[] }

/**
 * One pass over the conversation, read again after it gains a row: each span
 * by the id of every call and edit in it, ended by text, a prompt or another
 * tool's row; each call's result as text, and what it took in when that was an
 * image or a PDF; the ids of the agents that stand in for WebFetch.
 */
// `isRead`: the conversation was read, so a row it does not hold is not in it.
export type Scanned = {
  isRead: boolean
  spans: Map<string, Span>
  outputs: Map<string, string>
  pictures: Map<string, string>
  webFetches: readonly string[]
}
type Message = { role: 'user' | 'assistant'; content: string | readonly { type: string; [field: string]: unknown }[] }

// Why an edit failed, in a word or two.
const REASONS: readonly (readonly [RegExp, string])[] = [
  [/doesn't want to proceed|was rejected/, TEXT.reasons.rejected],
  [/denied|no verdict/, TEXT.reasons.denied],
  [/has not been read yet/, TEXT.reasons.notRead],
  [/not found in file/, TEXT.reasons.notFound],
  [/modified since read/, TEXT.reasons.changedSinceRead],
  [/does not exist/, TEXT.reasons.missing],
  [/No changes to make/, TEXT.reasons.noChanges],
  [/Found \d+ matches/, TEXT.reasons.severalMatches],
]

/** Why an edit failed, from the text of its error, in a word or two. */
export const reasonOf = (text: string) =>
  REASONS.find(([pattern]) => pattern.test(text))?.[1] ??
  (clip(
    text
      .replace(/<\/?tool_use_error>/g, '')
      .replace(/\s+/g, ' ')
      .trim(),
    40,
  ) ||
    TEXT.reasons.unknown)

/** The id of an item: its call's, or its edit's. */
export const idOf = (item: Item) => (item.kind === 'calls' ? (item.call.tool_use_id ?? '') : item.edit.id)

/** The scan of a conversation that could not be read: it holds nothing, and says it was not read. */
export const unread = (): Scanned => ({
  isRead: false,
  spans: new Map(),
  outputs: new Map(),
  pictures: new Map(),
  webFetches: [],
})

/**
 * Whether a finished row is gone from the conversation: it left it in a
 * compaction (or past its newest 4096 messages). A row not finished may not be
 * in it yet, and one that could not be read left nothing gone.
 */
export const isGoneFrom = ({ isRead, spans }: Scanned, id: string, isRunning: boolean) =>
  isRead && !isRunning && !spans.has(id)

/** What a new message brings: the ids of the results it holds, and whether it may start a span, join one or bring a result (a task's end notice too). */
export const arrivalOf = (content: string | readonly { type: string; tool_use_id?: unknown }[], originKind: string) => {
  const blocks = typeof content === 'string' ? [] : content

  return {
    resultIds: blocks.filter(block => block.type === 'tool_result').map(block => String(block.tool_use_id)),
    isCall:
      originKind === 'task-notification' ||
      blocks.some(block => block.type === 'tool_use' || block.type === 'tool_result'),
  }
}

// What the engine puts in the model's messages for itself, a prompt never holds.
const REMINDER = /<system-reminder>([\s\S]*?)<\/system-reminder>/g
const NOTIFICATION = /<task-notification>([\s\S]*?)<\/task-notification>/g
// What the engine writes after the failed results of the calls the person's
// Esc cut, in a text of its own.
const INTERRUPTION = /^\[Request interrupted by user/

const fieldOf = (body: string, tag: string) =>
  body.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1]?.trim() ?? ''

// The notices of a task's end in a text: only inside the engine's reminders,
// for a prompt that quotes one is no notice.
const noticesIn = (text: string) =>
  [...text.matchAll(REMINDER)].flatMap(([, reminder = '']) =>
    [...reminder.matchAll(NOTIFICATION)].map(([, body = '']) => ({
      task: fieldOf(body, 'task-id'),
      status: fieldOf(body, 'status'),
      summary: fieldOf(body, 'summary'),
    })),
  )

/** The conversation read into its spans and each call's result. */
export const scan = (messages: readonly Message[]): Scanned => {
  const blocksOf = (content: Message['content']) =>
    typeof content === 'string' ? [{ type: 'text', text: content }] : content
  const answers = new Map<string, boolean>()
  const stopped = new Set<string>()
  const outputs = new Map<string, string>()
  const pictures = new Map<string, string>()
  const fetches = new Set<string>()
  // How many notices each task gave.
  const notified = new Map<string, number>()

  // The failed results since the model last spoke, which an interruption cut.
  let failed: string[] = []

  for (const { role, content } of messages) {
    if (role === 'assistant') {
      failed = []
    }

    for (const block of role === 'user' ? blocksOf(content) : []) {
      if (block.type === 'text') {
        for (const { task } of noticesIn(String(block.text))) {
          notified.set(task, (notified.get(task) ?? 0) + 1)
        }

        if (INTERRUPTION.test(String(block.text).trim())) {
          failed.forEach(id => stopped.add(id))
        }
      }

      if (block.type === 'tool_result') {
        const result: unknown = block.content
        const parts = Array.isArray(result)
          ? (result as ({ type?: unknown; text?: unknown; tool_name?: unknown } | null | undefined)[])
          : []
        // The text, and the tools a search loaded, by name.
        const text =
          typeof result === 'string'
            ? result
            : parts
                .flatMap(part =>
                  part?.type === 'text'
                    ? [String(part.text)]
                    : part?.type === 'tool_reference'
                      ? [String(part.tool_name)]
                      : [],
                )
                .join('\n')
        const picture = parts.some(part => part?.type === 'image')
          ? 'image'
          : parts.some(part => part?.type === 'document')
            ? 'PDF'
            : undefined
        const id = String(block.tool_use_id)

        answers.set(id, block.is_error === true)
        outputs.set(id, text)

        if (block.is_error === true) {
          failed.push(id)
        }

        if (picture !== undefined) {
          pictures.set(id, picture)
        }
      }
    }
  }

  const spans = new Map<string, Span>()
  let items: Item[] = []
  const close = () => {
    const first = items[0]

    if (first !== undefined) {
      const span = { first: idOf(first), items }

      for (const item of items) {
        spans.set(idOf(item), span)
      }
    }

    items = []
  }

  for (const { role, content } of messages) {
    const blocks = blocksOf(content)

    // A prompt ends a span, one beside the results too; the results the calls
    // get back, and what the engine puts beside them, do not; a notice that a
    // task ended is a call.
    if (role === 'user') {
      let hasNotice = false

      for (const block of blocks) {
        if (block.type !== 'text') {
          continue
        }

        const text = String(block.text)
        const found = noticesIn(text)

        hasNotice ||= found.length > 0

        for (const { task, status, summary } of found) {
          if (task !== '' && isEnding(status) && notified.get(task) === 1) {
            const call = noticeCall(task, status, summary)

            outputs.set(call.tool_use_id ?? '', status)
            items.push({ kind: 'calls', call })
          }
        }

        if (text.replace(REMINDER, '').trim() !== '') {
          close()
        }
      }

      if (!hasNotice && !blocks.some(block => block.type === 'tool_result')) {
        close()
      }

      continue
    }

    for (const block of blocks) {
      const id = String(block.id)
      const name = block.type === 'tool_use' ? toolOf(fetches, id, String(block.name), block.input) : ''

      if (kindOf(name) === 'edits') {
        items.push({
          kind: 'edits',
          edit: {
            id,
            path: String((block.input as { file_path?: unknown }).file_path),
            ...(answers.get(id) === true ? { failure: reasonOf(outputs.get(id) ?? '') } : {}),
          },
        })
      } else if (kindOf(name) === 'calls') {
        items.push({
          kind: 'calls',
          call: {
            tool_use_id: id,
            tool: name,
            input: block.input,
            isRunning: !answers.has(id),
            isErrored: answers.get(id) === true,
            isInterrupted: stopped.has(id),
          },
        })
      } else if (block.type === 'tool_use' || (block.type === 'text' && String(block.text).trim() !== '')) {
        close()
      }
    }
  }

  close()

  return { isRead: true, spans, outputs, pictures, webFetches: [...fetches] }
}
