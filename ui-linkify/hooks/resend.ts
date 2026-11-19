// An empty private PNG chunk, `reSd`, that decoders skip.
const RESEND_CHUNK = '\x00\x00\x00\x00reSd\x75\x27\x15\x16'

// A terminal that rebuilds its screen, as Orca on a tab or app switch
// (stablyai/orca#30383), drops every picture and tells nobody. The first key
// typed after a pause is the sign the person is back: every picture drawn is
// sent again then, one every STAGGER_MS, so no burst holds up the terminal.
const PAUSE_MS = 5000
const STAGGER_MS = 50

/** The same picture in other bytes, the chunk before IEND, the last 12: the engine sends nothing for a source equal to the one it drew last. */
export const marked = (png: string) => {
  const bytes = atob(png)

  return btoa(bytes.slice(0, -12) + RESEND_CHUNK + bytes.slice(-12))
}

/** Whether a key typed at `now` comes after a pause since the one typed at `typedAt`, none yet being no pause. */
export const isAfterPause = (typedAt: number | undefined, now: number) =>
  typedAt !== undefined && now - typedAt >= PAUSE_MS

/** How long the `n`th picture waits to be sent again. */
export const staggerOf = (n: number) => n * STAGGER_MS
