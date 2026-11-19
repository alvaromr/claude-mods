import type { Model, Picker, Preferences } from '../types'

// What `/model` takes and what `/effort` takes, the ids a click on the model or
// the effort offers; the models are Claude Code's own aliases, which it keeps up.
export const MODELS = ['default', 'opus', 'sonnet', 'haiku', 'fable']
export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max']

/** The alias a model's name starts with (Opus 5.5 → opus), none for a name that starts with no alias. */
export const aliasOf = (name: string) => MODELS.find(alias => name.toLowerCase().startsWith(alias))

/** What a click on the model or the effort opens: its choice, or none when that choice is the one open. */
export const toggled = (open: Picker | null, what: Picker): Picker | null => (open === what ? null : what)

/** The model and the effort the row offers to click, in that order, each only when its setting shows it and it is known. */
export const clickable = (s: Preferences, shown: Model) => [
  ...(s.showModel && shown.name !== null ? [{ what: 'model' as const, text: shown.name, color: s.modelColor }] : []),
  ...(s.showEffort && shown.effort !== null
    ? [{ what: 'effort' as const, text: shown.effort, color: s.effortColor }]
    : []),
]
