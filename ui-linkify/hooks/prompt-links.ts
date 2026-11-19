import type { Span } from '../types'

/** A prompt's text cut at its links, in order: each with the text before it, and the text after the last; none where it has none. */
export const cutAtLinks = (text: string, links: readonly Span[]) => {
  const sorted = [...links].sort((a, b) => a.start - b.start)
  const last = sorted.at(-1)

  if (last === undefined) {
    return undefined
  }

  return {
    parts: sorted.map(({ start, end, href }, n) => ({
      before: text.slice(sorted[n - 1]?.end ?? 0, start),
      label: text.slice(start, end),
      href,
    })),
    after: text.slice(last.end),
  }
}
