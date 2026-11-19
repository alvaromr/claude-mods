import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const USAGE = { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }

// A session as the mod reads it, and the model that writes its titles.
const world = (on: On, stored: Record<string, unknown> = {}) => {
  const it = {
    name: 'project-87',
    nameSource: 'derived',
    reply: 'Comparar facturas de luz' as string | undefined,
    /** Why the model cannot be asked at all, as a hook that denies it says. */
    refusal: null as string | null,
    asked: [] as string[],
    // The title a settings hook gives at the same prompt, when one does.
    fromHook: undefined as string | undefined,
    /** What the metadata files of other live sessions, listed before this one's, hold. */
    others: [] as string[],
    /** Files of the sessions' folder that are not metadata, listed before this one's; each reads as this session's, named by the person. */
    strays: [] as string[],
    /** Whether the session's own metadata file exists, as one of a session not yet written would not. */
    hasMeta: true,
    /** The keys the mod wrote or deleted in the store, which is every session's. */
    touched: new Set<string>(),
  }
  const file = (name: string) => ({ name, kind: 'file' as const, size: 1, mtimeMs: 0, isLink: false })
  const mine = () => JSON.stringify({ sessionId: 'abc', name: it.name, nameSource: it.nameSource })

  mock.env(on, { HOME: '/home/me' })
  // The store is every session's: what the mod writes or deletes in it is recorded, by key.
  on('store.get', (_, e) => ({ value: stored[e.key] }))
  on('store.set', (_, e) => {
    it.touched.add(e.key)
    stored[e.key] = e.value

    return { value: undefined }
  })
  on('store.delete', (_, e) => {
    it.touched.add(e.key)
    Reflect.deleteProperty(stored, e.key)

    return { value: undefined }
  })
  on('fs.list', () => ({
    value: [
      ...it.others.map((_, i) => file(`other-${i}.json`)),
      ...it.strays.map(name => file(name)),
      ...(it.hasMeta ? [file('mine.json')] : []),
    ],
  }))
  on('fs.read', (_, e) => {
    const other = /other-(\d+)\.json$/.exec(e.path)

    if (it.strays.some(name => e.path.endsWith(`/${name}`))) {
      return { value: JSON.stringify({ sessionId: 'abc', name: 'by-the-person', nameSource: 'user' }) }
    }

    return { value: other === null ? mine() : (it.others[Number(other[1])] ?? '') }
  })
  on('model.complete', ($, e) => {
    it.asked.push(e.prompt)

    if (it.refusal !== null) {
      return { deny: it.refusal }
    }

    return {
      value:
        it.reply === undefined
          ? { isAnswered: false as const, reason: 'aborted' as const, usage: USAGE }
          : { isAnswered: true as const, text: it.reply, usage: USAGE },
    }
  })
  on('classic.SessionStart', () => ({}))
  on('classic.SessionEnd', () => ({}))
  on('classic.UserPromptSubmit', () => (it.fromHook === undefined ? {} : { sessionTitle: it.fromHook }))

  return it
}

test('titles from the person’s first prompt, and again from the first three', async ($, on) => {
  const it = world(on)
  const prompt = (text: string, source: 'user' | 'system' = 'user') =>
    $.classic.UserPromptSubmit({ prompt: text, source, session_id: 'abc', session_title: it.name })
  // What a title the mod gave leaves behind in the session's metadata.
  const titled = async (text: string) => {
    const title = (await prompt(text)).sessionTitle

    if (title !== undefined) {
      Object.assign(it, { name: title, nameSource: 'hook' })
    }

    return title
  }

  // Nothing to title from: a command, words too few, a prompt nobody typed.
  expect(await titled('/clear')).toBeUndefined()
  expect(await titled('sí')).toBeUndefined()
  expect((await prompt('a notification nobody typed, long enough', 'system')).sessionTitle).toBeUndefined()
  expect(it.asked).toEqual([])

  expect(await titled('[Image #1] compara   estas dos facturas de la luz')).toBe('comparar-facturas-de-luz')
  expect(it.asked).toEqual(['1. compara estas dos facturas de la luz'])

  // The second prompt changes nothing; the third titles it again, to stay.
  it.reply = 'Tarifas eléctricas: ¿cuál conviene?'
  expect(await titled('y ahora mira también la del gas')).toBeUndefined()
  expect(await titled('dime cuál de las tarifas me conviene')).toBe('tarifas-electricas-cual-conviene')
  expect(it.asked[1]).toBe(
    '1. compara estas dos facturas de la luz\n2. y ahora mira también la del gas\n3. dime cuál de las tarifas me conviene',
  )
  expect(await titled('un cuarto prompt que ya no cambia nada')).toBeUndefined()
  expect(it.asked).toHaveLength(2)

  // A new conversation is titled from its own prompts: a /clear leaves the
  // session the name it had, the one the mod gave.
  await $.classic.SessionEnd({ reason: 'clear', session_id: 'abc' })
  await $.classic.SessionStart({ source: 'clear', session_id: 'abc' })
  it.reply = 'Otro tema distinto'
  expect(await titled('empecemos con otra cosa distinta')).toBe('otro-tema-distinto')
})

