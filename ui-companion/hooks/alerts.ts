import type { Alert, AlertWhen, Mode, Setup, View } from '../types'
import { MODES, SETUPS } from './modes'

type Alerts = Partial<Record<Mode, Alert>>

/** Whether a mode's alert shows now: never, while the pane is put away, or always. */
const isAlerting = (when: AlertWhen, now: View) => when === 'always' || (when === 'minimized' && now === 'minimized')

/**
 * Whether what a mode writes now also shows above the prompt: its mode is on
 * and its setup says so. The summary made for another mode to start from, with
 * its own mode off, does not.
 */
export const isWarnable = ({ isOn, alert }: Setup, now: View) => isOn && isAlerting(alert, now)

/** The alerts to draw, in the modes' order: none while the advisor is off. */
export const shownAlerts = (kept: Alerts, setups: Record<Mode, Setup>, now: View) =>
  MODES.flatMap(each => {
    const warned = kept[each]

    return warned !== undefined && now !== 'off' && isAlerting(setups[each].alert, now) ? [warned] : []
  })

/** What an alert's title line says: the companion, its mode and, unless it is the mode's name, the title. */
export const alertHeading = ({ mode, title }: Alert) =>
  ['companion', mode, ...(title === mode ? [] : [title])].join(' · ')

/** The alerts left once the pane is open: the ones shown while minimized go; the ones always shown stay. */
export const afterOpening = (shown: Alerts, setups: Record<Mode, Setup>): Alerts =>
  Object.fromEntries(Object.entries(shown).filter(([each]) => setups[each as Mode].alert === 'always'))

/** The alerts left once the settings are reset: the modes the defaults turn off stop, their alerts gone. */
export const afterReset = (all: Alerts): Alerts =>
  Object.fromEntries(Object.entries(all).filter(([each]) => SETUPS[each as Mode].isOn))
