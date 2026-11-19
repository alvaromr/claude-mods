// Mutation tests for a mod: `node scripts/mutate.mjs <mod>`. Each mutant in `<mod>/tests/mutants.json` breaks one
// behaviour of the mod, `{ "file", "from", "to", "why" }`: in a copy of the mod, `from` is replaced by `to` in that
// file and the mod's tests run; they must fail. A mutant they let through means a behaviour no test holds. A mutant
// whose `from` is gone, or found more than once, fails too, so the list cannot rot as the code changes.
import { execFile } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { availableParallelism, tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    let isKilled = true

    for (const mod of process.argv.slice(2)) {
      isKilled = (await main(mod)) && isKilled
    }

    process.exitCode = isKilled ? 0 : 1
  } catch (failure) {
    process.stderr.write(`mutate: ${failure instanceof Error ? failure.message : String(failure)}\n`)
    process.exitCode = 1
  }
}
