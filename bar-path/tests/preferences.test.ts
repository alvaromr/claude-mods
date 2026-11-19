import { expect, test } from 'claude-code/testing'

import {
  COLORS,
  DEFAULTS,
  PARTS,
  differs,
  entered,
  isColor,
  loaded,
  projectKeyOf,
  provenanceOf,
  savedAs,
} from '../hooks/preferences'

test('the defaults draw the parents gray and the project folder cyan, home as ~', () => {
  expect(DEFAULTS).toEqual({ showParents: true, showTilde: true, parentColor: '#8a8a8a', nameColor: 'cyan' })
})

test('the saved settings lay over the defaults', () => {
  expect(loaded({ showParents: false, nameColor: 'red' })).toEqual({
    ...DEFAULTS,
    showParents: false,
    nameColor: 'red',
  })
})

test('a field the save holds of another type, or does not know, takes the default', () => {
  const saved = { showParents: 'yes', parentColor: 7, unknown: true }

  expect(loaded(saved)).toEqual(DEFAULTS)
})

test('what was never saved, or is no object, gives the defaults', () => {
  expect([undefined, null, 'text', 3].map(loaded)).toEqual([DEFAULTS, DEFAULTS, DEFAULTS, DEFAULTS])
  // A function that carries fields is no save either.
  expect(loaded(Object.assign(() => 0, { showParents: false }))).toEqual(DEFAULTS)
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
  expect(differs({ ...DEFAULTS, nameColor: 'red' }, DEFAULTS)).toBe(true)
  expect(differs(DEFAULTS, { ...DEFAULTS, showTilde: false })).toBe(true)
})

test('a color is a hex code, a name or a theme key', () => {
  for (const color of ['#fff', '#8787d7', '#ABCDEF', 'red', 'warning', 'ansi256']) {
    expect(isColor(color)).toBe(true)
  }

  for (const color of ['', '#ff', '#fffff', '#fffffffff', '#ggg', 'dark red', '1red', 'rgb(1,2,3)']) {
    expect(isColor(color)).toBe(false)
  }
})

test('a text typed is trimmed before the field judges it', () => {
  expect(entered('  red ', isColor)).toEqual({ text: 'red', isRefused: false })
  expect(entered(' dark red\n', isColor)).toEqual({ text: 'dark red', isRefused: true })
})

test('every field the pane lists exists in the settings, of the type its control holds', () => {
  expect(PARTS.every(([key]) => typeof DEFAULTS[key] === 'boolean')).toBe(true)
  expect(COLORS.every(([key]) => typeof DEFAULTS[key] === 'string')).toBe(true)
  expect(PARTS.map(([key]) => key)).toEqual(['showParents', 'showTilde'])
  expect(COLORS.map(([key]) => key)).toEqual(['parentColor', 'nameColor'])
})

test('the defaults satisfy the rule the pane enforces on what is typed', () => {
  expect(COLORS.every(([key]) => isColor(DEFAULTS[key]))).toBe(true)
})
