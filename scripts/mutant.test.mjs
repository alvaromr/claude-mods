import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { test } from 'node:test'

import { mutated, testOf, trial, verdictOf, yielding } from './mutant.mjs'

const MUTANT = { file: 'hooks/a.ts', from: 'x > 1', to: 'x > 2', why: 'the limit' }

test('a mutant replaces its text, found once, by its own', () => {
  assert.equal(mutated('if (x > 1) {}', MUTANT), 'if (x > 2) {}')
})

test('a mutant whose text is gone or found twice is refused, naming its file and why', () => {
  assert.throws(() => mutated('if (y) {}', MUTANT), /hooks\/a\.ts: «x > 1» is gone; update the mutant «the limit»/)
  assert.throws(() => mutated('x > 1 && x > 1', MUTANT), /found more than once/)
})

test('the runs go to the background on macOS, and behind nice elsewhere', () => {
  assert.deepEqual(yielding('darwin'), ['taskpolicy', '-b'])
  assert.deepEqual(yielding('linux'), ['nice', '-n', '10'])
})

test("a mutant runs the test.sh next to its file, as the pet's Swift has, and the mod's plugin tests otherwise", () => {
  assert.deepEqual(testOf('pet', 'app/Sessions.swift'), ['sh', join('pet', 'app', 'test.sh')])
  assert.deepEqual(testOf('no-such-mod', 'app/Sessions.swift'), ['claude', 'plugin', 'test', 'no-such-mod'])
  assert.deepEqual(testOf('pet', 'hooks/register.ts'), ['claude', 'plugin', 'test', 'pet'])
})

test('a run that ends well passed, one that ends badly failed, and one that cannot start is an error', async () => {
  assert.equal(await verdictOf(['sh', '-c', 'exit 0'], 5000), 'passed')
  assert.equal(await verdictOf(['sh', '-c', 'exit 1'], 5000), 'failed')
  await assert.rejects(verdictOf(['/no/such/command'], 5000))
})

test('a run past its time ran out, stopped with every process it started, so none is left running', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'mutant-test-'))
  const pid = join(tmp, 'pid')

  try {
    assert.equal(await verdictOf(['sh', '-c', `sleep 30 & echo $! >${pid}; wait`], 500), 'timed out')
    const left = Number(readFileSync(pid, 'utf8'))

    assert.ok(existsSync(pid))
    assert.throws(() => process.kill(left, 0), /ESRCH/)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

test("a trial runs the mod's tests on the mutated file, then puts the file back", async () => {
  const copy = mkdtempSync(join(tmpdir(), 'mutant-test-'))
  const file = join(copy, 'app', 'a.txt')

  try {
    mkdirSync(join(copy, 'app'))
    writeFileSync(file, 'x > 1')
    // the test.sh next to the file stands in for the mod's tests: they fail on the mutated text
    writeFileSync(join(copy, 'app', 'test.sh'), `grep -q 'x > 1' '${file}'`)
    const mutant = { ...MUTANT, file: 'app/a.txt' }

    assert.equal(await trial(copy, mutant, 'x > 2', 'x > 1', 5000), 'failed')
    assert.equal(readFileSync(file, 'utf8'), 'x > 1')
    assert.equal(await trial(copy, mutant, 'x > 1 ', 'x > 1', 5000), 'passed')
  } finally {
    rmSync(copy, { recursive: true, force: true })
  }
})
