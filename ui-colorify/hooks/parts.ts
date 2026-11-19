import type { Kind } from '../types'

/** A stretch of a reply: plain markdown, a heading, or one quote's text with its marker and quote marks taken off. */
export type Part = { text: string } | { kind: Kind; body: string } | { heading: number; title: string }

// An ATX heading, `## Title`, its closing hashes aside.
const HEADING = /^ {0,3}(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/

// The marker alone on its line, as GitHub reads it: `> [!NOTE]`.
const MARKER = /^ {0,3}>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/i
const QUOTED = /^ {0,3}>/
const FENCE = /^ {0,3}(```|~~~)/

const unquoted = (line: string) => line.replace(/^ {0,3}> ?/, '')

/**
 * A reply cut at its quotes and headings: an alert by its marker, a quote
 * without one as `QUOTE`. One inside a code fence stays as written.
 */
export const partsOf = (markdown: string): Part[] => {
  const parts: Part[] = []
  let plain: string[] = []
  let quote: { kind: Kind; lines: string[] } | undefined
  let fence: string | undefined

  // A quote and plain text never both wait: each opening flushes the other.
  const flush = () => {
    if (quote !== undefined) {
      parts.push({ kind: quote.kind, body: quote.lines.join('\n').trim() })
      quote = undefined
    }

    if (plain.length > 0) {
      parts.push({ text: plain.join('\n') })
      plain = []
    }
  }

  for (const line of markdown.split('\n')) {
    const marker = fence === undefined ? MARKER.exec(line) : null

    if (marker !== null) {
      flush()
      const [, kind = ''] = marker

      quote = { kind: kind.toUpperCase() as Kind, lines: [] }
      continue
    }

    if (quote !== undefined) {
      if (QUOTED.test(line)) {
        quote.lines.push(unquoted(line))
        continue
      }

      flush()
    }

    const opened = FENCE.exec(line)?.[1]

    if (opened !== undefined) {
      fence = fence === undefined ? opened : fence === opened ? undefined : fence
    }

    if (fence === undefined && QUOTED.test(line)) {
      flush()
      quote = { kind: 'QUOTE', lines: [unquoted(line)] }
      continue
    }

    const heading = fence === undefined ? HEADING.exec(line) : null

    if (heading !== null) {
      flush()
      const [, hashes = '', title = ''] = heading

      parts.push({ heading: hashes.length, title })
      continue
    }

    plain.push(line)
  }

  flush()

  // Blank lines around a quote or a heading are the frame's to space, not a part's.
  return parts.flatMap((part): Part[] =>
    'text' in part ? (part.text.trim() === '' ? [] : [{ text: part.text.trim() }]) : [part],
  )
}

/** A heading's title as a Text draws it: its code and bold marks taken off, since a Text draws no markdown. */
export const headingText = (title: string) => title.replace(/\*\*|__|`/g, '')

/** A part as Claude wrote it, for Claude Code to draw: a heading with its hashes, an alert with its marker and quote marks. */
export const asWritten = (part: Part) =>
  'text' in part
    ? part.text
    : 'heading' in part
      ? `${'#'.repeat(part.heading)} ${part.title}`
      : [
          ...(part.kind === 'QUOTE' ? [] : [`> [!${part.kind}]`]),
          ...part.body.split('\n').map(line => `> ${line}`),
        ].join('\n')
