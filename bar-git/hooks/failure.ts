/** What a call that failed says: an Error's message, else the thing thrown as text. */
export const reasonOf = (failure: unknown) => (failure instanceof Error ? failure.message : String(failure))