test('a prompt that starts with a path or a tag is titled; only a slash command, or what the engine wraps, is not', async ($, on) => {
  const it = world(on)
  const prompt = (text: string) =>
    $.classic.UserPromptSubmit({ prompt: text, source: 'user', session_id: 'abc', session_title: it.name })

  expect((await prompt('/compact keep the plan')).sessionTitle).toBeUndefined()
  expect((await prompt('/plugin:command with some arguments')).sessionTitle).toBeUndefined()
  expect((await prompt('<command-name>/clear</command-name> and more text')).sessionTitle).toBeUndefined()
  expect(it.asked).toEqual([])

  expect((await prompt('<div> no centra el texto en la página')).sessionTitle).toBe('comparar-facturas-de-luz')
  expect((await prompt('/Users/me/facturas/luz.csv no se importa bien')).sessionTitle).toBeUndefined()
  expect((await prompt('y el tercero, para que se vuelva a titular')).sessionTitle).toBe('comparar-facturas-de-luz')
  expect(it.asked).toEqual([
    '1. <div> no centra el texto en la página',
    '1. <div> no centra el texto en la página\n2. /Users/me/facturas/luz.csv no se importa bien\n3. y el tercero, para que se vuelva a titular',
  ])
})

test('what another session left in the store for its own /clear is neither taken nor deleted', async ($, on) => {
  // As a /clear in another session would leave it, under the key the mod once used.
  const it = world(on, { carried: 'someone-elses-title' })
  const prompt = (text: string) =>
    $.classic.UserPromptSubmit({ prompt: text, source: 'user', session_id: 'abc', session_title: it.name })

  Object.assign(it, { name: 'someone-elses-title', nameSource: 'hook' })
  await $.classic.SessionEnd({ reason: 'clear', session_id: 'abc' })
  await $.classic.SessionStart({ source: 'clear', session_id: 'abc' })
  await $.classic.SessionStart({ source: 'startup', session_id: 'abc' })

  expect((await prompt('compara estas dos facturas de la luz')).sessionTitle).toBeUndefined()
  expect(it.asked).toEqual([])
  expect([...it.touched]).toEqual([])
})

test('another session’s metadata, half written or empty, does not stop the title', async ($, on) => {
  const it = world(on)

  it.others = ['', '{"sessionId": "x', 'null']

  const answer = await $.classic.UserPromptSubmit({
    prompt: 'compara estas dos facturas de la luz',
    source: 'user',
    session_id: 'abc',
    session_title: it.name,
  })

  expect(answer.sessionTitle).toBe('comparar-facturas-de-luz')
})

test('tries again at the next prompt when the model gave no title', async ($, on) => {
  const it = world(on)
  const prompt = (text: string) =>
    $.classic.UserPromptSubmit({ prompt: text, source: 'user', session_id: 'abc', session_title: it.name })

  it.reply = undefined
  expect((await prompt('compara estas dos facturas de la luz')).sessionTitle).toBeUndefined()

  it.reply = 'ABC-123'
  expect((await prompt('y ahora mira también la del gas')).sessionTitle).toBeUndefined()

  it.reply = 'Facturas de luz y gas'
  expect((await prompt('dime cuál de las tarifas me conviene')).sessionTitle).toBe('facturas-de-luz-y-gas')
})

test('a model it cannot ask gives no title, says why in the debug log, and is asked again', async ($, on) => {
  const it = world(on)
  const logged: { text: string; to: string }[] = []
  on('ui.log', (_, e) => (logged.push(e), { value: undefined }))
  const prompt = (text: string) =>
    $.classic.UserPromptSubmit({ prompt: text, source: 'user', session_id: 'abc', session_title: it.name })

  it.refusal = 'blocked model'
  expect((await prompt('compara estas dos facturas de la luz')).sessionTitle).toBeUndefined()
  expect(logged).toEqual([
    { text: 'asking for a title failed: session-title: $.model.complete: blocked model', to: 'debug' },
  ])

  it.refusal = null
  expect((await prompt('y ahora mira también la del gas')).sessionTitle).toBe('comparar-facturas-de-luz')
})

