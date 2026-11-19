import { expect, test } from 'claude-code/testing'

import type { Mode, Preferences, Setup } from '../types'
import {
  DEFAULTS,
  isMigrating,
  isUnsaved,
  loaded,
  migrated,
  originOf,
  projectKeyOf,
  savedTo,
  startMode,
} from '../hooks/preferences'

const on = (...modes: Mode[]): Record<Mode, Setup> => {
  const all = structuredClone(DEFAULTS.setups)

  for (const each of Object.keys(all) as Mode[]) {
    all[each].isOn = modes.includes(each)
  }

  return all
}

test('nothing saved, or something that is not an object, loads the defaults', () => {
  expect(loaded(undefined)).toEqual(DEFAULTS)
  expect(loaded('basura')).toEqual(DEFAULTS)
  expect(loaded(null)).toEqual(DEFAULTS)
})

test('saved settings load over the defaults, in one order whatever the save’s', () => {
  const saved = {
    prompts: { troll: 'sé borde' },
    startsOpen: true,
    isOn: false,
    setups: { troll: { effort: 'high', model: 'opus', alert: 'always', isOn: true } },
  }
  const result = loaded(saved)

  expect(Object.keys(result)).toEqual(['isOn', 'startsOpen', 'setups', 'prompts'])
  expect(result).toMatchObject({ isOn: false, startsOpen: true, prompts: { troll: 'sé borde' } })
  expect(result.setups.troll).toEqual({ isOn: true, alert: 'always', model: 'opus', effort: 'high' })
  expect(result.setups.asesor).toEqual(DEFAULTS.setups.asesor)
})

test('a value saved of another kind takes its default', () => {
  const result = loaded({
    isOn: 'sí',
    startsOpen: 1,
    prompts: { asesor: 3, troll: 'vale', inventado: 'no' },
    setups: { asesor: { isOn: 'yes', alert: 'a veces', model: 4, effort: 'ultra' } },
  })

  expect(result.isOn).toBe(true)
  expect(result.startsOpen).toBe(false)
  expect(result.prompts).toEqual({ troll: 'vale' })
  expect(result.setups.asesor).toEqual(DEFAULTS.setups.asesor)
})

test('settings saved before each mode had its own load as they meant', () => {
  const result = loaded({ mode: 'asesor', model: 'opus', effort: 'low', hasAlerts: false })

  expect(result.setups.asesor).toEqual({ isOn: true, alert: 'never', model: 'opus', effort: 'low' })
  expect(result.setups.vigilante).toEqual({ isOn: false, alert: 'never', model: 'opus', effort: 'low' })
})

test('settings saved before each mode had its own keep alerting while minimized unless turned off', () => {
  expect(loaded({ mode: 'troll' }).setups.troll).toEqual({
    isOn: true,
    alert: 'minimized',
    model: 'sonnet',
    effort: 'auto',
  })
  expect(loaded({ mode: 'inventado' }).setups.vigilante.isOn).toBe(true)
})

test('a project’s settings are kept in the store under its root folder, none where the session tells no root', () => {
  expect(projectKeyOf('/work/app')).toBe('settings:/work/app')
  expect(projectKeyOf('')).toBe('settings:')
  expect(projectKeyOf(null)).toBeUndefined()
})

test('a choice or prompts kept before the global settings are taken up as those', () => {
  expect(isMigrating(undefined, {}, undefined)).toBe(true)
  expect(isMigrating(undefined, undefined, {})).toBe(true)
  expect(isMigrating(undefined, {}, {})).toBe(true)
})

test('nothing is taken up while global settings exist, or when nothing older was kept', () => {
  expect(isMigrating({}, {}, {})).toBe(false)
  expect(isMigrating(undefined, undefined, undefined)).toBe(false)
  expect(isMigrating({}, undefined, undefined)).toBe(false)
})

test('the choice and prompts kept before settings were saved become one settings object', () => {
  expect(migrated({ mode: 'resumen', effort: 'max' }, { resumen: 'mi prompt' })).toMatchObject({
    prompts: { resumen: 'mi prompt' },
    setups: { resumen: { isOn: true, effort: 'max' }, vigilante: { isOn: false } },
  })
  expect(migrated(undefined, undefined)).toEqual(DEFAULTS)
  expect(migrated(undefined, { troll: 'x' }).prompts).toEqual({ troll: 'x' })
})

test('the session’s settings are unsaved when they differ from the saved ones', () => {
  const changed: Preferences = { ...DEFAULTS, startsOpen: true }

  expect(isUnsaved(DEFAULTS, DEFAULTS)).toBe(false)
  expect(isUnsaved(changed, DEFAULTS)).toBe(true)
  expect(isUnsaved(changed, loaded(changed))).toBe(false)
  // The same settings in another order are the same.
  expect(isUnsaved({ prompts: {}, setups: DEFAULTS.setups, startsOpen: false, isOn: true }, DEFAULTS)).toBe(false)
})

test('settings that hold their own setups are not read as saved before each mode had its own', () => {
  expect(loaded({ mode: 'asesor', setups: {} })).toEqual(DEFAULTS)
})

test('the pane keeps showing its mode while it is on', () => {
  expect(startMode('asesor', on('asesor', 'troll'))).toBe('asesor')
})

test('the pane shows the first mode on when the one it showed is off', () => {
  expect(startMode('vigilante', on('troll', 'asesor'))).toBe('asesor')
})

test('the pane keeps its mode when none is on', () => {
  expect(startMode('troll', on())).toBe('troll')
})

test('settings come from the project’s saved ones, else the global ones, else the defaults', () => {
  expect(originOf({}, {})).toEqual({ source: 'project', isChanged: false, hasProject: true })
  expect(originOf(undefined, {})).toEqual({ source: 'global', isChanged: false, hasProject: false })
  expect(originOf(undefined, undefined)).toEqual({ source: 'defaults', isChanged: false, hasProject: false })
})

test('saving for the project makes the project the source, saving as global keeps whether it has its own', () => {
  const was = { source: 'defaults', isChanged: true, hasProject: false } as const

  expect(savedTo(was, 'project')).toEqual({ source: 'project', isChanged: false, hasProject: true })
  expect(savedTo(was, 'global')).toEqual({ source: 'global', isChanged: false, hasProject: false })
  expect(savedTo({ ...was, hasProject: true }, 'global')).toEqual({
    source: 'global',
    isChanged: false,
    hasProject: true,
  })
})
