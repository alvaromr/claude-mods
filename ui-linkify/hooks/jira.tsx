import { atom, read, update } from 'claude-code'
import type { EngineInterface, On } from 'claude-code'

import type { Span } from '../types'
import { orElse, ready, shown } from './settings'
import {
  aloneTicket,
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
} from './tickets'
import type { Jira } from './tickets'

// The ticket the person last said they work on outside a ticket's branch: by a
// prompt that is the ticket and nothing else, or by a commit to it.
const said = atom({ plugin: 'ui-linkify', key: 'ticket' } as const, null)

// The ticket the subject of the commit just made starts with, `ABC-123: …`.
const committed = async ($: EngineInterface, jira: Jira) => {
  const ran = await $.process
    .run(['git', '--no-optional-locks', 'log', '-1', '--format=%ct %s'])
    .catch(orElse($, 'reading the last commit', undefined))

  return committedTicket(jira, ran?.stdout ?? '', await $.clock.now())
}

// The ticket being worked on: the one the branch checked out is named after, or
// the folder, and outside such a branch the one the person last said.
const worked = async ($: EngineInterface, jira: Jira, cwd: string) => {
  const ran = await $.process
    .run(['git', '--no-optional-locks', 'branch', '--show-current'], { cwd })
    .catch(orElse($, 'reading the branch', undefined))

  return workedOn(jira, ran?.stdout ?? '', cwd, await read($, said))
}

// Whether the person named the session themselves (/rename), as the metadata
// Claude Code keeps of each live session tells it.
const isNamedByPerson = async ($: EngineInterface, sessionId: string) => {
  const folder = `${await $.env.get('HOME')}/.claude/sessions`
  const entries = await $.fs.list(folder).catch(orElse($, "listing the sessions' metadata", []))

  for (const entry of entries.filter(entry => entry.name.endsWith('.json'))) {
    const text = await $.fs
      .read(`${folder}/${entry.name}`)
      .catch(orElse($, `reading ${entry.name} of the sessions`, ''))
    const isNamed = isNamedInMeta(text, sessionId)

    if (isNamed !== undefined) {
      return isNamed
    }
  }

  return false
}

// The title this mod last gave the session, to tell it from a ticket a settings
// hook titled it after.
const given = atom({ plugin: 'ui-linkify', key: 'given' } as const, null)

// The event's answer, titling the session after the ticket being worked on where
// nothing else titled it after a ticket: a settings hook's ticket wins, now or
// from an earlier prompt, and so does a name the person gave. A generated title
// does not.
const titled = async <Answer extends { sessionTitle?: string }>(
  $: EngineInterface,
  jira: Jira,
  e: { cwd: string; session_id: string; session_title?: string },
  answer: Answer,
): Promise<Answer> => {
  const asked = answer.sessionTitle
  const current = e.session_title ?? ''

  if (isTitledAfterTicket(jira, asked, current, await read($, given))) {
    return answer
  }

  const wanted = await worked($, jira, e.cwd)

  if (isTitleSettled(asked, current, wanted) || (await isNamedByPerson($, e.session_id))) {
    return answer
  }

  await update($, given, () => wanted)

  return { ...answer, sessionTitle: wanted }
}

// How many recent commits the autocomplete takes tickets from.
const RECENT_COMMITS = 20

// The tickets the person may be about to name: the one worked on, then those
// the recent commits start with.
const nearby = async ($: EngineInterface, jira: Jira, cwd: string) => {
  const ran = await $.process
    .run(['git', '--no-optional-locks', 'log', `-${RECENT_COMMITS}`, '--format=%s'], { cwd })
    .catch(orElse($, 'reading the recent commits', undefined))

  return nearbyTickets(jira, ran?.stdout ?? '', await worked($, jira, cwd))
}

// The Jira tickets as links, and the session titled after the one worked on.
export const registerJira = (on: On) => {
  // A new conversation, or another one resumed, does not inherit the ticket
  // the last one said.
  on('classic.SessionStart', async ($, e, next) => {
    if (isNewConversation(e.source)) {
      await update($, said, () => null)
      await update($, given, () => null)
    }

    const s = await ready($)
    const jira = jiraIn(s)
    const answer = await next(e)

    return jira === undefined || !s.title ? answer : titled($, jira, e, answer)
  })

  // Asked at each prompt as well: the branch changes within a session, as when
  // the work moves into a worktree.
  on('classic.UserPromptSubmit', async ($, e, next) => {
    const s = await ready($)
    const jira = jiraIn(s)
    const alone = jira === undefined ? undefined : aloneTicket(jira, e.source, e.prompt)

    if (alone !== undefined) {
      await update($, said, () => alone)
    }

    const answer = await next(e)

    return jira === undefined || !s.title ? answer : titled($, jira, e, answer)
  })

  // The title follows at the next prompt: only a prompt's answer can set it.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    const jira = jiraIn(await ready($))

    if (jira !== undefined && isCommit(e.command) && ran.deny === undefined && ran.isError !== true) {
      const found = await committed($, jira)

      if (found !== undefined) {
        await update($, said, () => found)
      }
    }

    return ran
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const jira = jiraIn(await shown($))

    return jira === undefined ? next(e) : next({ ...e, props: { ...e.props, text: linkTickets(jira, e.props.text) } })
  })

  // A key being typed offers the tickets worked on and committed to lately.
  on('prompt.autocomplete', async ($, e, next) => {
    const beneath = await next(e)
    const jira = jiraIn(await ready($))
    const typed = typedKey(jira, e.token)

    if (jira === undefined || typed === undefined) {
      return beneath
    }

    return {
      suggestions: [...beneath.suggestions, ...completions(await nearby($, jira, await $.session.cwd()), typed)],
    }
  })
}

/** The tickets a prompt names, as the links of its row (register.tsx draws it); none while Jira is off or unset. */
export async function ticketLinks($: EngineInterface, text: string): Promise<Span[]> {
  const jira = jiraIn(await shown($))

  return jira === undefined ? [] : ticketSpans(jira, text)
}
