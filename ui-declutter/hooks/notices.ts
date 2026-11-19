import { TEXT } from './text'

/** A failure's message, for the debug log or the person. */
export const messageOf = (failure: unknown) => (failure instanceof Error ? failure.message : String(failure))

/** What the person is told of the check for jq that ran: nothing if jq is there. */
export const jqNotice = (exitCode: number) => (exitCode === 0 ? undefined : TEXT.needsJq)

/** What the person is told of the check for jq that could not run. */
export const jqUnchecked = (failure: unknown) => TEXT.cannotCheckJq(messageOf(failure))
