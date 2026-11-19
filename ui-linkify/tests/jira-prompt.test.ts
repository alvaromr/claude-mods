import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { PromptAutocompleteInput, PromptAutocompleteResult } from 'claude-code'
import { jira } from './jira'

// The box's autocomplete as the test raises it: the kit raises it, and its
// typings list on `$.prompt` only the calls a plugin's own `$` makes.
const autocomplete = ($: Engine, e: PromptAutocompleteInput) =>
  (
    $.prompt as unknown as { autocomplete: (e: PromptAutocompleteInput) => Promise<PromptAutocompleteResult> }
  ).autocomplete(e)

test('offers the tickets of the branch and of the recent commits while a key is typed', async ($, on) => {
  const begin = jira(on)
  on('process.run', (_, e) => {
    const stdout = e.argv.includes('log') ? 'ABC-9: Ship it\nNo ticket here\nABC-7: Start\n' : 'abc-7-login\n'

    return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('session.cwd', () => ({ value: '/repo' }))
  on('prompt.autocomplete', () => ({ suggestions: [] }))
  await begin($)

  const offered = async (token: string) =>
    (await autocomplete($, { text: `see ${token}`, cursor: 4 + token.length, token, start: 4 })).suggestions

  expect(await offered('AB')).toEqual([])
  expect(await offered('ABC-')).toEqual([{ text: 'ABC-7' }, { text: 'ABC-9' }])
  expect(await offered('abc-')).toEqual([{ text: 'ABC-7' }, { text: 'ABC-9' }])
  expect(await offered('abc-9')).toEqual([])
  expect(await offered('ABC-7')).toEqual([])
})

test('takes tickets from the last 20 commits, and offers them after what the suggestions beneath hold', async ($, on) => {
  const begin = jira(on)
  // Thirty commits, each of its own ticket, newest first; git gives as many as it is asked for.
  const commits = Array.from({ length: 30 }, (_, n) => `ABC-${100 + n}: Work`)

  on('process.run', (_, e) => {
    const count = Number(e.argv.find(arg => /^-\d+$/.test(arg))?.slice(1))
    const stdout = e.argv.includes('log') ? commits.slice(0, count).join('\n') : 'wip\n'

    return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('session.cwd', () => ({ value: '/repo' }))
  on('prompt.autocomplete', () => ({ suggestions: [{ text: 'beneath' }] }))
  await begin($)

  const offered = (await autocomplete($, { text: 'see ABC-1', cursor: 9, token: 'ABC-1', start: 4 })).suggestions

  expect(offered[0]).toEqual({ text: 'beneath' })
  expect(offered.slice(1)).toEqual(commits.slice(0, 20).map(subject => ({ text: subject.split(':')[0] })))
})
