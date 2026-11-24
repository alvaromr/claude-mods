// An empty private PNG chunk, `reSd`, that decoders skip.
const RESEND_CHUNK = '\x00\x00\x00\x00reSd\x75\x27\x15\x16'

// A terminal that rebuilds its screen, as Orca on a tab or app switch
// (stablyai/orca#30383), drops every picture and tells nobody. The window
// getting the focus back is the sign the person is back: every picture drawn is
// sent again then, one every STAGGER_MS, so no burst holds up the terminal.
// A terminal that reports no focus reads as focused all along, and its sign is
// the first key typed after a pause.
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

/** What is known of the window's focus: `isReported` once it was seen lost, which a terminal that reports no focus never shows. */
export type Focus = { isReported: boolean; isFocused: boolean }

export const UNKNOWN_FOCUS: Focus = { isReported: false, isFocused: true }

/** The focus after the window says `isFocused`, and whether that is the person back: the focus regained after it was lost. */
export const focusAfter = (focus: Focus, isFocused: boolean) => ({
  focus: { isReported: focus.isReported || !isFocused, isFocused },
  isBack: !focus.isFocused && isFocused,
})

/** The focus a surface module posted, none for anything else. */
export const focusPosted = (data: unknown) =>
  typeof data === 'object' && data !== null && 'isFocused' in data && typeof data.isFocused === 'boolean'
    ? data.isFocused
    : undefined

/** How long the `n`th picture waits to be sent again. */
export const staggerOf = (n: number) => n * STAGGER_MS
