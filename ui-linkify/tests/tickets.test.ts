import { expect, test } from 'claude-code/testing'

import { DEFAULTS } from '../hooks/preferences'
import {
  aloneTicket,
  browse,
  committedTicket,
  completions,
  isCommit,
  isNamedInMeta,
  isNewConversation,
  isTitledAfterTicket,
  isTitleSettled,
  jiraIn,
  linkTickets,
  nearbyTickets,
  ticketSpans,
  typedKey,
  workedOn,
} from '../hooks/tickets'

const SITE = 'https://example.atlassian.net'

const settings = (site: string, keys: string, jira = true) => ({ ...DEFAULTS, site, keys, jira })

// The Jira of the example site, its projects ABC and OPS.
const jira = () => {
  const made = jiraIn(settings(SITE, 'ABC, ops'))

  if (made === undefined) {
    throw new Error('the example Jira is not made')
  }

  return made
}

test('there is no Jira until the site and the keys are both told, or while it is off', () => {
  expect(jiraIn(settings('', 'ABC'))).toBeUndefined()
  expect(jiraIn(settings(SITE, ''))).toBeUndefined()
  expect(jiraIn(settings(SITE, 'ABC', false))).toBeUndefined()
  expect(jiraIn(settings(SITE, 'ABC'))).toBeDefined()
})

test('the site is trimmed of its trailing slashes and held to what an address looks like', () => {
  expect(jiraIn(settings(' https://a.atlassian.net/// ', 'ABC'))?.site).toBe('https://a.atlassian.net')
  expect(jiraIn(settings('a.atlassian.net', 'ABC'))).toBeUndefined()
  expect(jiraIn(settings('https://a(b).net', 'ABC'))).toBeUndefined()
  expect(jiraIn(settings('http://jira.local', 'ABC'))?.site).toBe('http://jira.local')
  expect(jiraIn(settings('https://a b.net', 'ABC'))).toBeUndefined()
})

test('the keys are trimmed and put in capitals, and one that is no key is dropped', () => {
  const made = jiraIn(settings(SITE, ' abc , 1x, a-b ,Op_s'))

  expect(made?.isTicket.test('ABC-1')).toBe(true)
  expect(made?.isTicket.test('OP_S-2')).toBe(true)
  expect(made?.isTicket.test('1X-1')).toBe(false)
  expect(made?.isTicket.test('abc-1')).toBe(false)
  expect(jiraIn(settings(SITE, '1x, a-b'))).toBeUndefined()
})

test('the Jira is made again when the site or the keys change, and not before', () => {
  const first = jiraIn(settings(SITE, 'ABC'))

  expect(jiraIn(settings(SITE, 'ABC'))).toBe(first)
  expect(jiraIn(settings('https://other.atlassian.net', 'ABC'))).not.toBe(first)
  expect(jiraIn(settings('https://other.atlassian.net', 'ABC'))?.site).toBe('https://other.atlassian.net')

  const withKeys = jiraIn(settings('https://other.atlassian.net', 'ABC'))

  expect(jiraIn(settings('https://other.atlassian.net', 'ABC,OPS'))).not.toBe(withKeys)
  expect(jiraIn(settings('https://other.atlassian.net', 'ABC,OPS'))?.isTicket.test('OPS-1')).toBe(true)
})

test('a ticket has its page under the site', () => {
  expect(browse(jira(), 'ABC-12')).toBe(`${SITE}/browse/ABC-12`)
})

test('the tickets of a text are links to their pages', () => {
  const link = (id: string) => `[${id}](${SITE}/browse/${id})`

  expect(linkTickets(jira(), 'Mira ABC-12, OPS-3 y abc-4 o ABC-5x o XYZ-9 o ABC-')).toBe(
    `Mira ${link('ABC-12')}, ${link('OPS-3')} y abc-4 o ABC-5x o XYZ-9 o ABC-`,
  )
  expect(linkTickets(jira(), 'ABC-1\nABC-2')).toBe(`${link('ABC-1')}\n${link('ABC-2')}`)
})

test('a ticket inside a code fence, a code span, a markdown link or an address stays as written', () => {
  for (const kept of [
    '```\nABC-1\n```',
    'usa `git commit ABC-1` ya',
    '[ABC-1](https://x.com) y [más ABC-2](https://y.com)',
    'en https://x.com/ABC-1 ya',
    'en http://x.com/ABC-1 ya',
  ]) {
    expect(linkTickets(jira(), kept), kept).toBe(kept)
  }
})

