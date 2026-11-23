// What applies one mutant to a copy of a mod and runs the tests it must fail: the only code beyond the mod that a
// mutant's result depends on, so scripts/mutate.mjs counts this file, and not itself, in every mod's fingerprint. How
// long a run may take is not here: it is the caller's, which re-runs only the mutants a change of it can flip.
import { spawn } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { clearTimeout, setTimeout } from 'node:timers'

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
 * The command that runs the tests a mutant of `file` must fail, in the copy of the mod at `folder`: the `test.sh` in
 * the file's folder, as the pet's Swift has to compile its own; else the mod's plugin tests.
 */
export const testOf = (folder, file) => {
  const script = join(folder, dirname(file), 'test.sh')

  return existsSync(script) ? ['sh', script] : ['claude', 'plugin', 'test', folder]
}

/**
 * The command a run goes behind so it yields to whatever the person is doing. On macOS, `taskpolicy -b` runs it in
 * the background: on the efficiency cores, with low disk priority, where `nice` alone still takes the cores the person
 * works on. Elsewhere, `nice`.
 */
export const yielding = platform => (platform === 'darwin' ? ['taskpolicy', '-b'] : ['nice', '-n', '10'])

/**
 * How the command ends within `ms`: `passed`, `failed`, or `timed out`, stopped with every process it started, as a
 * test binary a shell left looping. One that cannot start at all is a failure of the gate, not a killed mutant.
 */
export const verdictOf = ([command = 'true', ...args], ms) =>
  new Promise((resolve, reject) => {
    let isLate = false
    // a group of its own, so stopping it reaches what it started
    const run = spawn(command, args, { detached: true, stdio: 'ignore' })
    const timer = setTimeout(() => {
      isLate = true

      try {
        process.kill(-run.pid, 'SIGKILL')
      } catch {
        // the group ended as its time ran out: nothing is left to stop
      }
    }, ms)

    run.on('error', failure => {
      clearTimeout(timer)
      reject(failure)
    })
    run.on('exit', code => {
      clearTimeout(timer)
      resolve(isLate ? 'timed out' : code === 0 ? 'passed' : 'failed')
    })
  })

/**
 * The verdict of the mod's tests, in its copy at `copy`, on `mutant`'s file written as `broken`; the file is put back
 * to `source` after, whatever the verdict.
 */
export const trial = async (copy, mutant, broken, source, ms) => {
  const path = join(copy, mutant.file)

  writeFileSync(path, broken)

  try {
    return await verdictOf([...yielding(process.platform), ...testOf(copy, mutant.file)], ms)
  } finally {
    writeFileSync(path, source)
  }
}
