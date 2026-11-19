// Releases one mod: `pnpm release <mod> <version>`. Moves the mod's entries in CHANGELOG.md from Unreleased to a
// section of their own, sets the version in its plugin.json, commits (the pre-commit hook runs the gate) and tags
// it with `claude plugin tag`. An entry that names other mods too is left for a person to split first, since a
// release section says only what that release holds.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const UNRELEASED = '## [Unreleased]'
// Versions stay below 1.0.0 while the engine's hooks API is early access (docs/decisions/versioning.md).
const VERSION = /^0\.(\d+)\.(\d+)$/

/** The mods an entry is about: the ones it names before its first colon, «- `a` and `b`: …». */
export const modsOf = entry => {
  const head = /^- ((?:`[\w-]+`(?: \d+\.\d+\.\d+)?(?:, | and |, and )?)+):/.exec(entry)?.[1] ?? ''

  return [...head.matchAll(/`([\w-]+)`/g)].map(match => match[1])
}

/** Whether `next` is a later version than `current`; throws unless both are `0.y.z`. */
export const isLater = (current, next) => {
  const parts = version => {
    const [, minor, patch] = VERSION.exec(version) ?? []

    if (minor === undefined) {
      throw new Error(`${version} is not a 0.y.z version: versions stay below 1.0.0 (docs/decisions/versioning.md)`)
    }

    return [Number(minor), Number(patch)]
  }
  const [minor, patch] = parts(current)
  const [nextMinor, nextPatch] = parts(next)

  return nextMinor > minor || (nextMinor === minor && nextPatch > patch)
}

/**
 * The changelog with the mod's Unreleased entries moved to `## [<mod> <version>] - <date>`, placed above the
 * releases before it; throws when an entry is shared with other mods or the mod has none.
 */
export const release = (changelog, mod, version, date) => {
  const lines = changelog.split('\n')
  const start = lines.indexOf(UNRELEASED)
  const after = lines.findIndex((line, at) => at > start && line.startsWith('## '))
  const end = after === -1 ? lines.length : after

  if (start === -1) {
    throw new Error(`CHANGELOG.md has no "${UNRELEASED}" section`)
  }

  // Each `### Kind` with its entries, an entry being its bullet line and the lines that continue it.
  const kinds = []

  for (const line of lines.slice(start + 1, end)) {
    if (line.startsWith('### ')) {
      kinds.push({ heading: line, entries: [] })
    } else if (line.startsWith('- ') && kinds.length > 0) {
      kinds.at(-1).entries.push([line])
    } else if (line.startsWith('  ') && kinds.at(-1)?.entries.length > 0) {
      kinds.at(-1).entries.at(-1).push(line)
    } else if (line.trim() !== '') {
      throw new Error(`CHANGELOG.md's Unreleased section has a line outside a kind's entries: ${line}`)
    }
  }

  const textOf = entry => entry.map(line => line.trim()).join(' ')
  const shared = kinds
    .flatMap(kind => kind.entries.map(textOf))
    .filter(text => {
      const mods = modsOf(text)

      return mods.length === 0 ? text.includes(`\`${mod}\``) : mods.includes(mod) && mods.length > 1
    })

  if (shared.length > 0) {
    throw new Error(
      `split these entries by hand so each names ${mod} alone or not at all:\n${shared.map(text => `  ${text.slice(0, 100)}…`).join('\n')}`,
    )
  }

  const isOwn = entry => {
    const mods = modsOf(textOf(entry))

    return mods.length === 1 && mods[0] === mod
  }
  const section = kinds.map(kind => ({ heading: kind.heading, entries: kind.entries.filter(isOwn) }))
  const rest = kinds.map(kind => ({ heading: kind.heading, entries: kind.entries.filter(entry => !isOwn(entry)) }))

  if (section.every(kind => kind.entries.length === 0)) {
    throw new Error(`CHANGELOG.md's Unreleased section has no entry for ${mod}`)
  }

  const written = some =>
    some.filter(kind => kind.entries.length > 0).flatMap(kind => [kind.heading, '', ...kind.entries.flat(), ''])

  return [
    ...lines.slice(0, start),
    UNRELEASED,
    '',
    ...written(rest),
    `## [${mod} ${version}] - ${date}`,
    '',
    ...written(section),
    ...lines.slice(end),
  ].join('\n')
}

const main = (mod, version) => {
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8' })
  const manifest = `${mod}/.claude-plugin/plugin.json`

  if (mod === undefined || version === undefined) {
    throw new Error('usage: pnpm release <mod> <version>')
  }

  if (git('status', '--porcelain') !== '') {
    throw new Error('the working tree has changes: commit or stash them first')
  }

  const plugin = readFileSync(manifest, 'utf8')
  const current = JSON.parse(plugin).version

  // a mod never tagged is released first at the version its plugin.json already has
  const isFirst = git('tag', '--list', `${mod}--v*`) === '' && version === current

  if (!isFirst && !isLater(current, version)) {
    throw new Error(`${mod} is at ${current}, and ${version} is not later`)
  }

  const date = new Date().toISOString().slice(0, 10)

  writeFileSync('CHANGELOG.md', release(readFileSync('CHANGELOG.md', 'utf8'), mod, version, date))
  writeFileSync(manifest, plugin.replace(`"version": "${current}"`, `"version": "${version}"`))
  git('add', 'CHANGELOG.md', manifest)
  execFileSync('git', ['commit', '-m', `Release ${mod} ${version}`], { stdio: 'inherit' })
  execFileSync('claude', ['plugin', 'tag', mod], { stdio: 'inherit' })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv[2], process.argv[3])
  } catch (failure) {
    process.stderr.write(`release: ${failure instanceof Error ? failure.message : String(failure)}\n`)
    process.exitCode = 1
  }
}
