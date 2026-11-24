// How many times a result is read again when the transcript file does not hold
// it yet.
export const RETRIES = 2

/** The most bytes `$.fs.read` answers at once (4 MiB), and so the largest piece of the transcript read at a time. */
export const CHUNK = 4 * 1024 * 1024

const NEWLINE = 10

/** Reads the transcript file's bytes from `offset`, at most `length`. */
export type ReadBytes = (offset: number, length: number) => Promise<Uint8Array>

type Row = { type?: unknown; toolUseResult?: unknown; message?: { content?: unknown } }
type Block = { type?: unknown; tool_use_id?: unknown }

/** The wanted ids' results one row of the transcript holds: those of a user's row whose result is an object. */
export const resultsOfRow = (line: string, wanted: ReadonlySet<string>) => {
  // Most rows hold none of the ids: not worth parsing.
  if (!line.includes('"toolUseResult"') || ![...wanted].some(id => line.includes(id))) {
    return []
  }

  const { type, toolUseResult, message } = JSON.parse(line) as Row

  if (type !== 'user' || typeof toolUseResult !== 'object' || toolUseResult === null || Array.isArray(toolUseResult)) {
    return []
  }

  const content = Array.isArray(message?.content) ? (message.content as Block[]) : []

  return content.flatMap(({ type: kind, tool_use_id: id }) =>
    kind === 'tool_result' && typeof id === 'string' && wanted.has(id) ? [{ id, output: toolUseResult }] : [],
  )
}

const joined = (head: Uint8Array, tail: Uint8Array) => {
  const bytes = new Uint8Array(head.length + tail.length)

  bytes.set(head)
  bytes.set(tail, head.length)

  return bytes
}

/**
 * The wanted ids' results, read from the transcript's end backwards, a chunk at
 * a time, until all are found or the file's start is reached: the calls asked
 * about are mostly the latest. A row a chunk's edge cuts is joined with its
 * other part, however many chunks it spans; where an id has more rows, the
 * latest wins. The file's last line is left out where it does not end in a
 * newline: a row not written whole yet.
 */
export const resultsIn = async (read: ReadBytes, size: number, wanted: ReadonlySet<string>, chunk = CHUNK) => {
  const found = new Map<string, unknown>()
  const decoder = new TextDecoder()
  // The beginning of the row that the chunk read last cut at its start: the end of that row is in it.
  let tail = new Uint8Array(0)
  // Until a newline is met, what is read is part of the file's unfinished last row.
  let isUnfinished = true
  let end = size

  while (end > 0 && found.size < wanted.size) {
    const start = Math.max(0, end - chunk)
    let bytes = joined(await read(start, end - start), tail)

    if (isUnfinished) {
      bytes = bytes.subarray(0, bytes.lastIndexOf(NEWLINE) + 1)
      isUnfinished = bytes.length === 0
    }

    const newline = bytes.indexOf(NEWLINE)

    end = start

    // A chunk with no newline is all one row's middle, cut at both edges, but at the file's start.
    if (start > 0 && newline === -1) {
      tail = bytes
      continue
    }

    tail = start === 0 ? new Uint8Array(0) : bytes.subarray(0, newline)

    const rows = decoder.decode(bytes.subarray(start === 0 ? 0 : newline + 1)).split('\n')

    for (const row of rows.reverse()) {
      for (const { id, output } of resultsOfRow(row, wanted)) {
        if (!found.has(id)) {
          found.set(id, output)
        }
      }
    }
  }

  return found
}

/** Whether a result is worth keeping: one of a call, which is an object. */
export const isKept = (id: string | undefined, output: unknown): id is string =>
  id !== undefined && typeof output === 'object' && output !== null

/** The ids not known yet. */
export const unknownOf = (ids: Iterable<string>, results: ReadonlyMap<string, unknown>) =>
  [...ids].filter(id => !results.has(id))

/** Of the ids found nowhere, those not read in vain more than `RETRIES` times. */
export const retriable = (lost: readonly string[], misses: ReadonlyMap<string, number>) =>
  lost.filter(id => (misses.get(id) ?? 0) < RETRIES)

/** The ids whose result is none, found nowhere. */
export const lostIn = (ids: readonly string[], results: ReadonlyMap<string, unknown>) =>
  ids.filter(id => results.get(id) === null)

/** Each id's result, none for one unknown or found nowhere. */
export const foundFor = <T>(ids: readonly string[], results: ReadonlyMap<string, T | null>) =>
  ids.map(id => results.get(id) ?? null)
