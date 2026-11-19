import type { Preferences, Span, Ticket } from '../types'
import { SITE } from './preferences'

const KEY = /^[A-Z][A-Z0-9_]*$/

// The options as the person wrote them, held to what an address and a project's
// key look like: both end up inside a pattern and inside a link.
const siteOf = (written: unknown) => {
  const site = typeof written === 'string' ? written.trim().replace(/\/+$/, '') : ''

  return SITE.test(site) ? site : ''
}
const keysOf = (written: unknown) =>
  (typeof written === 'string' ? written.split(',') : [])
    .map(key => key.trim().toUpperCase())
    .filter(key => KEY.test(key))

const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')

// One Jira as the mod reads it: the site its tickets live at and the patterns
// that find the tickets of its projects.
const jiraOf = (site: string, keys: readonly string[]) => {
  const ticket = `(?:${keys.join('|')})-\\d+`
  // What must stay as written comes first (a code fence, a code span, a markdown
  // link, a bare URL), so a ticket inside one is passed over.
  const urlOrTicket = 'https?:\\/\\/\\S+|\\b(' + ticket + ')\\b'

  return {
    site,
    urlOrTicket,
    keptOrTicket: new RegExp('```[\\s\\S]*?```|`[^`\\n]*`|\\[[^\\]\\n]*\\]\\([^)\\n]*\\)|' + urlOrTicket, 'g'),
    codeTicket: new RegExp('^`(' + ticket + ')`$'),
    // The ticket a branch or a worktree folder is named after: abc-22133-login → ABC-22133.
    namedAfter: new RegExp(`(?:^|[^a-z0-9])(${keys.join('|')})-(\\d+)(?!\\d)`, 'i'),
    // A prompt that is one ticket, or its address, and nothing else. A ticket named
    // within a sentence is not taken: it may be a related one.
    alone: new RegExp(`^\\s*(?:${escaped(site)}\\/browse\\/)?(${ticket})[\\s.]*$`),
    startsWithTicket: new RegExp(`^(${ticket})\\b`),
    // A word being typed that may become a ticket: `ABC`, `ABC-`, `ABC-12`.
    typing: new RegExp(`^(?:${keys.join('|')})(?:-\\d*)?$`),
    isTicket: new RegExp(`^${ticket}$`),
  }
}

/** One Jira as the mod reads it: its site and the patterns that find the tickets of its projects. */
export type Jira = ReturnType<typeof jiraOf>

// The Jira the settings name, made again only when the site or the keys change;
// none while it is off or until the person says where theirs live.
let made: { site: string; keys: string; jira: Jira | undefined } | undefined

/** The Jira the settings name; none while it is off or until the person says where theirs live. */
export const jiraIn = (s: Preferences) => {
  if (made?.site !== s.site || made.keys !== s.keys) {
    const site = siteOf(s.site)
    const keys = keysOf(s.keys)

    made = { site: s.site, keys: s.keys, jira: site === '' || keys.length === 0 ? undefined : jiraOf(site, keys) }
  }

  return s.jira ? made.jira : undefined
}

/** The page of a ticket. */
export const browse = (jira: Jira, id: string) => `${jira.site}/browse/${id}`
const link = (jira: Jira, label: string, id: string) => `[${label}](${browse(jira, id)})`

/** The markdown with each ticket it names as a link to its page, any in a code, a link or a URL left as written. */
export const linkTickets = (jira: Jira, markdown: string) =>
  markdown.replace(jira.keptOrTicket, (found: string, id?: string) => {
    if (id !== undefined) {
      return link(jira, id, id)
    }

    // A code span that is one ticket and nothing else keeps its look inside the link.
    const coded = jira.codeTicket.exec(found)?.[1]

    return coded === undefined ? found : link(jira, found, coded)
  })

