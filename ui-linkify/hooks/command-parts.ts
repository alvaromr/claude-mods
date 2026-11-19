// A command proposed for bash mode: a line `! command`, as the person would
// type it, on its own or as the one line of a code fence, which may be
// indented under a list item as the fence is. The space after `!` is bash
// mode's own form, and keeps out prose such as `!Nota:` and an image's `![`.
// A line may end in `\r`. Its group is not optional: a match always holds the command.
const COMMAND = /^!\s+(\S.*)\r?$/
// One in the middle of a sentence, as a code span, which says where it ends:
// `! pwd`. The space after `!` keeps out code such as `!important`.
const INLINE = /`!\s+([^`]+)`/g
const FENCE = /^\s*```/

// What a command prints that a drawing refuses: escape sequences (colors, links,
// cursor moves) and every other control character but the newline and the tab.
// Claude gets the output as printed; only the drawing goes without them.
// eslint-disable-next-line no-control-regex -- control characters are what it matches.
export const CONTROL = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)?|\x1b\[[0-?]*[ -/]*[@-~]|\x1b[@-_]?|[\x00-\x08\x0b-\x1f\x7f]/g
// What no text shows but changes what it says or where it reads: C1 controls,
// zero-width and soft-hyphen characters, bidirectional marks and isolates.
const UNSEEN =
  /[\u{80}-\u{9f}\u{ad}\u{61c}\u{180e}\u{200b}-\u{200f}\u{202a}-\u{202e}\u{2060}-\u{2064}\u{2066}-\u{206f}\u{feff}]/gu

// A command as it is drawn and run, the same for both so the person runs what
// they read: without the characters above.
const plain = (command: string) => command.replace(CONTROL, '').replace(UNSEEN, '').trim()

// The command a line proposes, empty when it proposes none.
const commandOf = (line: string) => plain(COMMAND.exec(line)?.[1] ?? '')

/** A command's place: its line, and for one in a sentence its order there. */
export type Part = { text: string } | { command: string; at: string }

/**
 * The message cut at each proposed command; a fence holding anything else is
 * left whole, its lines as written. A sentence keeps the commands it holds,
 * and each is drawn again right under its line, as close to where it is named
 * as a box can stand. Not under its paragraph: a list is one, and the boxes
 * of all its items, laid under the last, read as that item's.
 */
export const partsOf = (text: string): Part[] => {
  const lines = text.split('\n')
  const parts: Part[] = []
  let prose: string[] = []
  let held: Part[] = []
  let isFenced = false
  const flush = () => {
    if (prose.length > 0) {
      parts.push({ text: prose.join('\n') })
      prose = []
    }

    parts.push(...held)
    held = []
  }

  for (let line = 0; line < lines.length; line++) {
    const [now = '', after = '', closing = ''] = lines.slice(line, line + 3)
    const fenced = commandOf(after.trimStart())

    if (!isFenced && FENCE.test(now) && fenced !== '' && closing.trim() === '```') {
      flush()
      parts.push({ command: fenced, at: `${line}` })
      line += 2
      continue
    }

    if (FENCE.test(now)) {
      isFenced = !isFenced
    }

    const found = isFenced ? '' : commandOf(now)

    if (found !== '') {
      flush()
      parts.push({ command: found, at: `${line}` })
    } else {
      prose.push(now)

      if (!isFenced) {
        held.push(
          ...[...now.matchAll(INLINE)]
            .map(([, command], k) => {
              if (command === undefined) {
                throw new Error('INLINE matched without its command')
              }

              return { command: plain(command), at: `${line}.${k}` }
            })
            .filter(({ command }) => command !== ''),
        )
      }

      if (held.length > 0) {
        flush()
      }
    }
  }

  flush()

  // A command right after the same one is drawn once: a sentence that names
  // it twice, or a line that repeats the one cited above it.
  return parts.filter((part, n) => {
    const before = parts[n - 1]

    return !('command' in part && before !== undefined && 'command' in before && before.command === part.command)
  })
}
