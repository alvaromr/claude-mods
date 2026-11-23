import assert from 'node:assert/strict'
import { test } from 'node:test'

import { contentOf, fingerprint, inputsOf, isUnchanged, jobsOf, mutantsOf, pending, workersOf } from './mutate.mjs'

const MUTANT = { file: 'hooks/a.ts', from: 'x > 1', to: 'x > 2', why: 'the limit' }

test('mutants run on a quarter of the cores, at least one, unless MUTATE_JOBS says how many', () => {
  assert.equal(jobsOf(undefined, 15), 3)
  assert.equal(jobsOf(undefined, 16), 4)
  assert.equal(jobsOf('', 1), 1)
  assert.equal(jobsOf('3', 15), 3)

  for (const setting of ['0', '-1', '2.5', 'many']) {
    assert.throws(() => jobsOf(setting, 15), /^Error: MUTATE_JOBS is .+: a whole number from 1$/)
  }
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

test("a mod's fingerprint reads its own files and the code that runs a mutant, nothing a test does not read", () => {
  const inputs = inputsOf('guard-pnpm')

  // what applies a mutant and runs its tests, not this script's record keeping and options
  assert.ok(inputs.includes('scripts/mutant.mjs'))
  assert.ok(!inputs.includes('scripts/mutate.mjs'))

  // the mods import only the engine, so the tools pnpm installs change no mutant's result
  for (const tool of ['package.json', 'pnpm-lock.yaml', '.node-version']) {
    assert.ok(!inputs.includes(tool), tool)
  }

  assert.ok(inputs.includes('guard-pnpm/tests/mutants.json'))
  assert.ok(inputs.includes('guard-pnpm/.claude-plugin/plugin.json'))
  assert.ok(inputs.some(path => path.startsWith('guard-pnpm/hooks/')))
  assert.ok(!inputs.some(path => path.includes('/.claude-plugin/types/') || path.endsWith('.DS_Store')))
  // the icon is drawn, not run, and the types of the state are erased before any test runs
  assert.ok(!inputs.includes('guard-pnpm/.claude-plugin/icon.png'))
  assert.ok(!inputsOf('bar-path').includes('bar-path/types/index.d.ts'))
  assert.ok(!inputs.some(path => path.startsWith('bar-git/')))
  // the gate runs a mod's shell tests on their own, and no mutant runs them
  assert.ok(!inputsOf('bar-git').includes('bar-git/tests/scripts.test.sh'))
  assert.ok(inputsOf('bar-git').includes('bar-git/tests/repo.test.ts'))
})

test("a manifest's version, which only a release sets, changes no fingerprint; the rest of it does", () => {
  const manifest = fields => [
    'm/.claude-plugin/plugin.json',
    contentOf('m/.claude-plugin/plugin.json', JSON.stringify(fields)),
  ]
  const print = fingerprint([manifest({ name: 'm', version: '0.1.0', description: 'one' })])

  assert.equal(fingerprint([manifest({ name: 'm', version: '0.2.0', description: 'one' })]), print)
  assert.notEqual(fingerprint([manifest({ name: 'm', version: '0.1.0', description: 'two' })]), print)
  assert.equal(contentOf('m/hooks/a.ts', 'version: 1'), 'version: 1')
})

test("a mod's run on an earlier commit holds while its own files are as they were there, but the version", () => {
  const then = [
    ['m/hooks/a.ts', 'one'],
    ['m/.claude-plugin/plugin.json', '{"name":"m","version":"0.1.0"}'],
    ['m/.claude-plugin/icon.png', 'old'],
    ['m/tests/scripts.test.sh', 'echo old'],
    ['scripts/mutant.mjs', 'old'],
  ]
  const now = [
    ['m/hooks/a.ts', 'one'],
    ['m/.claude-plugin/plugin.json', '{"name":"m","version":"0.2.0"}'],
    ['m/.claude-plugin/icon.png', 'new'],
    ['m/tests/scripts.test.sh', 'echo new'],
    ['scripts/mutant.mjs', 'new'],
  ]

  assert.ok(isUnchanged('m', now, then))
  assert.ok(!isUnchanged('m', [['m/hooks/a.ts', 'two'], ...now.slice(1)], then))
  assert.ok(!isUnchanged('m', [...now, ['m/hooks/b.ts', 'new']], then))
  assert.ok(!isUnchanged('m', now.slice(1), then))
})

test('every mutant runs when asked for all, or when no run killed them all on these files', () => {
  const ran = { fingerprint: 'abc', killed: 3, timeout: 60_000, timedOut: [1] }

  assert.deepEqual(pending(ran, 'abc', 60_000, 3, true), [0, 1, 2])
  assert.deepEqual(pending(ran, 'abd', 60_000, 3), [0, 1, 2])
  assert.deepEqual(pending(undefined, 'abc', 60_000, 3), [0, 1, 2])
  // a run recorded before timeouts were, under an unknown one
  assert.deepEqual(pending({ fingerprint: 'abc', killed: 3 }, 'abc', 60_000, 3), [0, 1, 2])
})

test('on the same files, only the mutants a new timeout can flip run again', () => {
  const ran = { fingerprint: 'abc', killed: 3, timeout: 60_000, timedOut: [1] }

  assert.deepEqual(pending(ran, 'abc', 60_000, 3), [])
  // a longer one may let a mutant that ran out of time end, and pass
  assert.deepEqual(pending(ran, 'abc', 90_000, 3), [1])
  // a shorter one can only stop sooner what was killed, and a clean run left no survivor
  assert.deepEqual(pending(ran, 'abc', 30_000, 3), [])
  // a recorded run that does not say which ran out of time, as a verified one
  assert.deepEqual(pending({ fingerprint: 'abc', killed: 3, timeout: 60_000 }, 'abc', 90_000, 3), [0, 1, 2])
  assert.deepEqual(pending({ fingerprint: 'abc', killed: 3, timeout: 60_000 }, 'abc', 30_000, 3), [])
})

test('a list of whole mutants is read; anything else is refused, naming the mod', () => {
  assert.deepEqual(mutantsOf('m', JSON.stringify([MUTANT])), [MUTANT])

  for (const json of ['{}', '[{"file": "a"}]', '[null]', JSON.stringify([{ ...MUTANT, to: 2 }])]) {
    assert.throws(() => mutantsOf('m', json), /^Error: m\/tests\/mutants\.json: a list of/)
  }
})

test('a mod with mutants a test.sh runs, which compile, has at most two at once', () => {
  const swift = { ...MUTANT, file: 'app/Sessions.swift' }
  const native = mutant => mutant.file.endsWith('.swift')

  assert.equal(workersOf(3, [MUTANT, MUTANT, MUTANT, MUTANT], native), 3)
  assert.equal(workersOf(3, [MUTANT, swift, swift], native), 2)
  assert.equal(workersOf(1, [swift, swift], native), 1)
  assert.equal(workersOf(3, [MUTANT], native), 1)
})
