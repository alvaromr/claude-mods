// How many times a result is read again when the transcript file does not hold
// it yet.
export const RETRIES = 2

/** The command that picks the `wanted` ids' results out of the session's transcript under `root` (scripts/transcript.sh): too large to read here, so jq does. */
export const transcriptCommand = (wanted: readonly string[], root: string, session: string, pluginRoot: string) => [
  'sh',
  `${pluginRoot}/scripts/transcript.sh`,
  JSON.stringify(wanted),
  root,
  session,
]

/** The results jq printed, one by one as they are read; past 4 MiB the output is cut, and with it the last result. */
export function* resultsFrom(stdout: string, isTruncated: boolean) {
  const lines = stdout.split('\n').filter(Boolean)

  for (const line of isTruncated ? lines.slice(0, -1) : lines) {
    yield JSON.parse(line) as { id: string; output: unknown }
  }
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
