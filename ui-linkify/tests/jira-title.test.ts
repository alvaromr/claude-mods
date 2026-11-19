import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'
import { jira, SITE } from './jira'

const NOW = 1_700_000_000_000
const RAN = { stdout: '', stderr: '', interrupted: false }

const printed = (stdout: string) => ({
  value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
})

// A repository and a session as the mod reads them; `generated` stands for a
// settings hook that titles sessions with a made-up name.
const world = (on: On, saved?: Record<string, unknown>) => {
  const it = {
    /** Why the Bash tool is refused, nothing while it runs; `isFailing`: it runs and ends in an error. */
    denied: null as string | null,
    isFailing: false,
    branch: 'canary',
    lastCommit: `${NOW / 1000 - 9999} old commit`,
    nameSource: 'derived',
    generated: undefined as string | undefined,
    /** Why git cannot run at all, as a hook that denies it says. */
    refusal: null as string | null,
    /** What the metadata files of other live sessions, listed before this one's, hold. */
    others: [] as string[],
  }
  const file = (name: string) => ({ name, kind: 'file' as const, size: 1, mtimeMs: 0, isLink: false })

  // Its hooks load the settings themselves: no session started. HOME is /home/me.
  jira(on, saved)
  mock.clock(on, { now: NOW })
  on('process.run', ($, e) =>
    it.refusal === null ? printed(`${e.argv.includes('log') ? it.lastCommit : it.branch}\n`) : { deny: it.refusal },
  )
  on('fs.list', () => ({
    value: [file('1.key'), ...it.others.map((_, i) => file(`other-${i}.json`)), file('1.json')],
  }))
  on('fs.read', (_, e) => {
    const other = /other-(\d+)\.json$/.exec(e.path)

    // A file that is no session's metadata, though it reads as the person's naming this one.
    if (e.path.endsWith('.key')) {
      return { value: JSON.stringify({ sessionId: 'abc', nameSource: 'user' }) }
    }

    return {
      value:
        other === null
          ? JSON.stringify({ sessionId: 'abc', nameSource: it.nameSource })
          : (it.others[Number(other[1])] ?? ''),
    }
  })
  on('classic.SessionStart', () => ({}))
  on('classic.UserPromptSubmit', () => (it.generated === undefined ? {} : { sessionTitle: it.generated }))
  on('tool.call', { tool: 'Bash' }, () =>
    it.denied !== null
      ? { deny: it.denied }
      : it.isFailing
        ? { isError: true as const, result: 'it failed' }
        : { result: RAN },
  )

  return it
}

test('titles the session after the ticket its branch is named after, and holds it', async ($, on) => {
  const it = world(on)
  const prompt = (text: string, title?: string) =>
    $.classic.UserPromptSubmit({ prompt: text, session_id: 'abc', session_title: title, cwd: '/repo' })

  // A ticket a prompt mentions is not the one being worked on.
  expect((await prompt('work on ABC-7, related to ABC-8')).sessionTitle).toBeUndefined()
  expect((await prompt('log 30m on ABC-795')).sessionTitle).toBeUndefined()

  // The work moves to the ticket's branch.
  it.branch = 'abc-22133-login-android'
  expect((await prompt('go on')).sessionTitle).toBe('ABC-22133')
  expect((await prompt('go on', 'ABC-22133')).sessionTitle).toBeUndefined()

  // There the branch decides, whatever ticket is prompted alone.
  expect((await prompt('ABC-8', 'ABC-22133')).sessionTitle).toBeUndefined()

  // A generated title that lands afterwards is replaced.
  it.generated = 'some-generated-title'
  expect((await prompt('go on', 'ABC-22133')).sessionTitle).toBe('ABC-22133')
  it.generated = undefined

  // A name the person gave is left alone.
  it.nameSource = 'user'
  expect((await prompt('go on', 'my-own-name')).sessionTitle).toBeUndefined()

  // Titled as the session starts, too.
  it.nameSource = 'derived'
  expect((await $.classic.SessionStart({ source: 'resume', session_id: 'abc', cwd: '/repo' })).sessionTitle).toBe(
    'ABC-22133',
  )
})

test('lets a settings hook that titles the session after a ticket win', async ($, on) => {
  const it = world(on)
  const prompt = (text: string, title?: string) =>
    $.classic.UserPromptSubmit({ prompt: text, session_id: 'abc', session_title: title, cwd: '/repo' })

  it.branch = 'abc-22133-login-android'

  // The hook's ticket is the answer, though the branch names another.
  it.generated = 'ABC-795'
  expect((await prompt('start on ABC-795')).sessionTitle).toBe('ABC-795')
  it.generated = undefined

  // And it is held at the prompts that follow, and in a session resumed with it.
  expect((await prompt('go on', 'ABC-795')).sessionTitle).toBeUndefined()
  expect(
    (await $.classic.SessionStart({ source: 'resume', session_id: 'abc', session_title: 'ABC-795', cwd: '/repo' }))
      .sessionTitle,
  ).toBeUndefined()
})

