import { expect, test } from 'claude-code/testing'

import { EFFORTS, MODELS, aliasOf, clickable, toggled } from '../hooks/picker'
import { DEFAULTS } from '../hooks/preferences'

test('the row offers the aliases and the efforts Claude Code takes', () => {
  expect(MODELS).toEqual(['default', 'opus', 'sonnet', 'haiku', 'fable'])
  expect(EFFORTS).toEqual(['low', 'medium', 'high', 'xhigh', 'max'])
})

test('a model name starts with the alias it is current as', () => {
  expect(aliasOf('Opus 5.5')).toBe('opus')
  expect(aliasOf('sonnet')).toBe('sonnet')
  expect(aliasOf('Haiku 4.5')).toBe('haiku')
})

test('a name that starts with no alias is none of them', () => {
  expect(aliasOf('my-opus')).toBeUndefined()
  expect(aliasOf('')).toBeUndefined()
})

test('a click opens its choice, and closes it when it is the one open', () => {
  expect(toggled(null, 'model')).toBe('model')
  expect(toggled('effort', 'model')).toBe('model')
  expect(toggled('model', 'model')).toBeNull()
  expect(toggled('effort', 'effort')).toBeNull()
})

test('the model and the effort are offered in that order, in their colors', () => {
  const s = { ...DEFAULTS, modelColor: '#111111', effortColor: '#222222' }

  expect(clickable(s, { name: 'Opus 5.5', effort: 'high' })).toEqual([
    { what: 'model', text: 'Opus 5.5', color: '#111111' },
    { what: 'effort', text: 'high', color: '#222222' },
  ])
})

test('each is left out when its setting hides it or it is not known', () => {
  const both = { name: 'Opus 5.5', effort: 'high' }

  expect(clickable({ ...DEFAULTS, showModel: false }, both).map(({ what }) => what)).toEqual(['effort'])
  expect(clickable({ ...DEFAULTS, showEffort: false }, both).map(({ what }) => what)).toEqual(['model'])
  expect(clickable(DEFAULTS, { name: null, effort: 'high' }).map(({ what }) => what)).toEqual(['effort'])
  expect(clickable(DEFAULTS, { name: 'Opus 5.5', effort: null }).map(({ what }) => what)).toEqual(['model'])
  expect(clickable(DEFAULTS, { name: null, effort: null })).toEqual([])
})
