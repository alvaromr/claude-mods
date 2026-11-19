import { expect, test } from 'claude-code/testing'

import {
  COLORS,
  COUNTS,
  DEFAULTS,
  LABELS,
  PARTS,
  TTLS,
  colorProblem,
  countOf,
  differs,
  labelProblem,
  loaded,
  entered,
  provenanceOf,
  projectKeyOf,
  savedAs,
} from '../hooks/preferences'

test('the settings saved lay over the defaults', () => {
  expect(loaded({ showTokens: true, contextLabel: 'Ctx', midFrom: 40 })).toEqual({
    ...DEFAULTS,
    showTokens: true,
    contextLabel: 'Ctx',
    midFrom: 40,
  })
})

test('a field the save holds of another type, or does not know, takes the default', () => {
  const saved = { showBar: 'yes', highFrom: '90', modelColor: 7, unknown: true }

  expect(loaded(saved)).toEqual(DEFAULTS)
})

test('what was never saved, or is no object, gives the defaults', () => {
  expect([undefined, null, 'text', 3].map(loaded)).toEqual([DEFAULTS, DEFAULTS, DEFAULTS, DEFAULTS])
  // A function that carries fields is no save either.
  expect(loaded(Object.assign(() => 0, { showBar: false }))).toEqual(DEFAULTS)
})

test('the pane bounds its counts as the settings can hold', () => {
  expect(COUNTS.map(([key, , min, max]) => [key, min, max])).toEqual([
    ['midFrom', 0, 100],
    ['highFrom', 0, 100],
    ['cacheSoonMinutes', 0, 60],
    ['missShownMinutes', 0, 1440],
    ['compactFrom', 0, 100],
  ])
})

test('settings differ as soon as one field does', () => {
  expect(differs(DEFAULTS, { ...DEFAULTS })).toBe(false)
  expect(differs({ ...DEFAULTS, cacheTtl: '1h' }, DEFAULTS)).toBe(true)
  expect(differs(DEFAULTS, { ...DEFAULTS, showBar: false })).toBe(true)
})

test('the settings come from the project when it saved some, else from the global ones, else from the defaults', () => {
  expect(provenanceOf({}, {})).toEqual({ source: 'project', isChanged: false, hasProject: true })
  expect(provenanceOf(undefined, {})).toEqual({ source: 'global', isChanged: false, hasProject: false })
  expect(provenanceOf(undefined, undefined)).toEqual({ source: 'defaults', isChanged: false, hasProject: false })
})

test('a project keeps its settings under its root folder, a session with no root has none', () => {
  expect(projectKeyOf('/work/app')).toBe('settings:/work/app')
  expect(projectKeyOf(null)).toBeUndefined()
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

test('a text typed is trimmed before the field says what is wrong with it', () => {
  const refusal = (text: string) => (text === 'no' ? 'refused' : undefined)

  expect(entered('  fine ', refusal)).toEqual({ text: 'fine', refused: undefined })
  expect(entered(' no\n', refusal)).toEqual({ text: 'no', refused: 'refused' })
})

test('a label is 1 to 24 characters', () => {
  expect(labelProblem('')).toBeDefined()
  expect(labelProblem('x'.repeat(25))).toBe(labelProblem(''))
  expect(labelProblem('x')).toBeUndefined()
  expect(labelProblem('x'.repeat(24))).toBeUndefined()
})

test('a color is a hex code, a name or a theme key, and the problem names what was typed', () => {
  for (const color of ['#fff', '#8787d7', '#ABCDEF', 'red', 'warning', 'ansi256']) {
    expect(colorProblem(color)).toBeUndefined()
  }

  for (const color of ['', '#ff', '#fffff', '#fffffffff', '#ggg', 'dark red', '1red', 'rgb(1,2,3)']) {
    expect(colorProblem(color)).toContain(color)
  }
})

test('a count is a whole number within its bounds, written in plain digits', () => {
  expect(countOf('0', 0, 100)).toBe(0)
  expect(countOf('100', 0, 100)).toBe(100)
  expect(countOf(' 42 ', 0, 100)).toBe(42)
})

test('a count outside its bounds, empty, or not in plain digits, is refused', () => {
  for (const text of ['101', '', '  ', '0x10', '1e2', '-1', '1.5', 'ten']) {
    expect(countOf(text, 0, 100)).toBeUndefined()
  }

  expect(countOf('4', 5, 10)).toBeUndefined()
})

test('every field the pane lists exists in the settings, of the type its control holds', () => {
  expect(PARTS.every(([key]) => typeof DEFAULTS[key] === 'boolean')).toBe(true)
  expect([...LABELS, ...COLORS].every(([key]) => typeof DEFAULTS[key] === 'string')).toBe(true)
  expect(COUNTS.every(([key]) => typeof DEFAULTS[key] === 'number')).toBe(true)
})

test('the defaults satisfy the rules the pane enforces on what is typed', () => {
  expect(LABELS.map(([key]) => labelProblem(DEFAULTS[key]))).toEqual(LABELS.map(() => undefined))
  expect(COLORS.map(([key]) => colorProblem(DEFAULTS[key]))).toEqual(COLORS.map(() => undefined))
  expect(COUNTS.every(([key, , min, max]) => countOf(String(DEFAULTS[key]), min, max) === DEFAULTS[key])).toBe(true)
})

test('the pane offers the cache lifetime as automatic, 5 minutes or 1 hour', () => {
  expect(TTLS.map(({ value }) => value)).toEqual(['auto', '5m', '1h'])
  expect(TTLS.map(({ value }) => value).includes(DEFAULTS.cacheTtl)).toBe(true)
})
