import { expect, test } from 'claude-code/testing'

import {
  COLORS,
  COUNTS,
  CYCLE_SECONDS,
  DEFAULTS,
  LABELS,
  NOTES,
  PARTS,
  WINDOWS,
  asColor,
  asLabel,
  countOf,
  differs,
  entered,
  loaded,
  projectKeyOf,
  provenanceOf,
  savedAs,
} from '../hooks/preferences'

test('the settings saved lay over the defaults', () => {
  expect(loaded({ showBar: false, sessionLabel: 'S', midFrom: 40 })).toEqual({
    ...DEFAULTS,
    showBar: false,
    sessionLabel: 'S',
    midFrom: 40,
  })
})

test('a field the save holds of another type, or does not know, takes the default', () => {
  const saved = { showBar: 'yes', highFrom: '90', lowColor: 7, unknown: true }

  expect(loaded(saved)).toEqual(DEFAULTS)
})

test('what was never saved, or is no object, gives the defaults', () => {
  expect([undefined, null, 'text', 3].map(loaded)).toEqual([DEFAULTS, DEFAULTS, DEFAULTS, DEFAULTS])
  // A function that carries fields is no save either.
  expect(loaded(Object.assign(() => 0, { showBar: false }))).toEqual(DEFAULTS)
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
  expect(differs({ ...DEFAULTS, cycle: true }, DEFAULTS)).toBe(true)
  expect(differs(DEFAULTS, { ...DEFAULTS, showBar: false })).toBe(true)
})

test('a text typed is trimmed before the field says what is wrong with it', () => {
  const refusal = (text: string) => (text === 'no' ? 'refused' : undefined)

  expect(entered('  fine ', refusal)).toEqual({ text: 'fine', refused: undefined })
  expect(entered(' no\n', refusal)).toEqual({ text: 'no', refused: 'refused' })
})

test('a label is 1 to 24 characters', () => {
  expect(asLabel('')).toBeDefined()
  expect(asLabel('x'.repeat(25))).toBe(asLabel(''))
  expect(asLabel('x')).toBeUndefined()
  expect(asLabel('x'.repeat(24))).toBeUndefined()
})

test('a color is a hex code, a name or a theme key, and the problem names what was typed', () => {
  for (const color of ['#fff', '#8787d7', '#ABCDEF', 'red', 'warning', 'ansi256']) {
    expect(asColor(color)).toBeUndefined()
  }

  for (const color of ['', '#ff', '#fffff', '#fffffffff', '#ggg', 'dark red', '1red', 'rgb(1,2,3)']) {
    expect(asColor(color)).toContain(color)
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

test('the pane bounds its counts as the settings can hold', () => {
  expect(COUNTS.map(([key, , min, max]) => [key, min, max])).toEqual([
    ['cycleSeconds', 0, 3600],
    ['midFrom', 0, 100],
    ['highFrom', 0, 100],
    ['paceMidFrom', 0, 1000],
    ['paceHighFrom', 0, 1000],
    ['paceFast', 100, 1000],
  ])
  expect(COUNTS[0]).toBe(CYCLE_SECONDS)
})

test('the pace field has a note under it', () => {
  expect(Object.keys(NOTES)).toEqual(['paceFast'])
})

test('every field the pane lists exists in the settings, of the type its control holds', () => {
  expect([...WINDOWS, ...PARTS].every(([key]) => typeof DEFAULTS[key] === 'boolean')).toBe(true)
  expect([...LABELS, ...COLORS].every(([key]) => typeof DEFAULTS[key] === 'string')).toBe(true)
  expect(COUNTS.every(([key]) => typeof DEFAULTS[key] === 'number')).toBe(true)
})

test('the defaults satisfy the rules the pane enforces on what is typed', () => {
  expect(LABELS.map(([key]) => asLabel(DEFAULTS[key]))).toEqual(LABELS.map(() => undefined))
  expect(COLORS.map(([key]) => asColor(DEFAULTS[key]))).toEqual(COLORS.map(() => undefined))
  expect(COUNTS.every(([key, , min, max]) => countOf(String(DEFAULTS[key]), min, max) === DEFAULTS[key])).toBe(true)
})