test('a code span that is one ticket and nothing else keeps its look inside the link', () => {
  expect(linkTickets(jira(), 'ver `ABC-7` y `ABC-7 más`')).toBe(`ver [\`ABC-7\`](${SITE}/browse/ABC-7) y \`ABC-7 más\``)
})

test('the tickets a prompt names are spans of its text, each with its page, none inside an address', () => {
  const text = 'ABC-1, https://x.com/ABC-2 y OPS-3'

  expect(ticketSpans(jira(), text)).toEqual([
    { start: 0, end: 5, href: `${SITE}/browse/ABC-1` },
    { start: 29, end: 34, href: `${SITE}/browse/OPS-3` },
  ])
  expect(ticketSpans(jira(), 'ninguno')).toEqual([])
})

test('the ticket being worked on is the one the branch is named after, in capitals', () => {
  expect(workedOn(jira(), 'abc-22133-login\n', '/repo', null)).toBe('ABC-22133')
  expect(workedOn(jira(), 'feature/ops-7_x\n', '/repo', null)).toBe('OPS-7')
})

test('a branch with no ticket gives the folder’s, and then the one last said', () => {
  expect(workedOn(jira(), 'main\n', '/work/abc-5-fix', 'OPS-1')).toBe('ABC-5')
  expect(workedOn(jira(), '', '/work/repo', 'OPS-1')).toBe('OPS-1')
  expect(workedOn(jira(), '', '/work/repo', null)).toBeUndefined()
})

test('the branch comes before the folder', () => {
  expect(workedOn(jira(), 'ops-2\n', '/work/abc-5', 'ABC-9')).toBe('OPS-2')
})

test('a ticket is named after a key, apart from letters and digits, and without more digits after', () => {
  expect(workedOn(jira(), 'xabc-1', '/', null)).toBeUndefined()
  expect(workedOn(jira(), 'abc-1', '/', null)).toBe('ABC-1')
  expect(workedOn(jira(), 'abc-123x', '/', null)).toBe('ABC-123')
  expect(workedOn(jira(), '9-abc-4', '/', null)).toBe('ABC-4')
})

test('a command is a commit when git commits, in the same command', () => {
  for (const command of ['git commit -m x', 'git -C app commit', 'cd a && git add . && git commit -m "ABC-1: x"']) {
    expect(isCommit(command), command).toBe(true)
  }

  for (const command of [
    'git status',
    'commit',
    'git log; echo commit',
    'git log | grep commit',
    'git commitx',
    'git add a && echo commit',
  ]) {
    expect(isCommit(command), command).toBe(false)
  }
})

test('the ticket a commit just made starts with is the one worked on', () => {
  const now = 1_700_000_000_000

  expect(committedTicket(jira(), `${now / 1000 - 5} ABC-12: Fix the login`, now)).toBe('ABC-12')
  expect(committedTicket(jira(), `${now / 1000 - 5} Fix ABC-12`, now)).toBeUndefined()
  expect(committedTicket(jira(), `${now / 1000 - 5} ABC-12x: no`, now)).toBeUndefined()
  expect(committedTicket(jira(), '', now)).toBeUndefined()
})

test('a commit is the one just made for two minutes only', () => {
  const now = 1_700_000_000_000

  expect(committedTicket(jira(), `${now / 1000 - 119} ABC-1: x`, now)).toBe('ABC-1')
  expect(committedTicket(jira(), `${now / 1000 - 121} ABC-1: x`, now)).toBeUndefined()
  expect(committedTicket(jira(), `${now / 1000 + 5} ABC-1: x`, now)).toBe('ABC-1')
})

test('the tickets nearby are the one worked on first, then those the commits start with, each once', () => {
  const log = 'ABC-2: a\nfix things\nOPS-9: b\nABC-2: c\nABC-3: d\n'

  expect(nearbyTickets(jira(), log, 'ABC-3')).toEqual(['ABC-3', 'ABC-2', 'OPS-9'])
  expect(nearbyTickets(jira(), log, undefined)).toEqual(['ABC-2', 'OPS-9', 'ABC-3'])
  expect(nearbyTickets(jira(), '', 'ABC-1')).toEqual(['ABC-1'])
  expect(nearbyTickets(jira(), '', undefined)).toEqual([])
})

