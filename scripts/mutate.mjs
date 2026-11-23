// Mutation tests for the mods: `node scripts/mutate.mjs [--all] [<mod>...]`, every mod that lists mutants when none is
// named. Each mutant in `<mod>/tests/mutants.json` breaks one behaviour of the mod, `{ "file", "from", "to", "why" }`:
// in a copy of the mod, `from` is replaced by `to` in that file and the mod's tests run (the `test.sh` next to the
// file, when there is one, as for the pet's Swift); they must fail (scripts/mutant.mjs). A mutant they let through
// means a behaviour no test holds. A mutant whose `from` is gone, or found more than once, fails too, so the list
// cannot rot as the code changes.
// A mod whose mutants were all killed on the same files is not run again: RECORD keeps, per mod, the fingerprint of
// what its run read, the timeout it ran under and which mutants ran out of it, so a new timeout re-runs only the
// mutants it can flip. `--all` runs them all whatever the record says. `--verified <commit> <mod>...` records a run
// that killed every mutant of those mods on that commit, once it checks their files are as they were there.
import { Buffer } from 'node:buffer'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { availableParallelism, tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { mutated, testOf, trial } from './mutant.mjs'

/** Each mod's last run that killed every mutant, `{ [mod]: { fingerprint, killed, timeout, timedOut } }`; git ignores it. */
const RECORD = '.mutate.json'

// What every mod's mutants depend on beyond the mod: the code that applies a mutant and runs its tests, whose change
// runs them all again. Not this script, whose record keeping, options and timeout change no mutant's result, nor the
// tools pnpm installs: the mods import only the engine, and `claude plugin test` runs them on its own.
const SHARED = ['scripts/mutant.mjs']

/**
 * Whether a run of the mod's mutants reads its file at this path: not the engine's types nor those of the mod's state,
 * which no test runs, nor its icon, nor its shell tests, which the gate runs on their own.
 */
const isInput = (mod, path) =>
  !path.endsWith('.DS_Store') &&
  !path.startsWith(join(mod, '.claude-plugin', 'types')) &&
  path !== join(mod, '.claude-plugin', 'icon.png') &&
  path !== join(mod, 'types', 'index.d.ts') &&
  !(dirname(path) === join(mod, 'tests') && path.endsWith('.test.sh'))

/** The files a run of the mod's mutants reads, as paths from the repo's root. */
export const inputsOf = mod => [
  ...readdirSync(mod, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => relative('.', join(entry.parentPath, entry.name)))
    .filter(path => isInput(mod, path)),
  ...SHARED,
]

/** What of a file the mutants depend on: all of it, but the version of a manifest, which only a release sets. */
export const contentOf = (path, content) =>
  path.endsWith(join('.claude-plugin', 'plugin.json'))
    ? JSON.stringify({ ...JSON.parse(String(content)), version: undefined })
    : content

/** A hash of `[path, content]` pairs, in any order: the same files give the same fingerprint. */
export const fingerprint = files => {
  const hash = createHash('sha256')

  for (const [path, content] of [...files].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    const bytes = Buffer.from(content)

    hash.update(`${path}\0${bytes.length}\0`).update(bytes)
  }

  return hash.digest('hex')
}

/** The fingerprint of the mod's own files, `[path, content]`, as a run of its mutants reads them. */
const ownPrint = (mod, files) =>
  fingerprint(
    files
      .filter(([path]) => isInput(mod, path) && !SHARED.includes(path))
      .map(([path, c]) => [path, contentOf(path, c)]),
  )

/** Whether the mod's own files now, `[path, content]`, are as they were then, as a run of its mutants reads them. */
export const isUnchanged = (mod, now, then) => ownPrint(mod, now) === ownPrint(mod, then)

/**
 * Which of a mod's `count` mutants must run, by their place in its list, after the run `ran` recorded: all of them
 * when all are asked for, or no run killed them all on files of this fingerprint under a known timeout. On the same
 * files only a longer timeout flips any: it may let a mutant that ran out of time end, and pass. A shorter one can
 * only stop sooner what was killed, as a clean run left no survivor.
 */
export const pending = (ran, print, timeout, count, all = false) => {
  const every = Array.from({ length: count }, (_, n) => n)

  if (all || ran?.fingerprint !== print || typeof ran.timeout !== 'number') {
    return every
  }

  if (timeout <= ran.timeout) {
    return []
  }

  return Array.isArray(ran.timedOut) ? ran.timedOut : every
}

/** The mutants a mod lists, checked to be whole; throws, naming the mod, on a malformed list. */
export const mutantsOf = (mod, json) => {
  const list = JSON.parse(json)
  const fields = ['file', 'from', 'to', 'why']

  if (!Array.isArray(list) || list.some(m => fields.some(field => typeof m?.[field] !== 'string'))) {
    throw new Error(`${mod}/tests/mutants.json: a list of { ${fields.join(', ')} }, each a string`)
  }

  return list
}

/**
 * How many mutants run at once. Each run is a whole Claude Code, some 300 MB and more than a core, so a quarter of the
 * cores by default leaves the machine usable; `MUTATE_JOBS` sets another number, a whole one from 1.
 */
export const jobsOf = (setting, cores) => {
  if (setting === undefined || setting === '') {
    return Math.max(1, Math.floor(cores / 4))
  }

  if (!/^[1-9]\d*$/.test(setting)) {
    throw new Error(`MUTATE_JOBS is ${setting}: a whole number from 1`)
  }

  return Number(setting)
}

// How many mutants a test.sh runs may run at once, whatever the jobs: each
// compiles a whole app, the heaviest work here.
const NATIVE_JOBS = 2

/**
 * How many copies of the mod run its mutants side by side: the jobs, at most one per mutant, and NATIVE_JOBS when
 * any is native.
 */
export const workersOf = (jobs, mutants, isNative) =>
  Math.min(jobs, mutants.length, mutants.some(isNative) ? NATIVE_JOBS : Infinity)

// How long the tests may run on one mutant: some twenty times the slowest
// mod's plugin tests, four times the pet's native ones in the background. One
// that never ends them, as an endless loop, is caught by this, not by waiting
// forever. A change of it re-runs only the mutants it can flip (pending).
const RUN_MS = 60_000

// Runs the mutants of `mod` at the places `picks` in its list; the places of those that ran out of time, or none
// when any survived.
const main = async (mod, picks) => {
  const mutants = mutantsOf(mod, readFileSync(join(mod, 'tests', 'mutants.json'), 'utf8'))
  const tmp = mkdtempSync(join(tmpdir(), 'mutate-'))
  const survived = new Set()
  const timedOut = []

  try {
    // Every mutant is checked to apply before any runs: a stale one is reported at once.
    const sources = mutants.map(mutant => readFileSync(join(mod, mutant.file), 'utf8'))
    const broken = mutants.map((mutant, n) => mutated(sources[n], mutant))

    // One copy of the mod per worker, each taking the next mutant left: the
    // mutants run side by side, as many at once as jobsOf says.
    let next = 0
    const work = async copy => {
      cpSync(mod, copy, { recursive: true })

      for (let at = next++; at < picks.length; at = next++) {
        const n = picks[at]
        const verdict = await trial(copy, mutants[n], broken[n], sources[n], RUN_MS)

        if (verdict === 'passed') {
          survived.add(n)
        } else if (verdict === 'timed out') {
          timedOut.push(n)
        }
      }
    }
    const workers = workersOf(
      jobsOf(process.env.MUTATE_JOBS, availableParallelism()),
      picks.map(n => mutants[n]),
      mutant => testOf(mod, mutant.file)[0] === 'sh',
    )

    await Promise.all(Array.from({ length: workers }, (_, n) => work(join(tmp, String(n), mod))))
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }

  for (const n of [...survived].sort((a, b) => a - b)) {
    process.stderr.write(`mutate: ${mod}: survived, no test holds «${mutants[n].why}» (${mutants[n].file})\n`)
  }

  process.stdout.write(`mutate: ${mod}: ${picks.length - survived.size} of ${picks.length} mutants killed\n`)

  return survived.size === 0 ? timedOut.sort((a, b) => a - b) : null
}

// The record, empty when there is none yet; one that cannot be read is said, and every mod runs.
const recorded = () => {
  if (!existsSync(RECORD)) {
    return {}
  }

  try {
    const record = JSON.parse(readFileSync(RECORD, 'utf8'))

    if (typeof record === 'object' && record !== null && !Array.isArray(record)) {
      return record
    }
  } catch {
    // said below, as for a record of another shape
  }

  process.stderr.write(`mutate: ${RECORD} cannot be read, so every mod's mutants run again\n`)

  return {}
}

// The mod's files at a commit, `[path, content]`, as git keeps them.
const filesAt = (commit, mod) =>
  execFileSync('git', ['ls-tree', '-r', '-z', '--name-only', commit, '--', mod], { encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)
    .map(path => [path, execFileSync('git', ['show', `${commit}:${path}`])])

// `--verified <commit> <mod>...` records, for each mod named, a run that killed every mutant on that commit, under
// this script's timeout, as of the files the mutants now read; it refuses a mod whose own files have changed since,
// but the version. It cannot say which mutants ran out of time, so a longer timeout re-runs all of them.
const verify = ([commit, ...mods], record) => {
  const sha = execFileSync('git', ['rev-parse', '--verify', `${commit}^{commit}`], { encoding: 'utf8' }).trim()
  let isRecorded = true

  for (const mod of mods) {
    const now = inputsOf(mod).map(path => [path, readFileSync(path)])

    if (!isUnchanged(mod, now, filesAt(sha, mod))) {
      process.stderr.write(`mutate: ${mod}: its files changed since ${sha}, so its mutants must run\n`)
      isRecorded = false
      continue
    }

    const killed = mutantsOf(mod, readFileSync(join(mod, 'tests', 'mutants.json'), 'utf8')).length
    record[mod] = {
      fingerprint: fingerprint(now.map(([path, c]) => [path, contentOf(path, c)])),
      killed,
      timeout: RUN_MS,
      verified: sha,
    }
    process.stdout.write(`mutate: ${mod}: recorded the run on ${sha} that killed its ${killed} mutants\n`)
  }

  writeFileSync(RECORD, `${JSON.stringify(record, null, 2)}\n`)

  return isRecorded
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv[2] === '--verified') {
      process.exitCode = verify(process.argv.slice(3), recorded()) ? 0 : 1
    } else {
      await run()
    }
  } catch (failure) {
    process.stderr.write(`mutate: ${failure instanceof Error ? failure.message : String(failure)}\n`)
    process.exitCode = 1
  }
}

