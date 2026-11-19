import { expect, test } from 'claude-code/testing'

import type { Mod } from '../types'
import { flipped, folded, pressOf, restored, switchable, withSwitch } from '../hooks/switches'

const mod = (id: string, scope?: string, extra: Partial<Mod> = {}): Mod => ({
  id,
  isEnabled: true,
  description: 'x',
  ...(scope === undefined ? {} : { scope }),
  ...extra,
})

test('a mod switched is pending, and switched again is back to what the session runs', () => {
  expect(flipped([], 'a')).toEqual(['a'])
  expect(flipped(['b'], 'a')).toEqual(['b', 'a'])
  expect(flipped(['b', 'a'], 'a')).toEqual(['b'])
})

test('a switch is drawn on its own row alone, by the mod’s key, scope included', () => {
  const list = [mod('a@m'), mod('b@m', 'user'), mod('b@m', 'project')]

  expect(withSwitch(list, 'b@m:project', false)).toEqual([
    mod('a@m'),
    mod('b@m', 'user'),
    mod('b@m', 'project', { isEnabled: false }),
  ])
  expect(withSwitch(list, 'a@m', false)[0]?.isEnabled).toBe(false)
  expect(withSwitch(list, 'none', false)).toEqual(list)
})

test('a switch drawn takes the state it is given, on or off', () => {
  expect(withSwitch([mod('a@m', undefined, { isEnabled: false })], 'a@m', true)[0]?.isEnabled).toBe(true)
})

test('the switches kept after a failed reload are the ones it took off and the ones pressed since, each once', () => {
  expect(restored(['a', 'b'], ['b', 'c'])).toEqual(['a', 'b', 'c'])
  expect(restored([], ['c'])).toEqual(['c'])
  expect(restored(['a'], [])).toEqual(['a'])
})

test('a press on a row unfolds its description, and a second one folds it again', () => {
  expect(folded([], 'a')).toEqual(['a'])
  expect(folded(['b'], 'a')).toEqual(['b', 'a'])
  expect(folded(['a', 'b'], 'a')).toEqual(['b'])
})

test('a press says the switch pressed or the row to unfold', () => {
  expect(pressOf({ toggle: 'a@m' })).toEqual({ toggle: 'a@m', fold: undefined })
  expect(pressOf({ fold: 'a@m' })).toEqual({ toggle: undefined, fold: 'a@m' })
})

test('a press with no data, or a fold that is no text, says nothing to unfold', () => {
  expect(pressOf(undefined)).toEqual({ toggle: undefined, fold: undefined })
  expect(pressOf(null)).toEqual({ toggle: undefined, fold: undefined })
  expect(pressOf({ fold: 3 })).toEqual({ toggle: undefined, fold: undefined })
})

test('the mod whose switch is pressed is found by its key, scope included', () => {
  const list = [mod('a@m'), mod('b@m', 'user'), mod('b@m', 'project')]

  expect(switchable(list, 'a@m')).toBe(list[0])
  expect(switchable(list, 'b@m:project')).toBe(list[2])
  expect(switchable(list, 'b@m')).toBeUndefined()
  expect(switchable(list, undefined)).toBeUndefined()
  expect(switchable(list, 3)).toBeUndefined()
})

test('a locked mod has no switch to press', () => {
  const list = [mod('lock@builtin', undefined, { isLocked: true }), mod('a@m')]

  expect(switchable(list, 'lock@builtin')).toBeUndefined()
  expect(switchable(list, 'a@m')).toBe(list[1])
})