test('the metadata of a session says whether the person named it', () => {
  expect(isNamedInMeta('{"sessionId":"s1","nameSource":"user"}', 's1')).toBe(true)
  expect(isNamedInMeta('{"sessionId":"s1","nameSource":"auto"}', 's1')).toBe(false)
  expect(isNamedInMeta('{"sessionId":"s1"}', 's1')).toBe(false)
})

test('the metadata of another session, half written or empty says nothing', () => {
  for (const text of ['{"sessionId":"s2","nameSource":"user"}', '{"sessionId":"s1"', '', 'null', '3', '[]']) {
    expect(isNamedInMeta(text, 's1'), text).toBeUndefined()
  }
})

test('a title is a ticket’s already when a settings hook gave one, now or before, and not when this mod did', () => {
  expect(isTitledAfterTicket(jira(), 'ABC-1', '', null)).toBe(true)
  expect(isTitledAfterTicket(jira(), undefined, 'ABC-1', null)).toBe(true)
  expect(isTitledAfterTicket(jira(), undefined, 'ABC-1', 'ABC-2')).toBe(true)
  expect(isTitledAfterTicket(jira(), undefined, 'ABC-1', 'ABC-1')).toBe(false)
  expect(isTitledAfterTicket(jira(), undefined, 'A generated title', null)).toBe(false)
  expect(isTitledAfterTicket(jira(), 'A title', 'ABC-1', 'ABC-1')).toBe(false)
  expect(isTitledAfterTicket(jira(), 'ABC-1 more', '', null)).toBe(false)
  expect(isTitledAfterTicket(jira(), undefined, '', null)).toBe(false)
})

test('the title has nothing to change when no ticket is worked on, or it already is the ticket and none is asked', () => {
  expect(isTitleSettled(undefined, 'x', undefined)).toBe(true)
  expect(isTitleSettled('y', 'x', undefined)).toBe(true)
  expect(isTitleSettled(undefined, 'ABC-1', 'ABC-1')).toBe(true)
  expect(isTitleSettled('A title', 'ABC-1', 'ABC-1')).toBe(false)
  expect(isTitleSettled(undefined, 'other', 'ABC-1')).toBe(false)
})

test('a new conversation, or another one resumed, starts from nothing, a compaction does not', () => {
  for (const source of ['startup', 'clear', 'resume']) {
    expect(isNewConversation(source), source).toBe(true)
  }

  for (const source of ['compact', '', 'other']) {
    expect(isNewConversation(source), source).toBe(false)
  }
})

test('a prompt is a ticket alone when it is that ticket or its address and nothing else', () => {
  for (const prompt of ['ABC-12', '  ABC-12. ', `${SITE}/browse/ABC-12`, 'ABC-12\n']) {
    expect(aloneTicket(jira(), undefined, prompt), prompt).toBe('ABC-12')
  }

  for (const prompt of ['mira ABC-12', 'ABC-12 y OPS-1', 'https://other.net/browse/ABC-12', 'xABC-12', 'ABC-12x', '']) {
    expect(aloneTicket(jira(), 'user', prompt), prompt).toBeUndefined()
  }
})

test('only what the person typed is a ticket alone', () => {
  expect(aloneTicket(jira(), 'user', 'ABC-12')).toBe('ABC-12')
  expect(aloneTicket(jira(), undefined, 'ABC-12')).toBe('ABC-12')
  expect(aloneTicket(jira(), 'queued', 'ABC-12')).toBeUndefined()
})

test('a word that may become a ticket is a key being typed, in capitals', () => {
  for (const token of ['ABC', 'abc', 'ABC-', 'ABC-12', 'ops-1']) {
    expect(typedKey(jira(), token), token).toBe(token.toUpperCase())
  }

  for (const token of ['', 'AB', 'ABCD', 'ABC-1x', 'XYZ-1', 'ABC12', 'xABC']) {
    expect(typedKey(jira(), token), token).toBeUndefined()
  }

  expect(typedKey(undefined, 'ABC')).toBeUndefined()
})

test('what is typed is completed by the tickets that start with it, and not by itself', () => {
  expect(completions(['ABC-12', 'ABC-3', 'OPS-1', 'ABC-1'], 'ABC-1')).toEqual([{ text: 'ABC-12' }])
  expect(completions(['ABC-12', 'ABC-3', 'OPS-1'], 'ABC')).toEqual([{ text: 'ABC-12' }, { text: 'ABC-3' }])
  expect(completions(['ABC-12'], 'ABC-12')).toEqual([])
  expect(completions([], 'ABC')).toEqual([])
})
