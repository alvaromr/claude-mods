import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { test } from 'node:test'

import {
  fingerprint,
  inputsOf,
  jobsOf,
  mustRun,
  mutantsOf,
  mutated,
  passes,
  testOf,
  workersOf,
  yielding,
} from './mutate.mjs'

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

test("a mod's fingerprint reads its own files and this script, not the engine's types nor the repo's tools", () => {
  const inputs = inputsOf('guard-pnpm')

  assert.ok(inputs.includes('scripts/mutate.mjs'))

  // the mods import only the engine, so the tools pnpm installs change no mutant's result
  for (const tool of ['package.json', 'pnpm-lock.yaml', '.node-version']) {
    assert.ok(!inputs.includes(tool), tool)
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

test("a mutant runs the test.sh next to its file, as the pet's Swift has, and the mod's plugin tests otherwise", () => {
  assert.deepEqual(testOf('pet', 'app/Sessions.swift'), ['sh', join('pet', 'app', 'test.sh')])
  assert.deepEqual(testOf('no-such-mod', 'app/Sessions.swift'), ['claude', 'plugin', 'test', 'no-such-mod'])
  assert.deepEqual(testOf('pet', 'hooks/register.ts'), ['claude', 'plugin', 'test', 'pet'])
})

test('a mod with mutants a test.sh runs, which compile, has at most two at once', () => {
  const swift = { ...MUTANT, file: 'app/Sessions.swift' }
  const native = mutant => mutant.file.endsWith('.swift')

  assert.equal(workersOf(3, [MUTANT, MUTANT, MUTANT, MUTANT], native), 3)
  assert.equal(workersOf(3, [MUTANT, swift, swift], native), 2)
  assert.equal(workersOf(1, [swift, swift], native), 1)
  assert.equal(workersOf(3, [MUTANT], native), 1)
})

test('a run passes when its command ends well, fails otherwise, and one that cannot start is an error', async () => {
  assert.equal(await passes(['sh', '-c', 'exit 0']), true)
  assert.equal(await passes(['sh', '-c', 'exit 1']), false)
  await assert.rejects(passes(['/no/such/command']))
})

test('a run past its time is stopped with every process it started, so none is left running', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'mutate-test-'))
  const pid = join(tmp, 'pid')

  try {
    assert.equal(await passes(['sh', '-c', `sleep 30 & echo $! >${pid}; wait`], 500), false)
    const left = Number(readFileSync(pid, 'utf8'))

    assert.ok(existsSync(pid))
    assert.throws(() => process.kill(left, 0), /ESRCH/)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})
