import { expect, test } from 'claude-code/testing'

import type { Preferences } from '../types'
import {
  ALERT_FRAMES,
  DEFAULTS,
  KINDS,
  PROMPT_FRAMES,
  colorName,
  differs,
  hasUnusedProject,
  loaded,
  projectKeyOf,
  provenanceOf,
  savedAs,
  titleOf,
  withLook,
} from '../hooks/preferences'

test('the alerts come in the order of what must be seen first', () => {
  expect(KINDS).toEqual(['IMPORTANT', 'CAUTION', 'WARNING', 'TIP', 'NOTE', 'QUOTE'])
  expect(ALERT_FRAMES).toEqual(['box', 'lines', 'title'])
  expect(PROMPT_FRAMES).toEqual(['normal', 'box', 'lines'])
})

test("each alert is drawn by default in GitHub's colour, in a box, under its title; a quote gray, with none", () => {
  const colors = Object.fromEntries(KINDS.map(kind => [kind, DEFAULTS.looks[kind].color]))
  const titles = Object.fromEntries(KINDS.map(kind => [kind, DEFAULTS.looks[kind].title]))

  expect(colors).toEqual({
    NOTE: 'suggestion',
    TIP: 'success',
    IMPORTANT: 'merged',
    WARNING: 'warning',
    CAUTION: 'error',
    QUOTE: 'subtle',
  })
  expect(titles).toEqual({
    NOTE: 'Nota',
    TIP: 'Consejo',
    IMPORTANT: 'Importante',
    WARNING: 'Advertencia',
    CAUTION: 'Precaución',
    QUOTE: '',
  })
  expect(KINDS.every(kind => DEFAULTS.looks[kind].on && DEFAULTS.looks[kind].frame === 'box')).toBe(true)
  expect(DEFAULTS).toMatchObject({
    on: true,
    headings: { on: true, color: 'suggestion' },
    prompts: { frame: 'lines', color: 'permission', dashed: false },
  })
})

test('the settings saved lay over the defaults', () => {
  const saved = {
    on: false,
    looks: { WARNING: { on: false, color: 'error', frame: 'lines', title: 'Ojo' } },
    headings: { on: false, color: 'success' },
    prompts: { frame: 'box', color: '#7a8aa6', dashed: true },
  }

  expect(loaded(saved)).toEqual({
    on: false,
    looks: { ...DEFAULTS.looks, WARNING: { on: false, color: 'error', frame: 'lines', title: 'Ojo' } },
    headings: { on: false, color: 'success' },
    prompts: { frame: 'box', color: '#7a8aa6', dashed: true },
  })
})

test('a field the save lacks, or holds of another type, takes its default', () => {
  const saved = {
    on: 'yes',
    looks: { NOTE: { on: 1, color: 7, title: null }, TIP: 'green' },
    headings: { on: 'no', color: false },
    prompts: { color: 3, dashed: 'sí' },
  }

  expect(loaded(saved)).toEqual(DEFAULTS)
  expect(loaded({ looks: { NOTE: { title: '' } } }).looks.NOTE.title).toBe('')
})

test('a frame out of its options takes its default', () => {
  const saved = { looks: { NOTE: { frame: 'circle' } }, prompts: { frame: 'title' } }

  expect(loaded(saved)).toEqual(DEFAULTS)
  // The options of one are not the options of the other.
  expect(loaded({ looks: { NOTE: { frame: 'title' } }, prompts: { frame: 'normal' } })).toMatchObject({
    looks: { NOTE: { frame: 'title' } },
    prompts: { frame: 'normal' },
  })
})

test('what was never saved, or is no object, gives the defaults', () => {
  expect([undefined, null, 'text', 3, []].map(loaded)).toEqual([DEFAULTS, DEFAULTS, DEFAULTS, DEFAULTS, DEFAULTS])
  expect(loaded({ looks: 5, headings: 'x', prompts: null })).toEqual(DEFAULTS)
})

