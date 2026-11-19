const IS_TICKET = /^[A-Z][A-Z0-9]*-\d+$/

/** Whether a session's name is a ticket's key, `ABC-123`. */
export const isTicket = (name: string) => IS_TICKET.test(name)

/** «Comparar facturas de luz» → comparar-facturas-de-luz; nothing for a reply with no words or one that reads as a ticket. */
export const slug = (reply: string) => {
  const line = reply.split('\n').find(one => one.trim() !== '') ?? ''
  const made = line
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 60)
    .replace(/^-+|-+$/g, '')

  return made === '' || isTicket(made.toUpperCase()) ? undefined : made
}