test('another session’s metadata, half written or empty, does not stop the title', async ($, on) => {
  const it = world(on)

  it.branch = 'abc-22133-login-android'
  it.others = ['', '{"sessionId": "x', 'null']

  const answer = await $.classic.UserPromptSubmit({ prompt: 'go on', session_id: 'abc', cwd: '/repo' })

  expect(answer.sessionTitle).toBe('ABC-22133')
})

test('with git unable to run, reads the ticket off the folder, and why is in the debug log', async ($, on) => {
  const logged: { text: string; to: string }[] = []
  on('ui.log', (_, e) => (logged.push(e), { value: undefined }))
  world(on).refusal = 'no git'

  const at = (cwd: string) => $.classic.UserPromptSubmit({ prompt: 'go on', session_id: 'abc', cwd })

  expect((await at('/work/abc-24640-notifications')).sessionTitle).toBe('ABC-24640')
  expect(logged).toContainEqual({ text: 'reading the branch failed: ui-linkify: $.process.run: no git', to: 'debug' })
})

test('reads the ticket off the worktree folder when the branch names none', async ($, on) => {
  world(on).branch = 'wip'

  const at = (cwd: string) => $.classic.UserPromptSubmit({ prompt: 'go on', session_id: 'abc', cwd })

  expect((await at('/work/abc-24640-notifications')).sessionTitle).toBe('ABC-24640')
  expect((await at('/work/android-app')).sessionTitle).toBeUndefined()
  expect((await at('/work/zabc-12-other')).sessionTitle).toBeUndefined()
})

test('outside a ticket branch, takes the ticket prompted alone or committed to', async ($, on) => {
  const it = world(on)
  const prompt = (text: string, title?: string) =>
    $.classic.UserPromptSubmit({ prompt: text, source: 'user', session_id: 'abc', session_title: title, cwd: '/repo' })
  const commit = () => $.tool.call({ tool: 'Bash', command: 'git add . && git commit -F message.txt' })

  // The ticket alone, or its address alone.
  expect((await prompt('ABC-7')).sessionTitle).toBe('ABC-7')
  expect((await prompt(`  ${SITE}/browse/ABC-9.\n`, 'ABC-7')).sessionTitle).toBe('ABC-9')
  expect((await prompt('see ABC-3', 'ABC-9')).sessionTitle).toBeUndefined()

  // A commit that is not this call's, or names no ticket first, changes nothing.
  await commit()
  it.lastCommit = `${NOW / 1000 - 5} Fix the parser (ABC-4)`
  await commit()
  expect((await prompt('go on', 'ABC-9')).sessionTitle).toBeUndefined()

  // A commit to a ticket titles the session at the next prompt.
  it.lastCommit = `${NOW / 1000 - 5} ABC-18321: Fix the parser`
  await commit()
  expect((await prompt('go on', 'ABC-9')).sessionTitle).toBe('ABC-18321')

  // A new conversation starts with none, and so does another one resumed.
  await $.classic.SessionStart({ source: 'clear', session_id: 'abc', cwd: '/repo' })
  expect((await prompt('go on', 'some-title')).sessionTitle).toBeUndefined()
  expect((await prompt('ABC-7', 'some-title')).sessionTitle).toBe('ABC-7')
  await $.classic.SessionStart({ source: 'resume', session_id: 'abc', cwd: '/repo' })
  expect((await prompt('go on', 'some-title')).sessionTitle).toBeUndefined()

  // A prompt nobody typed says nothing.
  const sent = await $.classic.UserPromptSubmit({ prompt: 'ABC-5', source: 'system', session_id: 'abc', cwd: '/repo' })

  expect(sent.sessionTitle).toBeUndefined()
})

// A prompt of the person's own, in a session titled `title`, at `cwd`.
const typed = ($: Engine, text: string, title?: string, cwd = '/repo') =>
  $.classic.UserPromptSubmit({ prompt: text, source: 'user', session_id: 'abc', session_title: title, cwd })

test('a prompt that is a ticket and more, or a look-alike of the site’s address, says no ticket worked on', async ($, on) => {
  world(on)

  expect((await typed($, 'ABC-3 is broken', 'some-title')).sessionTitle).toBeUndefined()
  // Nothing worked on leaves the answer as it was, with no title in it at all.
  expect(Object.keys(await typed($, 'go on', 'some-title'))).toEqual([])
  expect((await typed($, 'https://exampleXatlassianXnet/browse/ABC-9', 'some-title')).sessionTitle).toBeUndefined()
  expect((await typed($, `${SITE}/browse/ABC-9`, 'some-title')).sessionTitle).toBe('ABC-9')
})