/** The tickets a prompt names, as the links of its row. */
export const ticketSpans = (jira: Jira, text: string): Span[] =>
  [...text.matchAll(new RegExp(jira.urlOrTicket, 'g'))].flatMap(({ 1: id, index }) =>
    id === undefined ? [] : [{ start: index, end: index + id.length, href: browse(jira, id) }],
  )

const ticketOf = (jira: Jira, name: string) => {
  const [, key, number] = jira.namedAfter.exec(name) ?? []

  return key === undefined ? undefined : `${key.toUpperCase()}-${number}`
}

/** The ticket being worked on: the one the branch is named after, or the folder, and outside such a branch the one `said`. */
export const workedOn = (jira: Jira, branch: string, cwd: string, said: Ticket | null) =>
  ticketOf(jira, branch) ?? ticketOf(jira, cwd.split('/').pop() ?? '') ?? said ?? undefined

const COMMIT = /\bgit\b[^;&|]*\bcommit\b/
// How old the last commit may be and still be the one the call just made.
const JUST_MADE_MS = 120_000

/** Whether a command makes a commit. */
export const isCommit = (command: string) => COMMIT.test(command)

/** The ticket the subject of the commit just made starts with, `ABC-123: …`, out of `git log -1 --format='%ct %s'` at `now`. */
export const committedTicket = (jira: Jira, stdout: string, now: number) => {
  const [, at, subject = ''] = /^(\d+) (.*)$/m.exec(stdout) ?? []
  const isJustMade = Number(at) * 1000 > now - JUST_MADE_MS

  return isJustMade ? jira.startsWithTicket.exec(subject)?.[1] : undefined
}

/** The tickets the person may be about to name: the one worked on, then those the subjects of `git log` start with. */
export const nearbyTickets = (jira: Jira, stdout: string, wanted: Ticket | undefined) => {
  const committedTo = stdout.split('\n').flatMap(subject => jira.startsWithTicket.exec(subject)?.[1] ?? [])

  return [...new Set([wanted ?? [], committedTo].flat())]
}

/** Whether a session's metadata file says the person named it (/rename); none for the file of another session. */
export const isNamedInMeta = (text: string, sessionId: string) => {
  // Another live session may be halfway through writing its own.
  const meta = (() => {
    try {
      return JSON.parse(text) as { sessionId?: unknown; nameSource?: unknown } | null
    } catch {
      return null
    }
  })()

  return meta?.sessionId === sessionId ? meta.nameSource === 'user' : undefined
}

/**
 * Whether the title is a ticket's already: a settings hook's, now (`asked`) or
 * from an earlier prompt (`current`, unless this mod gave it, `given`).
 */
export const isTitledAfterTicket = (jira: Jira, asked: string | undefined, current: string, given: Ticket | null) =>
  jira.isTicket.test(asked ?? '') || (jira.isTicket.test(current) && current !== given)

/** Whether there is nothing to change in the title: no ticket worked on, or the title already is it, none being asked. */
export const isTitleSettled = (asked: string | undefined, current: string, wanted: Ticket | undefined) =>
  wanted === undefined || (asked === undefined && current === wanted)

/** Whether a session started from nothing: a new conversation, or another one resumed. */
export const isNewConversation = (source: string) => source === 'startup' || source === 'clear' || source === 'resume'

/** The ticket a prompt is, and nothing else, when the person typed it. */
export const aloneTicket = (jira: Jira, source: string | undefined, prompt: string) =>
  (source ?? 'user') === 'user' ? jira.alone.exec(prompt)?.[1] : undefined

/** The key being typed, in capitals, when it may become a ticket. */
export const typedKey = (jira: Jira | undefined, token: string) => {
  const typed = token.toUpperCase()

  return jira?.typing.test(typed) === true ? typed : undefined
}

/** The tickets `ids` that complete what is typed, as suggestions. */
export const completions = (ids: readonly string[], typed: string) =>
  ids.filter(id => id.startsWith(typed) && id !== typed).map(id => ({ text: id }))
