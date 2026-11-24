import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { reasonOf } from './failure'
import { isDue, isFull, kept, numbered, typed } from './prompts'
import { folderOf, isNameOurs, isNameOursUnlisted, metaOf, metadataFiles } from './sessions'
import { TEXT } from './text'
import { isTicket, titleOf } from './title'

// The title given before a /clear, on its way to the new conversation. A /clear
// drops `$.state` and keeps the session's name, so the title crosses it here:
// the hooks module stays loaded through it, and is the process's own, where
// `$.store` is shared by every session.
let carried: string | null = null
// Whether a person is at the prompt, as the session started: a `-p` run or the
// SDK is never titled. The process's own too, as a /clear starts no session.
let isInteractive = false

const prompts = atom({ plugin: 'session-title', key: 'prompts' } as const, [])
const counted = atom({ plugin: 'session-title', key: 'counted' } as const, 0)
const given = atom({ plugin: 'session-title', key: 'given' } as const, null)
const isTitled = atom({ plugin: 'session-title', key: 'isTitled' } as const, false)

/** A call that failed gives `fallback`, the mod doing less, and its cause goes to the debug log. */
const orElse =
  <T>($: EngineInterface, doing: string, fallback: T) =>
  (failure: unknown): T => {
    $.ui.log(`${doing} failed: ${reasonOf(failure)}`, { to: 'debug' })

    return fallback
  }

/** Why a prompt makes no title, in the debug log, so a session left untitled can be told why. */
const because = ($: EngineInterface, why: string) => {
  $.ui.log(why, { to: 'debug' })
}

const titleFor = async ($: EngineInterface, said: string) => {
  const reply = await $.model
    .complete({
      model: 'haiku',
      system: TEXT.ask,
      prompt: said,
      maxTokens: 40,
      timeoutMs: 8000,
    })
    .catch(orElse($, 'asking for a title', undefined))

  if (reply?.isAnswered !== true) {
    if (reply !== undefined) {
      because($, `no title: the model gave none (${reply.reason})`)
    }

    return undefined
  }

  const title = titleOf(reply.text)

  if (title === undefined) {
    because($, `no title: the reply ${JSON.stringify(reply.text)} has no words or reads as a ticket`)
  }

  return title
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
  on('session.start', async ($, e, next) => {
    isInteractive = e.isInteractive

    return next(e)
  })

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
      await update($, counted, () => 0)
      await update($, isTitled, () => false)
      await update($, given, () => crossed)
    }

    return next(e)
  })

  // Made while the prompt is answered, so a session of one prompt is titled too.
  on('classic.UserPromptSubmit', async ($, e, next) => {
    const answer = await next(e)
    const leftOut = (why: string) => {
      because($, `prompt left out: ${why}`)

      return answer
    }
    const noTitle = (why: string) => {
      because($, `no title: ${why}`)

      return answer
    }
    const heard = typed(e)

    if (!isInteractive) {
      return leftOut('nobody is at the prompt')
    }

    if ('dropped' in heard) {
      return leftOut(heard.dropped)
    }

    const before = await read($, prompts)
    const sofar = await read($, counted)

    if (isFull(sofar)) {
      return leftOut('the title is made to stay')
    }

    // A prompt said again, as Orca repeats a brief, counts once.
    if (before.includes(heard.text)) {
      return leftOut('said before')
    }

    const said = kept(before, heard.text)
    const count = sofar + 1
    await update($, prompts, () => said)
    await update($, counted, () => count)

    if (!isDue(count, await read($, isTitled))) {
      return answer
    }

    if (answer.sessionTitle !== undefined) {
      return noTitle('another hook titled the session')
    }

    if (!(await isOursToName($, e))) {
      return noTitle("the session's name is not the mod's to replace")
    }

    const title = await titleFor($, numbered(said, count))

    if (title === undefined) {
      return answer
    }

    await update($, given, () => title)
    await update($, isTitled, () => true)

    return { ...answer, sessionTitle: title }
  })
}
