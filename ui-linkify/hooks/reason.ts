/** What a failure says, as one line of text: an error's message, anything else as it prints. */
export const reasonOf = (failure: unknown) => (failure instanceof Error ? failure.message : String(failure))
