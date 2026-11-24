/** A failure's message, for the debug log or the person. */
export const messageOf = (failure: unknown) => (failure instanceof Error ? failure.message : String(failure))
