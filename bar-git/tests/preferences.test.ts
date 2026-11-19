import { expect, test } from 'claude-code/testing'

import {
  COLORS,
  DEFAULTS,
  PARTS,
  TEXTS,
  differs,
  entered,
  isColor,
  isLength,
  loaded,
  projectKeyOf,
  provenanceOf,
  savedAs,
} from '../hooks/preferences'

test('the saved settings lay over the defaults', () => {
  expect(loaded({ showFiles: false, icon: '*', branchColor: 'red' })).toEqual({
    ...DEFAULTS,
    showFiles: false,
    icon: '*',
    branchColor: 'red',
  })
})

test('a field the save holds of another type, or does not know, takes the default', () => {
  const saved = { showFiles: 'yes', icon: 7, unknown: true }

  expect(loaded(saved)).toEqual(DEFAULTS)
})

test('what was never saved, or is no object, gives the defaults', () => {
  expect([undefined, null, 'text', 3].map(loaded)).toEqual([DEFAULTS, DEFAULTS, DEFAULTS, DEFAULTS])
  // A function that carries fields is no save either.
  expect(loaded(Object.assign(() => 0, { showFiles: false }))).toEqual(DEFAULTS)
})

test('a project keeps its settings under its root folder, a session with no root has none', () => {
  expect(projectKeyOf('/work/app')).toBe('settings:/work/app')
  expect(projectKeyOf(null)).toBeUndefined()
})

test('the settings come from the project when it saved some, else from the global ones, else from the defaults', () => {
  expect(provenanceOf({}, {})).toEqual({ source: 'project', isChanged: false, hasProject: true })
  expect(provenanceOf({}, undefined)).toEqual({ source: 'project', isChanged: false, hasProject: true })
  expect(provenanceOf(undefined, {})).toEqual({ source: 'global', isChanged: false, hasProject: false })
  expect(provenanceOf(undefined, undefined)).toEqual({ source: 'defaults', isChanged: false, hasProject: false })
})

test('saving settings leaves them unchanged since, from where they were saved', () => {
  const now = { source: 'defaults', isChanged: true, hasProject: false } as const

  expect(savedAs(now, 'global')).toEqual({ source: 'global', isChanged: false, hasProject: false })
  expect(savedAs(now, 'project')).toEqual({ source: 'project', isChanged: false, hasProject: true })
})

test('a project that kept its own settings keeps them when the global ones are saved', () => {
  const now = { source: 'global', isChanged: true, hasProject: true } as const

  expect(savedAs(now, 'global')).toEqual({ source: 'global', isChanged: false, hasProject: true })
})

test('settings differ as soon as one field does', () => {
  expect(differs(DEFAULTS, { ...DEFAULTS })).toBe(false)
  expect(differs({ ...DEFAULTS, icon: '*' }, DEFAULTS)).toBe(true)
  expect(differs(DEFAULTS, { ...DEFAULTS, showAhead: false })).toBe(true)
})

test('a color is a hex code, a name or a theme key', () => {
  for (const color of ['#fff', '#8787d7', '#ABCDEF', 'red', 'warning', 'ansi256']) {
    expect(isColor(color)).toBe(true)
  }

  for (const color of ['', '#ff', '#fffff', '#fffffffff', '#ggg', 'dark red', '1red', 'rgb(1,2,3)']) {
    expect(isColor(color)).toBe(false)
  }
})

test('a text is long enough from its least to its most characters, both included', () => {
  expect(isLength('', 0, 4)).toBe(true)
  expect(isLength('abcd', 0, 4)).toBe(true)
  expect(isLength('abcde', 0, 4)).toBe(false)
  expect(isLength('', 1, 24)).toBe(false)
  expect(isLength('a', 1, 24)).toBe(true)
})

test('a text typed is trimmed before the field judges it', () => {
  expect(entered('  red ', isColor)).toEqual({ text: 'red', isRefused: false })
  expect(entered(' dark red\n', isColor)).toEqual({ text: 'dark red', isRefused: true })
})

test('the pane bounds its text fields as the settings can hold', () => {
  expect(TEXTS.map(([key, , min, max]) => [key, min, max])).toEqual([
    ['icon', 0, 4],
    ['commitLabel', 1, 24],
    ['commitPrompt', 1, 500],
    ['integrateLabel', 1, 24],
    ['integratePrompt', 1, 500],
  ])
})

test('every field the pane lists exists in the settings, of the type its control holds', () => {
  expect(PARTS.every(([key]) => typeof DEFAULTS[key] === 'boolean')).toBe(true)
  expect([...TEXTS, ...COLORS].every(([key]) => typeof DEFAULTS[key] === 'string')).toBe(true)
})

test('the defaults satisfy the rules the pane enforces on what is typed', () => {
  expect(TEXTS.every(([key, , min, max]) => isLength(DEFAULTS[key], min, max))).toBe(true)
  expect(COLORS.every(([key]) => isColor(DEFAULTS[key]))).toBe(true)
})