// Runs the mutants of the mods asked for, or of every mod that lists some, that a change could flip since a run that
// killed them all.
async function run() {
  const all = process.argv[2] === '--all'
  const named = process.argv.slice(all ? 3 : 2)
  const mods =
    named.length > 0 ? named : readdirSync('.').filter(name => existsSync(join(name, 'tests', 'mutants.json')))
  const record = recorded()
  let isKilled = true

  for (const mod of mods) {
    const print = fingerprint(inputsOf(mod).map(path => [path, contentOf(path, readFileSync(path))]))
    const count = mutantsOf(mod, readFileSync(join(mod, 'tests', 'mutants.json'), 'utf8')).length
    const ran = record[mod]
    const picks = pending(ran, print, RUN_MS, count, all)

    if (picks.length === 0) {
      process.stdout.write(`mutate: ${mod}: unchanged since a run that killed its ${count} mutants\n`)

      // a shorter timeout flips none, and the record says the timeout they now hold under
      if (ran.timeout !== RUN_MS) {
        record[mod] = { ...ran, timeout: RUN_MS }
        writeFileSync(RECORD, `${JSON.stringify(record, null, 2)}\n`)
      }

      continue
    }

    if (picks.length < count) {
      process.stdout.write(`mutate: ${mod}: the timeout grew, so the ${picks.length} that ran out of it run again\n`)
    }

    const timedOut = await main(mod, picks)

    if (timedOut === null) {
      isKilled = false
    } else {
      record[mod] = { fingerprint: print, killed: count, timeout: RUN_MS, timedOut }
      writeFileSync(RECORD, `${JSON.stringify(record, null, 2)}\n`)
    }
  }

  process.exitCode = isKilled ? 0 : 1
}
