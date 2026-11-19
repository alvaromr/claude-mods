import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { reasonOf } from './failure'
import { completes, isFull, numbered, typed } from './prompts'
import { folderOf, isNameOurs, isNameOursUnlisted, metaOf, metadataFiles } from './sessions'
import { TEXT } from './text'
import { isTicket, slug } from './title'

// The title given before a /clear, on its way to the new conversation. A /clear
// drops `$.state` and keeps the session's name, so the title crosses it here:
// the hooks module stays loaded through it, and is the process's own, where
// `$.store` is shared by every session.
let carried: string | null = null

const prompts = atom({ plugin: 'session-title', key: 'prompts' } as const, [])
const given = atom({ plugin: 'session-title', key: 'given' } as const, null)
const isTitled = atom({ plugin: 'session-title', key: 'isTitled' } as const, false)

/** A call that failed gives `fallback`, the mod doing less, and its cause goes to the debug log. */
const orElse =
  <T>($: EngineInterface, doing: string, fallback: T) =>
  (failure: unknown): T => {
    $.ui.log(`${doing} failed: ${reasonOf(failure)}`, { to: 'debug' })

    return fallback
  }

const titleFor = async ($: EngineInterface, said: readonly string[]) => {
  const reply = await $.model
    .complete({
      model: 'haiku',
      system: TEXT.ask,
      prompt: numbered(said),
      maxTokens: 40,
      timeoutMs: 8000,
    })
    .catch(orElse($, 'asking for a title', undefined))

  return reply?.isAnswered === true ? slug(reply.text) : undefined
}

// Whether the session's name is still the one it was born with, or the one this
// mod gave: a ticket, a name the person gave or another hook's is never replaced.
const isOursToName = async ($: EngineInterface, e: { session_id: string; session_title?: string }) => {
  const mine = await read($, given)
  const current = e.session_title ?? ''

  if (isTicket(current)) {
    return false
  }

  // The metadata Claude Code keeps of each live session says where its name came from.
  const folder = folderOf(await $.env.get('HOME'))
  const entries = await $.fs.list(folder).catch(orElse($, "listing the sessions' metadata", []))

  for (const entry of metadataFiles(entries)) {
    const text = await $.fs
      .read(`${folder}/${entry.name}`)
      .catch(orElse($, `reading ${entry.name} of the sessions`, ''))
    const meta = metaOf(text)

    if (meta?.sessionId === e.session_id) {
      return isNameOurs(meta, mine)
    }
  }

  return isNameOursUnlisted(current, mine)
}

export const register: Register = on => {
  // The title given crosses a /clear, so the name is still ours to replace.
  on('classic.SessionEnd', async ($, e, next) => {
    if (e.reason === 'clear') {
      carried = await read($, given)
    }

    return next(e)
  })

  // A new conversation is titled from its own prompts.
  on('classic.SessionStart', async ($, e, next) => {
    if (e.source === 'startup' || e.source === 'clear') {
      const crossed = e.source === 'clear' ? carried : null

      carried = null
      await update($, prompts, () => [])
      await update($, isTitled, () => false)
      await update($, given, () => crossed)
    }

    return next(e)
  })

  // Made while the prompt is answered, so a session of one prompt is titled too.
  on('classic.UserPromptSubmit', async ($, e, next) => {
    const answer = await next(e)
    const text = typed(e)
    const before = await read($, prompts)

    if (text === undefined || isFull(before.length)) {
      return answer
    }

    const said = [...before, text]
    await update($, prompts, () => said)

    const isDue = completes(said.length) || !(await read($, isTitled))

    if (!isDue || answer.sessionTitle !== undefined || !(await isOursToName($, e))) {
      return answer
    }

    const title = await titleFor($, said)

    if (title === undefined) {
      return answer
    }

    await update($, given, () => title)
    await update($, isTitled, () => true)

    return { ...answer, sessionTitle: title }
  })
}
