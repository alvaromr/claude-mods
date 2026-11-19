import { expect, test } from 'claude-code/testing'

import type { Alert, AlertWhen, Mode, Setup } from '../types'
import { afterOpening, afterReset, alertHeading, isWarnable, shownAlerts } from '../hooks/alerts'
import { MODES, SETUPS } from '../hooks/modes'

const setup = (alert: AlertWhen, isOn = true): Setup => ({ isOn, alert, model: 'sonnet', effort: 'auto' })
const setups = (alert: AlertWhen): Record<Mode, Setup> =>
  Object.fromEntries(MODES.map(each => [each, setup(alert)])) as Record<Mode, Setup>
const alert = (mode: Mode, title: string = mode): Alert => ({ mode, title, text: `texto de ${mode}` })

test('what a mode on writes is warned of while minimized, or always, as its setup says', () => {
  expect(isWarnable(setup('minimized'), 'minimized')).toBe(true)
  expect(isWarnable(setup('minimized'), 'open')).toBe(false)
  expect(isWarnable(setup('always'), 'open')).toBe(true)
  expect(isWarnable(setup('always'), 'minimized')).toBe(true)
  expect(isWarnable(setup('never'), 'minimized')).toBe(false)
})

test('what a mode that is off writes is never warned of', () => {
  expect(isWarnable(setup('always', false), 'minimized')).toBe(false)
})

test('the alerts drawn are the ones the setups show now, in the modes’ order', () => {
  const kept = { troll: alert('troll'), vigilante: alert('vigilante'), asesor: alert('asesor') }

  expect(shownAlerts(kept, setups('minimized'), 'minimized').map(each => each.mode)).toEqual([
    'vigilante',
    'asesor',
    'troll',
  ])
  expect(
    shownAlerts(kept, { ...setups('minimized'), asesor: setup('never') }, 'minimized').map(each => each.mode),
  ).toEqual(['vigilante', 'troll'])
  expect(shownAlerts(kept, setups('minimized'), 'open')).toEqual([])
})

test('no alert is drawn while the advisor is off, not even one always shown', () => {
  expect(shownAlerts({ vigilante: alert('vigilante') }, setups('always'), 'off')).toEqual([])
})

test('an alert’s heading names the companion and its mode, and the title when it differs from the mode', () => {
  expect(alertHeading(alert('resumen'))).toBe('companion · resumen')
  expect(alertHeading(alert('asesor', 'nota 2'))).toBe('companion · asesor · nota 2')
})

test('opening the pane puts away the alerts shown while minimized and keeps the ones always shown', () => {
  const kept = { vigilante: alert('vigilante'), asesor: alert('asesor'), troll: alert('troll') }
  const all = { ...setups('minimized'), asesor: setup('always'), troll: setup('never') }

  expect(afterOpening(kept, all)).toEqual({ asesor: alert('asesor') })
})

test('resetting the settings puts away the alerts of the modes the defaults turn off', () => {
  const kept = { vigilante: alert('vigilante'), asesor: alert('asesor') }

  expect(SETUPS.vigilante.isOn).toBe(true)
  expect(afterReset(kept)).toEqual({ vigilante: alert('vigilante') })
})
