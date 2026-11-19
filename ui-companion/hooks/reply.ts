import type { ModelCompleteResult } from 'claude-code'

import { NOTHING } from './modes'

/** Whether a reply, trimmed, says the mode has nothing to write. */
export const isSilent = (reply: string) => reply === '' || reply === NOTHING

/** What a failure says: its message when it is an error, else itself as text. */
export const messageOf = (failure: unknown) => (failure instanceof Error ? failure.message : String(failure))

/** Why the model gave no reply: its reason, and for the API's error, which one and its status. */
export const whyUnanswered = (reply: Extract<ModelCompleteResult, { isAnswered: false }>) =>
  `${reply.reason}${reply.reason === 'api-error' ? ` ${reply.error} ${reply.status ?? ''}` : ''}`
