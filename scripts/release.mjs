// Releases one mod: `pnpm release <mod> <version>`. Moves the mod's entries in CHANGELOG.md from Unreleased to a
// section of their own, sets the version in its plugin.json and the marketplace's tag for it, installs the release
// as a user would and checks it loads, then commits (the pre-commit hook runs the gate) and tags it with
// `claude plugin tag`. An entry that names other mods too is left for a person to split first, since a release
// section says only what that release holds.
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const UNRELEASED = '## [Unreleased]'
const MARKETPLACE = '.claude-plugin/marketplace.json'
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

/** The marketplace's text with `mod` installed from `tag`, its release's, and nothing else changed. */
export const pin = (marketplace, mod, tag) => {
  const ref = new RegExp(`"ref": "${mod}--v[^"]*"`)

  if (!ref.test(marketplace)) {
    throw new Error(`${MARKETPLACE} installs ${mod} from no tag of its own`)
  }

  return marketplace.replace(ref, `"ref": "${tag}"`)
}

/** The marketplace's text with every mod taken from the repository at `url`: a clone, for the release's smoke. */
export const sourcedFrom = (marketplace, url) => marketplace.replaceAll(/"url": "[^"]*"/g, `"url": "${url}"`)

/**
 * Installs the release of `mod` as a user would, in a home of its own, from a clone of what git tracks with the
 * release's `changes`, committed and tagged by `claude plugin tag` as the release will be, and the marketplace
 * pointed at that clone instead of GitHub. Throws unless the installed copy is at `version`, holds every file of the
 * mod (an install from a tag drops a link that leads out of the mod's folder) and loads in Claude Code.
 */
const smoke = (mod, version, changes) => {
  const scratch = mkdtempSync(join(tmpdir(), 'release-'))
  const [clone, home, log] = [join(scratch, 'clone'), join(scratch, 'home'), join(scratch, 'log')]
  const inClone = { cwd: clone }
  // None of the owner's settings, plugins or login take part: with no login the session stops before asking any
  // model, which costs nothing.
  const user = { cwd: scratch, env: { PATH: String(process.env.PATH), HOME: home } }
  const { name: marketplace } = JSON.parse(changes[MARKETPLACE])
  // A step's output, or a failure that carries all it printed, since the CLI says why it failed on either stream.
  const run = (command, args, options) => {
    const result = spawnSync(command, args, { ...options, encoding: 'utf8' })

    if (result.status !== 0) {
      throw new Error(
        `${[command, ...args].join(' ')} failed:\n${result.error?.message ?? ''}${result.stdout}${result.stderr}`,
      )
    }

    return result.stdout
  }

  try {
    mkdirSync(clone)
    mkdirSync(home)
    run('git', ['archive', '--output', join(scratch, 'head.tar'), 'HEAD'])
    run('tar', ['-xf', join(scratch, 'head.tar'), '-C', clone])

    for (const [file, text] of Object.entries(changes)) {
      writeFileSync(join(clone, file), text)
    }

    run('git', ['init', '--quiet'], inClone)
    run('git', ['add', '--all'], inClone)
    run('git', ['commit', '--quiet', '--message', `Release ${mod} ${version}`], inClone)
    run('claude', ['plugin', 'tag', mod], inClone)
    const files = run('git', ['ls-files', '-z', '--', mod], inClone)
      .split('\0')
      .filter(file => file !== '')
    writeFileSync(join(clone, MARKETPLACE), sourcedFrom(changes[MARKETPLACE], `file://${clone}`))

    run('claude', ['plugin', 'install', mod, '--marketplace', clone], user)
    const installed = JSON.parse(run('claude', ['plugin', 'list', '--json'], user)).find(
      plugin => plugin.id === `${mod}@${marketplace}`,
    )

    if (installed?.version !== version) {
      throw new Error(`the installed ${mod} is not at ${version}`)
    }

    const dropped = files.filter(
      file =>
        lstatSync(join(installed.installPath, file.slice(mod.length + 1)), { throwIfNoEntry: false }) === undefined,
    )

    if (dropped.length > 0) {
      throw new Error(`the installed ${mod} lacks ${dropped.join(', ')}: make each a file of the mod's own`)
    }

    // The session ends asking for a login; its exit code says nothing of the mod.
    spawnSync('claude', ['-p', '--no-session-persistence', '--debug-file', log, 'Reply with: ok'], user)

    if (!existsSync(log) || !readFileSync(log, 'utf8').includes(`hooks module ${mod}@${marketplace} loaded`)) {
      throw new Error(`the installed ${mod} did not load in Claude Code`)
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
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
  const tag = `${mod}--v${version}`
  // Every change is worked out, and the release installed, before any is written, so a release that stops leaves
  // the tree as it was.
  const changes = {
    'CHANGELOG.md': release(readFileSync('CHANGELOG.md', 'utf8'), mod, version, date),
    [manifest]: plugin.replace(`"version": "${current}"`, `"version": "${version}"`),
    [MARKETPLACE]: pin(readFileSync(MARKETPLACE, 'utf8'), mod, tag),
  }

  process.stdout.write(`release: installing ${mod} from a clone tagged ${tag}, in a home of its own\n`)
  smoke(mod, version, changes)
  process.stdout.write(`release: the installed ${mod} ${version} holds every file of the mod and loads\n`)

  for (const [file, text] of Object.entries(changes)) {
    writeFileSync(file, text)
  }

  git('add', ...Object.keys(changes))
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
