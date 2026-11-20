// Mutation tests for the mods: `node scripts/mutate.mjs [--all] [<mod>...]`, every mod that lists mutants when none is
// named. Each mutant in `<mod>/tests/mutants.json` breaks one behaviour of the mod, `{ "file", "from", "to", "why" }`:
// in a copy of the mod, `from` is replaced by `to` in that file and the mod's tests run; they must fail. A mutant they
// let through means a behaviour no test holds. A mutant whose `from` is gone, or found more than once, fails too, so
// the list cannot rot as the code changes.
// A mod whose mutants were all killed on the same files is not run again: RECORD keeps, per mod, the fingerprint of
// what its run read. `--all` runs them all whatever the record says.
import { Buffer } from 'node:buffer'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { availableParallelism, tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

/** Each mod's last run that killed every mutant, `{ [mod]: { fingerprint, killed } }`; git ignores it. */
const RECORD = '.mutate.json'

// What every mod's mutants depend on beyond the mod: the tools, their versions and this script. A change to any of
// them runs every mod's mutants again.
const SHARED = ['package.json', 'pnpm-lock.yaml', '.node-version', 'scripts/mutate.mjs']

/** The files a run of the mod's mutants reads, as paths from the repo's root: the mod's own, but the engine's types. */
export const inputsOf = mod => [
  ...readdirSync(mod, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name !== '.DS_Store')
    .map(entry => relative('.', join(entry.parentPath, entry.name)))
    .filter(path => !path.startsWith(join(mod, '.claude-plugin', 'types'))),
  ...SHARED,
]

/** A hash of `[path, content]` pairs, in any order: the same files give the same fingerprint. */
export const fingerprint = files => {
  const hash = createHash('sha256')

  for (const [path, content] of [...files].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    const bytes = Buffer.from(content)

    hash.update(`${path}\0${bytes.length}\0`).update(bytes)
  }

  return hash.digest('hex')
}

/** Whether the mod's mutants must run: all are asked for, or no run killed them all on files of this fingerprint. */
export const mustRun = (record, mod, print, all) => all || record[mod]?.fingerprint !== print

/** The mutants a mod lists, checked to be whole; throws, naming the mod, on a malformed list. */
export const mutantsOf = (mod, json) => {
  const list = JSON.parse(json)
  const fields = ['file', 'from', 'to', 'why']

  if (!Array.isArray(list) || list.some(m => fields.some(field => typeof m?.[field] !== 'string'))) {
    throw new Error(`${mod}/tests/mutants.json: a list of { ${fields.join(', ')} }, each a string`)
  }

  return list
}

/** `source` with the mutant's `from` replaced by its `to`; throws unless `from` is found exactly once. */
export const mutated = (source, mutant) => {
  const at = source.indexOf(mutant.from)

  if (at === -1 || source.indexOf(mutant.from, at + 1) !== -1) {
    throw new Error(
      `${mutant.file}: «${mutant.from}» is ${at === -1 ? 'gone' : 'found more than once'}; update the mutant «${mutant.why}»`,
    )
  }

  return source.slice(0, at) + mutant.to + source.slice(at + mutant.from.length)
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

// How long the tests may run on one mutant, some twenty times the slowest
// mod's run: one that never ends them, as an endless loop, is caught by this,
// not by waiting forever.
const RUN_MS = 60_000

/**
 * The command a run goes behind so it yields to whatever the person is doing. On macOS, `taskpolicy -b` runs it in
 * the background: on the efficiency cores, with low disk priority, where `nice` alone still takes the cores the person
 * works on. Elsewhere, `nice`.
 */
export const yielding = platform => (platform === 'darwin' ? ['taskpolicy', '-b'] : ['nice', '-n', '10'])

// Whether the mod's tests pass in `folder`. A run that cannot start at all is
// a failure of the gate, not a killed mutant.
const passes = folder =>
  new Promise((resolve, reject) => {
    const [command = 'nice', ...args] = yielding(process.platform)

    execFile(command, [...args, 'claude', 'plugin', 'test', folder], { timeout: RUN_MS }, failure => {
      if (failure === null) {
        resolve(true)
      } else if (typeof failure.code === 'number' || failure.killed) {
        resolve(false)
      } else {
        reject(failure)
      }
    })
  })

const main = async mod => {
  const mutants = mutantsOf(mod, readFileSync(join(mod, 'tests', 'mutants.json'), 'utf8'))
  const tmp = mkdtempSync(join(tmpdir(), 'mutate-'))
  const survived = new Set()

  try {
    // Every mutant is checked to apply before any runs: a stale one is reported at once.
    const sources = mutants.map(mutant => readFileSync(join(mod, mutant.file), 'utf8'))
    const broken = mutants.map((mutant, n) => mutated(sources[n], mutant))

    // One copy of the mod per worker, each taking the next mutant left: the
    // mutants run side by side, as many at once as jobsOf says.
    let next = 0
    const work = async copy => {
      cpSync(mod, copy, { recursive: true })

      for (let n = next++; n < mutants.length; n = next++) {
        const mutant = mutants[n]

        writeFileSync(join(copy, mutant.file), broken[n])

        if (await passes(copy)) {
          survived.add(mutant)
        }

        writeFileSync(join(copy, mutant.file), sources[n])
      }
    }
    const workers = Math.min(jobsOf(process.env.MUTATE_JOBS, availableParallelism()), mutants.length)

    await Promise.all(Array.from({ length: workers }, (_, n) => work(join(tmp, String(n), mod))))
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }

  for (const mutant of mutants.filter(one => survived.has(one))) {
    process.stderr.write(`mutate: ${mod}: survived, no test holds «${mutant.why}» (${mutant.file})\n`)
  }

  process.stdout.write(`mutate: ${mod}: ${mutants.length - survived.size} of ${mutants.length} mutants killed\n`)

  return survived.size === 0
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const all = process.argv[2] === '--all'
    const named = process.argv.slice(all ? 3 : 2)
    const mods =
      named.length > 0 ? named : readdirSync('.').filter(name => existsSync(join(name, 'tests', 'mutants.json')))
    const record = recorded()
    let isKilled = true

    for (const mod of mods) {
      const print = fingerprint(inputsOf(mod).map(path => [path, readFileSync(path)]))

      if (!mustRun(record, mod, print, all)) {
        process.stdout.write(`mutate: ${mod}: unchanged since a run that killed its ${record[mod].killed} mutants\n`)
        continue
      }

      if (await main(mod)) {
        record[mod] = {
          fingerprint: print,
          killed: mutantsOf(mod, readFileSync(join(mod, 'tests', 'mutants.json'), 'utf8')).length,
        }
        writeFileSync(RECORD, `${JSON.stringify(record, null, 2)}\n`)
      } else {
        isKilled = false
      }
    }

    process.exitCode = isKilled ? 0 : 1
  } catch (failure) {
    process.stderr.write(`mutate: ${failure instanceof Error ? failure.message : String(failure)}\n`)
    process.exitCode = 1
  }
}
