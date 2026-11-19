import { expect, test } from 'claude-code/testing'

import type { Mod } from '../types'
import { builtinMods, isMod, keyOf, listedMods, modOf, SCOPES } from '../hooks/mods'
import { TEXT } from '../hooks/text'

const PLUGIN = { id: 'pet@market', enabled: true, installPath: '/cache/pet' }
const mod = (id: string, scope?: string): Mod => ({
  id,
  isEnabled: true,
  description: 'x',
  ...(scope === undefined ? {} : { scope }),
})

test('a mod is told apart by its id, and by its scope where it has one', () => {
  expect(keyOf(mod('pet@market'))).toBe('pet@market')
  expect(keyOf(mod('pet@market', 'project'))).toBe('pet@market:project')
})

test('the scopes the CLI takes are the user’s, the project’s and the local one', () => {
  expect(SCOPES).toEqual(['user', 'project', 'local'])
})

test('a plugin is a mod when its hooks.json names a hooks module', () => {
  expect(isMod({ modules: ['hooks/register.tsx'] })).toBe(true)
  expect(isMod({ modules: [] })).toBe(true)
})

test('a plugin with plain hook commands, no hooks.json or an unreadable one is no mod', () => {
  expect(isMod({ hooks: {} })).toBe(false)
  expect(isMod({ modules: 'hooks/register.tsx' })).toBe(false)
  expect(isMod(undefined)).toBe(false)
})

test('an installed mod carries its id, its switch and what its plugin.json says of it', () => {
  expect(modOf({ ...PLUGIN, scope: 'user' }, { description: 'A pet.', author: 'Ana' })).toEqual({
    id: 'pet@market',
    isEnabled: true,
    description: 'A pet.',
    author: 'Ana',
    scope: 'user',
  })
  expect(modOf({ ...PLUGIN, enabled: false }, { description: 'A pet.' }).isEnabled).toBe(false)
})

test('a mod with no scope, as a session’s own, carries none', () => {
  expect('scope' in modOf(PLUGIN, { description: 'A pet.' })).toBe(false)
})

test('a mod with no description, or one of another kind, says so', () => {
  expect(modOf(PLUGIN, {}).description).toBe(TEXT.noDescription)
  expect(modOf(PLUGIN, undefined).description).toBe(TEXT.noDescription)
  expect(modOf(PLUGIN, { description: 3 }).description).toBe(TEXT.noDescription)
})

test('an author written as a name, or as an object that carries one, is the author', () => {
  expect(modOf(PLUGIN, { author: 'Ana' }).author).toBe('Ana')
  expect(modOf(PLUGIN, { author: { name: 'Ana', email: 'a@b.c' } }).author).toBe('Ana')
})

test('a mod with no author, an empty one or one of another kind has none', () => {
  expect('author' in modOf(PLUGIN, {})).toBe(false)
  expect('author' in modOf(PLUGIN, { author: '' })).toBe(false)
  expect('author' in modOf(PLUGIN, { author: { name: '' } })).toBe(false)
  expect('author' in modOf(PLUGIN, { author: { name: 4 } })).toBe(false)
  expect('author' in modOf(PLUGIN, { author: 7 })).toBe(false)
  expect('author' in modOf(PLUGIN, { author: null })).toBe(false)
})

const builtin = (switches: unknown) =>
  Object.fromEntries(builtinMods(switches).map(each => [each.id.replace('@builtin', ''), each.isEnabled]))

test('the built-in mods are the six Claude Code ships, each described and by Claude Code', () => {
  const all = builtinMods({})

  expect(all.map(each => each.id)).toEqual([
    'cc-plugin-agents-md@builtin',
    'cc-plugin-diff@builtin',
    'cc-plugin-plugin-authoring@builtin',
    'cc-plugin-sec-default@builtin',
    'cc-plugin-telemetry@builtin',
    'cc-plugin-you-should-know@builtin',
  ])
  expect(all[0]).toEqual({
    id: 'cc-plugin-agents-md@builtin',
    isEnabled: true,
    description: TEXT.builtins['cc-plugin-agents-md'],
    author: TEXT.builtinAuthor,
  })
})

test('a built-in mod is on until settings turn it off, but the you-should-know one is off until they turn it on', () => {
  expect(builtin({})).toEqual({
    'cc-plugin-agents-md': true,
    'cc-plugin-diff': true,
    'cc-plugin-plugin-authoring': true,
    'cc-plugin-sec-default': true,
    'cc-plugin-telemetry': true,
    'cc-plugin-you-should-know': false,
  })
  expect(builtin({ 'cc-plugin-diff@builtin': false, 'cc-plugin-you-should-know@builtin': true })).toMatchObject({
    'cc-plugin-diff': false,
    'cc-plugin-you-should-know': true,
    'cc-plugin-telemetry': true,
  })
})

test('settings with no switches, or a switch that is no boolean, leave the built-in mods at their defaults', () => {
  for (const switches of [undefined, null, 'on', 3]) {
    expect(builtin(switches)['cc-plugin-diff']).toBe(true)
    expect(builtin(switches)['cc-plugin-you-should-know']).toBe(false)
  }

  expect(builtin({ 'cc-plugin-diff@builtin': 'no' })['cc-plugin-diff']).toBe(true)
  expect(builtin({ 'cc-plugin-you-should-know@builtin': 1 })['cc-plugin-you-should-know']).toBe(false)
})

test('the security mod is locked and on whatever settings say, and no other is locked', () => {
  const locked = builtinMods({ 'cc-plugin-sec-default@builtin': false }).filter(each => each.isLocked === true)

  expect(locked.map(each => each.id)).toEqual(['cc-plugin-sec-default@builtin'])
  expect(locked[0]?.isEnabled).toBe(true)
})

test('the installed mods are listed by id, then by scope, before the built-in ones', () => {
  const listed = listedMods(
    [mod('pet@market', 'user'), mod('a@market'), mod('pet@market', 'local'), mod('pet@market', 'project')],
    {},
  )

  expect(listed.slice(0, 4).map(keyOf)).toEqual([
    'a@market',
    'pet@market:local',
    'pet@market:project',
    'pet@market:user',
  ])
  expect(listed.slice(4).map(each => each.id)).toEqual(builtinMods({}).map(each => each.id))
})

test('a list of installed mods is not reordered in place', () => {
  const installed = [mod('b@market'), mod('a@market')]

  listedMods(installed, {})

  expect(installed.map(each => each.id)).toEqual(['b@market', 'a@market'])
})

test('the built-in mods in the list follow the settings', () => {
  expect(
    listedMods([], { 'cc-plugin-diff@builtin': false }).find(each => each.id === 'cc-plugin-diff@builtin'),
  ).toMatchObject({ isEnabled: false })
})