test('never replaces a ticket, a name the person gave or another hook’s title', async ($, on) => {
  const it = world(on)
  const prompt = (title: string) =>
    $.classic.UserPromptSubmit({
      prompt: 'compara estas dos facturas de la luz',
      source: 'user',
      session_id: 'abc',
      session_title: title,
    })

  Object.assign(it, { name: 'ABC-22133', nameSource: 'hook' })
  expect((await prompt('ABC-22133')).sessionTitle).toBeUndefined()

  Object.assign(it, { name: 'my-own-name', nameSource: 'user' })
  expect((await prompt('my-own-name')).sessionTitle).toBeUndefined()

  Object.assign(it, { name: 'someone-elses-title', nameSource: 'hook' })
  expect((await prompt('someone-elses-title')).sessionTitle).toBeUndefined()
  expect(it.asked).toEqual([])
})

test('leaves the title another hook gives at the same prompt', async ($, on) => {
  const it = world(on)

  it.fromHook = 'ABC-7'

  const answer = await $.classic.UserPromptSubmit({
    prompt: 'empezamos con el ticket ABC-7 de hoy',
    source: 'user',
    session_id: 'abc',
    session_title: it.name,
  })

  expect(answer.sessionTitle).toBe('ABC-7')
  expect(it.asked).toEqual([])
})

test('asks the model for an excerpt of a long prompt, not all of it', async ($, on) => {
  const it = world(on)

  await $.classic.UserPromptSubmit({
    prompt: 'a'.repeat(500),
    source: 'user',
    session_id: 'abc',
    session_title: it.name,
  })

  expect(it.asked).toEqual([`1. ${'a'.repeat(400)}`])
})

test('does not title from what the engine echoes or injects', async ($, on) => {
  const it = world(on)
  const prompt = (text: string) =>
    $.classic.UserPromptSubmit({ prompt: text, source: 'user', session_id: 'abc', session_title: it.name })

  expect((await prompt('<system-reminder> some long reminder text')).sessionTitle).toBeUndefined()
  expect((await prompt('<task-notification> some long task text')).sessionTitle).toBeUndefined()
  expect((await prompt('<local-command-stdout> some long output')).sessionTitle).toBeUndefined()
  expect((await prompt('<bash-input> some long shell line here')).sessionTitle).toBeUndefined()
  expect(it.asked).toEqual([])
})

test('a title is made of the reply’s first line, at most sixty characters, with no dash at its ends', async ($, on) => {
  const it = world(on)
  const prompt = (text: string) =>
    $.classic.UserPromptSubmit({ prompt: text, source: 'user', session_id: 'abc', session_title: it.name })

  it.reply = '\n\nComparar facturas\nuna segunda línea que no cuenta'
  expect((await prompt('compara estas dos facturas de la luz')).sessionTitle).toBe('comparar-facturas')

  // Cut at sixty, where a dash falls.
  const long = Array.from({ length: 10 }, () => 'abcdefghi').join(' ')

  it.reply = long
  expect((await prompt('y ahora mira también la del gas')).sessionTitle).toBeUndefined()
  expect((await prompt('dime cuál de las tarifas me conviene')).sessionTitle).toBe(
    Array.from({ length: 6 }, () => 'abcdefghi').join('-'),
  )
})

test('a title that starts like a ticket but says more is given', async ($, on) => {
  const it = world(on)

  it.reply = 'ABC-12 arreglar facturas'

  const answer = await $.classic.UserPromptSubmit({
    prompt: 'compara estas dos facturas de la luz',
    source: 'user',
    session_id: 'abc',
    session_title: it.name,
  })

  expect(answer.sessionTitle).toBe('abc-12-arreglar-facturas')
})

test('a ticket name is never replaced, even one the session was born with', async ($, on) => {
  const it = world(on)

  Object.assign(it, { name: 'ABC-22133', nameSource: 'derived' })

  const answer = await $.classic.UserPromptSubmit({
    prompt: 'compara estas dos facturas de la luz',
    source: 'user',
    session_id: 'abc',
    session_title: 'ABC-22133',
  })

  expect(answer.sessionTitle).toBeUndefined()
  expect(it.asked).toEqual([])
})

