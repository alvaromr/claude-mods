import assert from 'node:assert/strict'
import { test } from 'node:test'

import { fingerprint, inputsOf, jobsOf, mustRun, mutantsOf, mutated, yielding } from './mutate.mjs'

const MUTANT = { file: 'hooks/a.ts', from: 'x > 1', to: 'x > 2', why: 'the limit' }

test('a mutant replaces its text, found once, by its own', () => {
  assert.equal(mutated('if (x > 1) {}', MUTANT), 'if (x > 2) {}')
})

test('a mutant whose text is gone or found twice is refused, naming its file and why', () => {
  assert.throws(() => mutated('if (y) {}', MUTANT), /hooks\/a\.ts: «x > 1» is gone; update the mutant «the limit»/)
  assert.throws(() => mutated('x > 1 && x > 1', MUTANT), /found more than once/)
})

test('mutants run on a quarter of the cores, at least one, unless MUTATE_JOBS says how many', () => {
  assert.equal(jobsOf(undefined, 15), 3)
  assert.equal(jobsOf(undefined, 16), 4)
  assert.equal(jobsOf('', 1), 1)
  assert.equal(jobsOf('3', 15), 3)

  for (const setting of ['0', '-1', '2.5', 'many']) {
    assert.throws(() => jobsOf(setting, 15), /^Error: MUTATE_JOBS is .+: a whole number from 1$/)
  }
})

test('the runs go to the background on macOS, and behind nice elsewhere', () => {
  assert.deepEqual(yielding('darwin'), ['taskpolicy', '-b'])
  assert.deepEqual(yielding('linux'), ['nice', '-n', '10'])
})

test('the same files give the same fingerprint, in any order; a change of content or path gives another', () => {
  const files = [
    ['m/hooks/a.ts', 'one'],
    ['m/tests/a.test.ts', 'two'],
  ]
  const print = fingerprint(files)

  assert.match(print, /^[0-9a-f]{64}$/)
  assert.equal(fingerprint([...files].reverse()), print)
  assert.notEqual(fingerprint([files[0], ['m/tests/a.test.ts', 'two!']]), print)
  assert.notEqual(fingerprint([files[0], ['m/tests/b.test.ts', 'two']]), print)
  // a path and a content that run together are told apart
  assert.notEqual(fingerprint([['ab', 'c']]), fingerprint([['a', 'bc']]))
})

test("a mod's fingerprint reads its own files and what every mod's mutants depend on, not the engine's types", () => {
  const inputs = inputsOf('guard-pnpm')

  for (const shared of ['package.json', 'pnpm-lock.yaml', '.node-version', 'scripts/mutate.mjs']) {
    assert.ok(inputs.includes(shared), shared)
  }

  assert.ok(inputs.includes('guard-pnpm/tests/mutants.json'))
  assert.ok(inputs.includes('guard-pnpm/.claude-plugin/plugin.json'))
  assert.ok(inputs.some(path => path.startsWith('guard-pnpm/hooks/')))
  assert.ok(!inputs.some(path => path.includes('/.claude-plugin/types/') || path.endsWith('.DS_Store')))
  assert.ok(!inputs.some(path => path.startsWith('bar-git/')))
})

test("a mod's mutants run when asked for all, or when no run killed them all on these files", () => {
  const record = { m: { fingerprint: 'abc', killed: 3 } }

  assert.equal(mustRun(record, 'm', 'abc', false), false)
  assert.equal(mustRun(record, 'm', 'abc', true), true)
  assert.equal(mustRun(record, 'm', 'abd', false), true)
  assert.equal(mustRun(record, 'other', 'abc', false), true)
  assert.equal(mustRun({}, 'm', 'abc', false), true)
})

test('a list of whole mutants is read; anything else is refused, naming the mod', () => {
  assert.deepEqual(mutantsOf('m', JSON.stringify([MUTANT])), [MUTANT])

  for (const json of ['{}', '[{"file": "a"}]', '[null]', JSON.stringify([{ ...MUTANT, to: 2 }])]) {
    assert.throws(() => mutantsOf('m', json), /^Error: m\/tests\/mutants\.json: a list of/)
  }
})
