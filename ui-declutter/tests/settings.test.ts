import { expect, test } from 'claude-code/testing'

import { DEFAULTS, LEVELS, isUnsaved, loaded, projectKeyOf, provenanceOf, savedAs } from '../hooks/settings'

test('the pane offers the levels from least drawn to most', () => {
  expect(LEVELS.map(({ value }) => value)).toEqual(['hidden', 'summary', 'full'])
})

test('a save is read over the defaults', () => {
  expect(loaded({ isOn: false, diffs: 'hidden', commands: 'full', skills: 'hidden', startsOpen: true })).toEqual({
    isOn: false,
    diffs: 'hidden',
    commands: 'full',
    skills: 'hidden',
    startsOpen: true,
  })
  expect(loaded({ diffs: 'full' })).toEqual({ ...DEFAULTS, diffs: 'full' })
})

test('the defaults are on, every kind grouped, spans folded', () => {
  expect(DEFAULTS).toEqual({ isOn: true, diffs: 'summary', commands: 'summary', skills: 'summary', startsOpen: false })
})

test('a switch held as a falsy value of another kind takes its default', () => {
  expect(loaded({ isOn: 0 }).isOn).toBe(true)
  expect(loaded({ startsOpen: 1 }).startsOpen).toBe(false)
})

test('a field the save lacks or holds of another kind takes its default', () => {
  expect(loaded({ isOn: 'yes', diffs: 'huge', commands: 3, skills: null, startsOpen: 1 })).toEqual(DEFAULTS)
})

test('what is no save at all gives the defaults', () => {
  expect([undefined, null, 'x', 7].map(loaded)).toEqual([DEFAULTS, DEFAULTS, DEFAULTS, DEFAULTS])
})

test("the settings come from the project's save if it has one, else the global one, else the defaults", () => {
  expect(provenanceOf({}, {})).toEqual({ source: 'project', isChanged: false, hasProject: true })
  expect(provenanceOf(undefined, {})).toEqual({ source: 'global', isChanged: false, hasProject: false })
  expect(provenanceOf(undefined, undefined)).toEqual({ source: 'defaults', isChanged: false, hasProject: false })
})

test("a project's settings are kept under its root folder, a session with no root has none", () => {
  expect(projectKeyOf('/work/app')).toBe('settings:/work/app')
  expect(projectKeyOf(null)).toBeUndefined()
})

test("saving the settings makes them the unchanged ones of where they went, the project's known if they went there", () => {
  const was = { source: 'defaults', isChanged: true, hasProject: false } as const

  expect(savedAs(was, 'project')).toEqual({ source: 'project', isChanged: false, hasProject: true })
  expect(savedAs(was, 'global')).toEqual({ source: 'global', isChanged: false, hasProject: false })
  expect(savedAs({ ...was, hasProject: true }, 'global')).toEqual({
    source: 'global',
    isChanged: false,
    hasProject: true,
  })
})

test('settings are unsaved when any one differs from the saved', () => {
  expect(isUnsaved(DEFAULTS, { ...DEFAULTS })).toBe(false)
  expect(isUnsaved({ ...DEFAULTS, isOn: false }, DEFAULTS)).toBe(true)
  expect(isUnsaved({ ...DEFAULTS, skills: 'full' }, DEFAULTS)).toBe(true)
  expect(isUnsaved({ ...DEFAULTS, startsOpen: true }, DEFAULTS)).toBe(true)
})