test('only the session’s own metadata, in a file of metadata, says where its name came from', async ($, on) => {
  const it = world(on)
  const prompt = () =>
    $.classic.UserPromptSubmit({
      prompt: 'compara estas dos facturas de la luz',
      source: 'user',
      session_id: 'abc',
      session_title: it.name,
    })

  // Another live session, named by its person, listed before this one.
  it.others = [JSON.stringify({ sessionId: 'zzz', name: 'theirs', nameSource: 'user' })]
  expect((await prompt()).sessionTitle).toBe('comparar-facturas-de-luz')
})

test('a file of the sessions’ folder that is not metadata says nothing of the session', async ($, on) => {
  const it = world(on)

  it.strays = ['notes.txt']

  const answer = await $.classic.UserPromptSubmit({
    prompt: 'compara estas dos facturas de la luz',
    source: 'user',
    session_id: 'abc',
    session_title: it.name,
  })

  expect(answer.sessionTitle).toBe('comparar-facturas-de-luz')
})

test('with no metadata for the session, only a name it was born without is replaced', async ($, on) => {
  const it = world(on)
  const prompt = (title: string) =>
    $.classic.UserPromptSubmit({
      prompt: 'compara estas dos facturas de la luz',
      source: 'user',
      session_id: 'abc',
      session_title: title,
    })

  it.hasMeta = false
  expect((await prompt('a-name-someone-gave')).sessionTitle).toBeUndefined()
  expect(it.asked).toEqual([])
  expect((await prompt('')).sessionTitle).toBe('comparar-facturas-de-luz')
})

test('a session that ends for another reason than a /clear does not carry its title over', async ($, on) => {
  const it = world(on)
  const prompt = (text: string) =>
    $.classic.UserPromptSubmit({ prompt: text, source: 'user', session_id: 'abc', session_title: it.name })

  expect((await prompt('compara estas dos facturas de la luz')).sessionTitle).toBe('comparar-facturas-de-luz')
  Object.assign(it, { name: 'comparar-facturas-de-luz', nameSource: 'hook' })

  await $.classic.SessionEnd({ reason: 'other', session_id: 'abc' })
  await $.classic.SessionStart({ source: 'clear', session_id: 'abc' })
  expect((await prompt('empecemos con otra cosa distinta')).sessionTitle).toBeUndefined()
  expect(it.asked).toHaveLength(1)
})

test('a title given before a /clear does not cross a later fresh start', async ($, on) => {
  const it = world(on)
  const prompt = (text: string) =>
    $.classic.UserPromptSubmit({ prompt: text, source: 'user', session_id: 'abc', session_title: it.name })

  expect((await prompt('compara estas dos facturas de la luz')).sessionTitle).toBe('comparar-facturas-de-luz')
  Object.assign(it, { name: 'comparar-facturas-de-luz', nameSource: 'hook' })

  await $.classic.SessionEnd({ reason: 'clear', session_id: 'abc' })
  await $.classic.SessionStart({ source: 'startup', session_id: 'abc' })
  expect((await prompt('empecemos con otra cosa distinta')).sessionTitle).toBeUndefined()
  expect(it.asked).toHaveLength(1)
})

test('a resumed session keeps the prompts it has said', async ($, on) => {
  const it = world(on)
  const prompt = (text: string) =>
    $.classic.UserPromptSubmit({ prompt: text, source: 'user', session_id: 'abc', session_title: it.name })

  expect((await prompt('compara estas dos facturas de la luz')).sessionTitle).toBe('comparar-facturas-de-luz')
  await $.classic.SessionStart({ source: 'resume', session_id: 'abc' })

  // The session is titled, so the second prompt asks for nothing.
  expect((await prompt('y ahora mira también la del gas')).sessionTitle).toBeUndefined()
  expect(it.asked).toHaveLength(1)
})

test('a session never titled by its third prompt is not titled by a fourth', async ($, on) => {
  const it = world(on)
  const prompt = (text: string) =>
    $.classic.UserPromptSubmit({ prompt: text, source: 'user', session_id: 'abc', session_title: it.name })

  it.reply = undefined
  await prompt('compara estas dos facturas de la luz')
  await prompt('y ahora mira también la del gas')
  await prompt('dime cuál de las tarifas me conviene')
  expect(it.asked).toHaveLength(3)

  it.reply = 'Facturas de luz y gas'
  expect((await prompt('un cuarto prompt que ya no cambia nada')).sessionTitle).toBeUndefined()
  expect(it.asked).toHaveLength(3)
})
