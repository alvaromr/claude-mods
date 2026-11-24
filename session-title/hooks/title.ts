const IS_TICKET = /^[A-Z][A-Z0-9]*-\d+$/
const LONGEST = 60
// What is not a letter, its accent, a digit, a space or the punctuation of a
// phrase: quotes, marks, and the control, bidi and zero-width characters that
// would reach the terminal with the session's name.
const STRAY = /[^\p{L}\p{M}\p{N} ,.:¿?¡!()/+&-]/gu
// What a title neither starts nor ends with.
const ENDS = /^[ ,.:-]+|[ ,.:-]+$/g

/** Whether a session's name is a ticket's key, `ABC-123`. */
export const isTicket = (name: string) => IS_TICKET.test(name)

/** Whether a word is an id: a hash, a uuid, a long number; a date, a version, a ticket's key or `facade` is a word. */
const isId = (word: string) =>
  /^[\da-f-]{6,}$/i.test(word) &&
  (/\d{6}/.test(word) || (/\d/.test(word) && /[a-f]/i.test(word))) &&
  !isTicket(word.toUpperCase())

/** The text at most LONGEST characters long, cut after its last whole word; a word longer than that, where it reaches it. */
const fitted = (text: string) => {
  const head = text.slice(0, LONGEST + 1)
  const space = head.lastIndexOf(' ')

  return text.length <= LONGEST ? text : head.slice(0, space > 0 ? space : LONGEST)
}

/** «"comparar facturas de luz."» → Comparar facturas de luz; nothing for a reply with no words or one that reads as a ticket. */
export const titleOf = (reply: string) => {
  const line = reply.split('\n').find(one => one.trim() !== '') ?? ''
  const words = line
    .replace(STRAY, ' ')
    .split(' ')
    .filter(word => word !== '' && !isId(word))
    .join(' ')
  const made = fitted(words)
    .replace(ENDS, '')
    .replace(/\p{L}/u, letter => letter.toUpperCase())

  return made === '' || isTicket(made.toUpperCase()) ? undefined : made
}