test('a title a settings hook gave that is more than a ticket does not win over the one worked on', async ($, on) => {
  const it = world(on)

  it.branch = 'abc-22133-login-android'
  it.generated = 'ABC-795 login'
  expect((await typed($, 'go on')).sessionTitle).toBe('ABC-22133')
  it.generated = undefined
  expect((await typed($, 'go on', 'ABC-795 login')).sessionTitle).toBe('ABC-22133')
})

test('a commit titles the session only when it is a git commit just made that starts with a ticket', async ($, on) => {
  const it = world(on)
  const bash = (command: string) => $.tool.call({ tool: 'Bash', command })
  const worked = async () => (await typed($, 'go on', 'some-title')).sessionTitle

  // Not a commit, though a commit may be named.
  it.lastCommit = `${NOW / 1000 - 5} ABC-18321: Fix the parser`
  await bash('ls')
  await bash('echo commit')
  await bash('git status; echo commit')
  expect(await worked()).toBeUndefined()

  // A commit that is not this call's, though it starts with a ticket.
  it.lastCommit = `${NOW / 1000 - 9999} ABC-18321: Fix the parser`
  await bash('git commit -m x')
  expect(await worked()).toBeUndefined()

  // A ticket that goes on as a word, and one that is denied or failed.
  it.lastCommit = `${NOW / 1000 - 5} ABC-18321x: Fix the parser`
  await bash('git commit -m x')
  expect(await worked()).toBeUndefined()
  it.lastCommit = `${NOW / 1000 - 5} ABC-18321: Fix the parser`
  it.denied = 'no commits'
  await bash('git commit -m x')
  expect(await worked()).toBeUndefined()
  it.denied = null
  it.isFailing = true
  await bash('git commit -m x')
  expect(await worked()).toBeUndefined()

  // And one that went through.
  it.isFailing = false
  await bash('git commit -m x')
  expect(await worked()).toBe('ABC-18321')
})

test('a commit that names no ticket leaves the ticket said before', async ($, on) => {
  const it = world(on)

  expect((await typed($, 'ABC-5')).sessionTitle).toBe('ABC-5')
  it.lastCommit = `${NOW / 1000 - 5} Fix the parser`
  await $.tool.call({ tool: 'Bash', command: 'git commit -m x' })
  expect((await typed($, 'go on', 'some-title')).sessionTitle).toBe('ABC-5')
})

test('the branch’s ticket comes before the folder’s', async ($, on) => {
  const it = world(on)

  it.branch = 'abc-2-login'
  expect((await typed($, 'go on', undefined, '/work/abc-1-other')).sessionTitle).toBe('ABC-2')
})

test('a metadata file that is no json, or another session’s, does not say who named this one', async ($, on) => {
  const it = world(on)

  it.branch = 'abc-22133-login-android'
  // Another session's, which the person named, is listed before this one's.
  it.others = ['{"sessionId": "other", "nameSource": "user"}']
  expect((await typed($, 'go on')).sessionTitle).toBe('ABC-22133')
})

test('a ticket said, and a title given, are forgotten as a conversation starts, not as it is compacted', async ($, on) => {
  const it = world(on)
  const start = (source: 'startup' | 'compact', title?: string) =>
    $.classic.SessionStart({ source, session_id: 'abc', session_title: title, cwd: '/repo' })

  expect((await typed($, 'ABC-7')).sessionTitle).toBe('ABC-7')
  expect((await start('compact', 'some-title')).sessionTitle).toBe('ABC-7')
  expect((await start('startup', 'some-title')).sessionTitle).toBeUndefined()

  // The title the mod gave in the last session is no longer its own.
  it.branch = 'abc-22133-login-android'
  expect((await typed($, 'go on')).sessionTitle).toBe('ABC-22133')
  it.branch = 'abc-5-other'
  expect(
    (await $.classic.SessionStart({ source: 'resume', session_id: 'abc', session_title: 'ABC-22133', cwd: '/repo' }))
      .sessionTitle,
  ).toBeUndefined()
})

test('with the title switch off, neither a session start nor a prompt titles the session', async ($, on) => {
  const it = world(on, { site: SITE, keys: 'ABC', title: false })

  it.branch = 'abc-22133-login-android'
  expect((await typed($, 'go on')).sessionTitle).toBeUndefined()
  expect(
    (await $.classic.SessionStart({ source: 'resume', session_id: 'abc', cwd: '/repo' })).sessionTitle,
  ).toBeUndefined()
})
