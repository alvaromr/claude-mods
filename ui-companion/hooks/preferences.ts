import type { Mode, Preferences, Provenance, Setup } from '../types'
import { asEffort, MODES, SETUPS, WHENS } from './modes'

export const DEFAULTS: Preferences = { isOn: true, startsOpen: false, setups: SETUPS, prompts: {} }

const asMode = (value: unknown) => MODES.find(known => known === value)

/**
 * Saved settings over the defaults, what they lack or hold of another kind
 * taking its default, in one order whatever the save's. One saved before each
 * mode had its own (`mode`, one model and effort for all, `hasAlerts`) is read
 * as it meant: the mode it showed on alone, its alerts while minimized unless
 * turned off, every mode on the model and effort it had.
 */
export const loaded = (saved: unknown): Preferences => {
  const {
    isOn: on,
    startsOpen: opens,
    mode: shownMode,
    model: keptModel,
    effort: keptEffort,
    setups: keptSetups,
    hasAlerts: keptHasAlerts,
    prompts: written,
  } = (typeof saved === 'object' && saved !== null ? saved : {}) as Record<string, unknown>
  const isOld = keptSetups === undefined && shownMode !== undefined
  const setup = (each: Mode): Setup => {
    const own = (((keptSetups ?? {}) as Record<string, unknown>)[each] ?? {}) as Record<string, unknown>
    const named = own.model ?? keptModel

    return {
      isOn: isOld
        ? each === (asMode(shownMode) ?? 'vigilante')
        : typeof own.isOn === 'boolean'
          ? own.isOn
          : SETUPS[each].isOn,
      alert: isOld
        ? keptHasAlerts === false
          ? 'never'
          : 'minimized'
        : (WHENS.find(known => known.value === own.alert)?.value ?? SETUPS[each].alert),
      model: typeof named === 'string' ? named : SETUPS[each].model,
      effort: asEffort(own.effort ?? keptEffort) ?? SETUPS[each].effort,
    }
  }
  const texts = (typeof written === 'object' && written !== null ? written : {}) as Record<string, unknown>

  return {
    isOn: on !== false,
    startsOpen: opens === true,
    setups: Object.fromEntries(MODES.map(each => [each, setup(each)])) as Record<Mode, Setup>,
    prompts: Object.fromEntries(MODES.flatMap(each => (typeof texts[each] === 'string' ? [[each, texts[each]]] : []))),
  }
}

/** The store's key for a project's settings, by its root folder; none where the session tells no root. */
export const projectKeyOf = (root: string | null) => (root === null ? undefined : `settings:${root}`)

/** Whether settings kept before the global ones (a choice, prompts) are to be taken up as those: only while there are none. */
export const isMigrating = (global: unknown, choice: unknown, written: unknown) =>
  global === undefined && (choice !== undefined || written !== undefined)

/** The settings the choice and the prompts kept before settings were saved this way come to. */
export const migrated = (choice: unknown, written: unknown) =>
  loaded({ ...(typeof choice === 'object' && choice !== null ? choice : {}), prompts: written })

/** Whether the session's settings differ from the saved ones they came from. */
export const isUnsaved = (session: Preferences, saved: Preferences) =>
  JSON.stringify(loaded(session)) !== JSON.stringify(saved)

/** The mode the pane shows at the start: the one it showed, unless that is off, then the first one on. */
export const startMode = (shown: Mode, setups: Record<Mode, Setup>) =>
  setups[shown].isOn ? shown : (MODES.find(each => setups[each].isOn) ?? shown)

/** Where the settings a session starts with came from: the project's saved ones, else the global ones, else the defaults. */
export const originOf = (project: unknown, global: unknown): Provenance => ({
  source: project !== undefined ? 'project' : global !== undefined ? 'global' : 'defaults',
  isChanged: false,
  hasProject: project !== undefined,
})

/** The provenance once the session's settings are saved `where`. */
export const savedTo = (was: Provenance, where: 'project' | 'global'): Provenance => ({
  source: where,
  isChanged: false,
  hasProject: was.hasProject || where === 'project',
})
