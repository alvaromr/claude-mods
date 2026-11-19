import type { ThemeKey } from 'claude-code'

import type { AlertWhen, Effort, Mode, Setup } from '../types'
import { TEXT } from './text'

export const MODES: readonly Mode[] = ['vigilante', 'resumen', 'asesor', 'pendientes', 'troll']

/** The modes that keep one text up to date in place of adding notes. */
export const ROLLING: readonly Mode[] = ['resumen', 'pendientes']

/** What a mode that stays silent answers. */
export const NOTHING = '—'

/**
 * The vigilante alone comments until the person turns another on; each alerts
 * while minimized, and asks sonnet at its own effort.
 */
export const SETUPS: Record<Mode, Setup> = {
  vigilante: { isOn: true, alert: 'minimized', model: 'sonnet', effort: 'auto' },
  resumen: { isOn: false, alert: 'minimized', model: 'sonnet', effort: 'auto' },
  asesor: { isOn: false, alert: 'minimized', model: 'sonnet', effort: 'auto' },
  pendientes: { isOn: false, alert: 'minimized', model: 'sonnet', effort: 'auto' },
  troll: { isOn: false, alert: 'minimized', model: 'sonnet', effort: 'auto' },
}

/** When a mode's alert shows, as the pane offers it, by its label there. */
export const WHENS: readonly { value: AlertWhen; label: string }[] = [
  { value: 'never', label: TEXT.alertNever },
  { value: 'minimized', label: TEXT.alertMinimized },
  { value: 'always', label: TEXT.alertAlways },
]

export const MODELS = ['haiku', 'sonnet', 'opus', 'fable']

export const EFFORTS: readonly Effort[] = ['auto', 'low', 'medium', 'high', 'xhigh', 'max']

/** The system prompt each mode asks the model with, until the person writes their own. */
export const SYSTEM: Record<Mode, string> = {
  vigilante: TEXT.system.vigilante(NOTHING),
  resumen: TEXT.system.resumen(),
  asesor: TEXT.system.asesor(NOTHING),
  troll: TEXT.system.troll(),
  pendientes: TEXT.system.pendientes(),
}

/** The theme color each mode draws its pills and notes in. */
export const ACCENT: Record<Mode, ThemeKey> = {
  vigilante: 'warning',
  resumen: 'suggestion',
  asesor: 'claude',
  troll: 'merged',
  pendientes: 'planMode',
}

/** The name a mode's kept text goes by. */
export const titleOf = (chosen: Mode) => (chosen === 'pendientes' ? TEXT.nextSteps : chosen)

export const asEffort = (value: unknown) => EFFORTS.find(known => known === value)

/** The modes on, in the modes' order. */
export const modesOn = (setups: Record<Mode, Setup>) => MODES.filter(each => setups[each].isOn)

/** The modes on that keep a text: the ones a pane opened or a switch turned on catches up. */
export const rollingOn = (setups: Record<Mode, Setup>) => modesOn(setups).filter(each => ROLLING.includes(each))

/** The prompt a mode asks the model with: the one the person wrote, else its own. */
export const promptOf = (prompts: Partial<Record<Mode, string>>, chosen: Mode) => prompts[chosen] ?? SYSTEM[chosen]

/** The heading of a mode's prompt in the pane: its name, marked when the person edited it. */
export const promptHeading = (prompts: Partial<Record<Mode, string>>, chosen: Mode) =>
  `${chosen}${prompts[chosen] === undefined ? '' : TEXT.edited}`

/**
 * The prompt to keep for a mode from what the person wrote: one left empty, or
 * the mode's own, is none, so the mode's own is read again.
 */
export const keptPrompt = (chosen: Mode, text: string) =>
  text.trim() === '' || text.trim() === SYSTEM[chosen].trim() ? undefined : text

/** The label the pane gives a moment an alert shows; none for one it does not offer. */
export const whenLabel = (alert: AlertWhen) => WHENS.find(when => when.value === alert)?.label ?? ''

/** The moment an alert shows that a label of the pane stands for; while minimized for one it does not offer. */
export const whenOf = (label: string): AlertWhen => WHENS.find(when => when.label === label)?.value ?? 'minimized'

/** What a mode's effort adds to the model's call: nothing when `auto`, which leaves it to the model. */
export const effortAsked = (effort: Effort) => (effort === 'auto' ? {} : { effort })

/** What a change to a mode's setup brings: its alert gone when it is turned off, an answer at once when it is turned on. */
export const afterSetUp = (was: Setup, change: Partial<Setup>) => ({
  isDismissed: change.isOn === false,
  isAnswering: change.isOn === true && !was.isOn,
})