test('what the save holds of other alerts than the mod knows is dropped', () => {
  const kinds = Object.keys(loaded({ looks: { OTHER: { on: false } } }).looks)

  expect(kinds.sort()).toEqual([...KINDS].sort())
})

test('settings come from the project when it saved some, else from the global ones, else from the defaults', () => {
  expect(provenanceOf({ on: true }, { on: false })).toEqual({ source: 'project', isChanged: false, hasProject: true })
  expect(provenanceOf({}, undefined)).toEqual({ source: 'project', isChanged: false, hasProject: true })
  expect(provenanceOf(undefined, {})).toEqual({ source: 'global', isChanged: false, hasProject: false })
  expect(provenanceOf(undefined, undefined)).toEqual({ source: 'defaults', isChanged: false, hasProject: false })
})

test("a project's settings are kept under its root folder, none where the session tells no root", () => {
  expect(projectKeyOf('/repo')).toBe('settings:/repo')
  expect(projectKeyOf('')).toBe('settings:')
  expect(projectKeyOf(null)).toBeUndefined()
})

test('settings differ from the saved ones in any field, however deep', () => {
  const now = loaded({})

  expect(differs(now, loaded({}))).toBe(false)
  expect(differs(now, loaded({ on: false }))).toBe(true)
  expect(differs(now, loaded({ looks: { QUOTE: { color: 'error' } } }))).toBe(true)
  expect(differs(now, loaded({ prompts: { dashed: true } }))).toBe(true)
})

test('once saved, the settings are unchanged since, and the project keeps its own only if saved there', () => {
  const now = { source: 'defaults', isChanged: true, hasProject: false } as const

  expect(savedAs(now, 'global')).toEqual({ source: 'global', isChanged: false, hasProject: false })
  expect(savedAs(now, 'project')).toEqual({ source: 'project', isChanged: false, hasProject: true })
  expect(savedAs({ ...now, hasProject: true }, 'global')).toEqual({
    source: 'global',
    isChanged: false,
    hasProject: true,
  })
})

test('the project has settings the session did not start from when it keeps some and the session took others', () => {
  expect(hasUnusedProject({ source: 'global', isChanged: false, hasProject: true })).toBe(true)
  expect(hasUnusedProject({ source: 'defaults', isChanged: true, hasProject: true })).toBe(true)
  expect(hasUnusedProject({ source: 'project', isChanged: false, hasProject: true })).toBe(false)
  expect(hasUnusedProject({ source: 'global', isChanged: false, hasProject: false })).toBe(false)
})

test("one alert's look changes by the patch, the others and the rest of the settings as they were", () => {
  const now: Preferences = { ...DEFAULTS, on: false }
  const next = withLook(now, 'TIP', { color: 'merged', title: 'Truco' })

  expect(next.looks.TIP).toEqual({ ...DEFAULTS.looks.TIP, color: 'merged', title: 'Truco' })
  expect(next.on).toBe(false)
  for (const kind of KINDS.filter(other => other !== 'TIP')) {
    expect(next.looks[kind]).toBe(now.looks[kind])
  }
  // The settings it came from are left alone.
  expect(now.looks.TIP).toEqual(DEFAULTS.looks.TIP)
})

test("a colour is named in the person's words, else as the theme or the code has it", () => {
  expect(colorName('suggestion')).toBe('azul')
  expect(colorName('permission')).toBe('lavanda')
  expect(colorName('#b8a27a')).toBe('arena')
  expect(colorName('#123456')).toBe('#123456')
  expect(colorName('claude')).toBe('claude')
})

test('a title typed is trimmed, and too long past thirty characters', () => {
  expect(titleOf('  Ojo  ')).toEqual({ title: 'Ojo', isTooLong: false })
  expect(titleOf('')).toEqual({ title: '', isTooLong: false })
  expect(titleOf('a'.repeat(30))).toEqual({ title: 'a'.repeat(30), isTooLong: false })
  expect(titleOf(`  ${'a'.repeat(31)}  `)).toEqual({ title: 'a'.repeat(31), isTooLong: true })
})
