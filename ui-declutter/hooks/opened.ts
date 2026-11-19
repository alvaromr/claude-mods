import type { Opened } from '../types'

/** What presses opened, with `key` pressed: closed if it was open, else open. */
export const toggled = (open: Opened, key: string) =>
  open.includes(key) ? open.filter(opened => opened !== key) : [...open, key]

/** A call's row pressed: opened, or closed with its whole result too if that was asked. */
export const rowToggled = (open: Opened, id: string) =>
  open.includes(`row:${id}`) ? open.filter(key => key !== `row:${id}` && key !== `full:${id}`) : [...open, `row:${id}`]

/** A call's whole result asked for. */
export const withFull = (open: Opened, id: string) => [...open, `full:${id}`]

/** The presses that turned a span from how spans start, forgotten. */
export const withoutSpans = (open: Opened) => open.filter(key => !key.startsWith('span:'))

/** Whether a span is unfolded: a press turns it from how spans start. */
export const isSpanOpen = (startsOpen: boolean, open: Opened, first: string) =>
  startsOpen !== open.includes(`span:${first}`)
