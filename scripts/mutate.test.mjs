import assert from 'node:assert/strict'
import { test } from 'node:test'

import { jobsOf, mutantsOf, mutated, yielding } from './mutate.mjs'

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

test('a list of whole mutants is read; anything else is refused, naming the mod', () => {
  assert.deepEqual(mutantsOf('m', JSON.stringify([MUTANT])), [MUTANT])

  for (const json of ['{}', '[{"file": "a"}]', '[null]', JSON.stringify([{ ...MUTANT, to: 2 }])]) {
    assert.throws(() => mutantsOf('m', json), /^Error: m\/tests\/mutants\.json: a list of/)
  }
})
