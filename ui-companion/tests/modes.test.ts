import { expect, test } from 'claude-code/testing'

import type { Mode, Setup } from '../types'
import {
  ACCENT,
  afterSetUp,
  asEffort,
  EFFORTS,
  effortAsked,
  keptPrompt,
  MODELS,
  MODES,
  modesOn,
  NOTHING,
  promptHeading,
  promptOf,
  ROLLING,
  rollingOn,
  SETUPS,
  SYSTEM,
  titleOf,
  WHENS,
  whenLabel,
  whenOf,
} from '../hooks/modes'
import { TEXT } from '../hooks/text'

const on = (...modes: Mode[]): Record<Mode, Setup> =>
  Object.fromEntries(MODES.map(each => [each, { ...SETUPS[each], isOn: modes.includes(each) }])) as Record<Mode, Setup>

test('the vigilante alone comments until the person turns another mode on', () => {
  expect(MODES.filter(each => SETUPS[each].isOn)).toEqual(['vigilante'])
})

test('every mode starts alerting while minimized, on sonnet with its own effort left to the model', () => {
  for (const each of MODES) {
    expect(SETUPS[each]).toMatchObject({ alert: 'minimized', model: 'sonnet', effort: 'auto' })
  }
})

test('every mode has a prompt and a color of its own', () => {
  expect(new Set(MODES.map(each => SYSTEM[each])).size).toBe(MODES.length)
  expect(new Set(MODES.map(each => ACCENT[each])).size).toBe(MODES.length)
})

test('the modes that may stay silent are told what to answer when they do', () => {
  expect(SYSTEM.vigilante).toBe(TEXT.system.vigilante(NOTHING))
  expect(SYSTEM.asesor).toBe(TEXT.system.asesor(NOTHING))
})

test('only the summary and the next steps keep a text', () => {
  expect(ROLLING).toEqual(['resumen', 'pendientes'])
})

test('the pane offers the three moments an alert can show, by their labels', () => {
  expect(WHENS).toEqual([
    { value: 'never', label: TEXT.alertNever },
    { value: 'minimized', label: TEXT.alertMinimized },
    { value: 'always', label: TEXT.alertAlways },
  ])
})

test('a kept text goes by its mode’s name, but the next steps by their own', () => {
  expect(titleOf('resumen')).toBe('resumen')
  expect(titleOf('pendientes')).toBe(TEXT.nextSteps)
})

test('the pane offers the four models', () => {
  expect(MODELS).toEqual(['haiku', 'sonnet', 'opus', 'fable'])
})

test('an effort is read only when it is one the pane offers', () => {
  for (const each of EFFORTS) {
    expect(asEffort(each)).toBe(each)
  }

  expect(asEffort('ultra')).toBeUndefined()
  expect(asEffort(3)).toBeUndefined()
  expect(asEffort(undefined)).toBeUndefined()
})

test('the modes on are listed in the modes’ order, whatever the order they were turned on in', () => {
  expect(modesOn(on('troll', 'vigilante', 'asesor'))).toEqual(['vigilante', 'asesor', 'troll'])
  expect(modesOn(on())).toEqual([])
})

test('of the modes on, the ones that keep a text are the ones the pane catches up', () => {
  expect(rollingOn(on('vigilante', 'pendientes', 'resumen', 'troll'))).toEqual(['resumen', 'pendientes'])
  expect(rollingOn(on('vigilante', 'asesor'))).toEqual([])
  expect(rollingOn(on('pendientes'))).toEqual(['pendientes'])
})

test('a mode asks with the prompt the person wrote, else with its own', () => {
  expect(promptOf({ troll: 'sé borde' }, 'troll')).toBe('sé borde')
  expect(promptOf({ troll: 'sé borde' }, 'asesor')).toBe(SYSTEM.asesor)
  expect(promptOf({}, 'troll')).toBe(SYSTEM.troll)
})

test('a prompt the person left empty is not kept, and one of text is kept as written', () => {
  expect(keptPrompt('troll', '')).toBeUndefined()
  expect(keptPrompt('troll', ' \n ')).toBeUndefined()
  expect(keptPrompt('troll', '  sé borde \n')).toBe('  sé borde \n')
})

test('a prompt equal to the mode’s own, whatever its spaces, is not kept either', () => {
  expect(keptPrompt('asesor', SYSTEM.asesor)).toBeUndefined()
  expect(keptPrompt('asesor', `\n${SYSTEM.asesor}  `)).toBeUndefined()
  expect(keptPrompt('asesor', SYSTEM.troll)).toBe(SYSTEM.troll)
})

test('a prompt’s heading is its mode’s name, marked once the person edited it', () => {
  expect(promptHeading({}, 'troll')).toBe('troll')
  expect(promptHeading({ troll: 'x' }, 'troll')).toBe(`troll${TEXT.edited}`)
  expect(promptHeading({ troll: 'x' }, 'asesor')).toBe('asesor')
})

test('an alert moment is shown by its label and read back from it', () => {
  for (const { value, label } of WHENS) {
    expect(whenLabel(value)).toBe(label)
    expect(whenOf(label)).toBe(value)
  }

  expect(whenLabel('whenever' as never)).toBe('')
  expect(whenOf('nunca jamás')).toBe('minimized')
})

test('an effort left to the model adds nothing to the call, and any other is asked', () => {
  expect(effortAsked('auto')).toEqual({})
  expect(effortAsked('xhigh')).toEqual({ effort: 'xhigh' })
})

test('turning a mode off puts its alert away, even when it was already off', () => {
  expect(afterSetUp({ ...SETUPS.troll, isOn: true }, { isOn: false })).toEqual({
    isDismissed: true,
    isAnswering: false,
  })
  expect(afterSetUp({ ...SETUPS.troll, isOn: false }, { isOn: false })).toEqual({
    isDismissed: true,
    isAnswering: false,
  })
})

test('turning a mode on makes it answer at once, unless it already was on', () => {
  expect(afterSetUp({ ...SETUPS.troll, isOn: false }, { isOn: true })).toEqual({
    isDismissed: false,
    isAnswering: true,
  })
  expect(afterSetUp({ ...SETUPS.troll, isOn: true }, { isOn: true })).toEqual({
    isDismissed: false,
    isAnswering: false,
  })
})

test('a change that leaves the switch alone neither dismisses nor answers', () => {
  expect(afterSetUp({ ...SETUPS.troll, isOn: true }, { model: 'opus' })).toEqual({
    isDismissed: false,
    isAnswering: false,
  })
  expect(afterSetUp({ ...SETUPS.troll, isOn: false }, { alert: 'always' })).toEqual({
    isDismissed: false,
    isAnswering: false,
  })
})
