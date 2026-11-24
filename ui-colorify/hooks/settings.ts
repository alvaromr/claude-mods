import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { Kind, Look, Preferences } from '../types'
import { reasonOf } from './failure'
import { DEFAULTS, differs, loaded, projectKeyOf, provenanceOf, savedAs, withLook } from './preferences'
import { TEXT } from './text'

const settings = atom({ plugin: 'ui-colorify', key: 'settings' } as const, DEFAULTS)
const origin = atom({ plugin: 'ui-colorify', key: 'origin' } as const, {
  source: 'defaults',
  isChanged: false,
  hasProject: false,
})

// The functions below take `$` from the hooks of another file: the validator
// follows `$` past an import only into a function declaration.

// The session's settings, an older version's filled in with what it lacks.
async function current($: EngineInterface) {
  return loaded(await read($, settings))
}

/** A call that failed gives `fallback`, the mod showing less, and its cause goes to the debug log. */
export function orElse<T>($: EngineInterface, doing: string, fallback: T) {
  return (failure: unknown): T => {
    $.ui.log(`${doing} failed: ${reasonOf(failure)}`, { to: 'debug' })

    return fallback
  }
}

// The store's key for the session's project, by its root folder; none where
// the session tells no root.
async function projectKey($: EngineInterface) {
  return projectKeyOf(await $.session.root().catch(orElse($, 'reading the project root', null)))
}

// The settings a session starts with: its project's, else the global ones,
// else the defaults.
async function loadSettings($: EngineInterface) {
  const key = await projectKey($)
  const project = key === undefined ? undefined : await $.store.get(key)
  const global = await $.store.get('settings')

  await update($, settings, () => loaded(project ?? global))
  await update($, origin, () => provenanceOf(project, global))
}

// Unsaved while the session's settings differ from what they came from.
async function isUnsaved($: EngineInterface, now: Preferences) {
  const { source } = await read($, origin)
  const key = source === 'project' ? await projectKey($) : 'settings'
  const saved = source === 'defaults' || key === undefined ? DEFAULTS : loaded(await $.store.get(key))

  return differs(now, saved)
}

async function changed($: EngineInterface, next: Preferences) {
  const unsaved = await isUnsaved($, next)
  await update($, settings, () => next)
  await update($, origin, now => ({ ...now, isChanged: unsaved }))
}

/** A change holds for this session alone, until it is saved; a group (`headings`, `prompts`) is replaced whole. */
export async function change($: EngineInterface, patch: Partial<Omit<Preferences, 'looks'>>) {
  await changed($, { ...(await current($)), ...patch })
}

export async function changeLook($: EngineInterface, kind: Kind, patch: Partial<Look>) {
  await changed($, withLook(await current($), kind, patch))
}

export async function reset($: EngineInterface) {
  await changed($, DEFAULTS)
}

export async function save($: EngineInterface, where: 'project' | 'global') {
  const key = where === 'project' ? await projectKey($) : 'settings'

  if (key === undefined) {
    $.ui.toast(TEXT.noProject)

    return
  }

  await $.store.set(key, await current($))
  await update($, origin, now => savedAs(now, where))
}

// The project's saved settings dropped: the session takes the global ones,
// else the defaults.
export async function forgetProject($: EngineInterface) {
  const key = await projectKey($)

  if (key !== undefined) {
    await $.store.delete(key)
  }

  await loadSettings($)
}

let hasStarted = false

/**
 * Run by session.start, and by the first hook that needs the settings where a
 * resumed session drew before session.start reached this mod. A reload runs it
 * again with the session's state kept: unsaved changes stay, rather than the
 * saved settings taking their place.
 */
export async function start($: EngineInterface) {
  hasStarted = true

  if ((await read($, origin)).isChanged) {
    return
  }

  await loadSettings($)
}

/** The settings, read once loaded: a hook that may write state loads them first. */
export async function ready($: EngineInterface) {
  if (!hasStarted) {
    await start($)
  }

  return current($)
}

/** Where the session's settings came from: the validator reads an atom only in the file that makes it. */
export async function provenance($: EngineInterface) {
  return read($, origin)
}

/** The settings as a drawing has them: drawing writes no state, so before the start they are the defaults. */
export async function shown($: EngineInterface) {
  return current($)
}
