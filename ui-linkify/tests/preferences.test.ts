import { expect, test } from 'claude-code/testing'

import {
  DEFAULTS,
  KEYS,
  SITE,
  countOf,
  differs,
  isActive,
  isRefused,
  loaded,
  projectKeyOf,
  provenanceOf,
  savedAs,
} from '../hooks/preferences'

test('everything is on by default, with no Jira until the person says where theirs live', () => {
  expect(DEFAULTS).toEqual({
    paths: true,
    jira: true,
    site: '',
    keys: '',
    title: true,
    images: true,
    draft: true,
    resend: true,
    columns: 80,
    rows: 20,
    commands: true,
  })
})

test('the saved settings lay over the defaults', () => {
  expect(loaded({ paths: false, site: 'https://a.atlassian.net', columns: 40 })).toEqual({
    ...DEFAULTS,
    paths: false,
    site: 'https://a.atlassian.net',
    columns: 40,
  })
})

test('a field the save holds of another type, or does not know, takes the default', () => {
  expect(loaded({ paths: 'no', columns: '40', site: 3, unknown: true })).toEqual(DEFAULTS)
})

test('what was never saved, or is no object, gives the defaults', () => {
  expect([undefined, null, 'text', 3].map(loaded)).toEqual([DEFAULTS, DEFAULTS, DEFAULTS, DEFAULTS])
})

test('a Jira address is http or https, with no spaces or parentheses', () => {
  for (const site of ['https://a.atlassian.net', 'http://jira.local:8080', 'https://x.com/jira']) {
    expect(SITE.test(site), site).toBe(true)
  }

  for (const site of [
    '',
    'a.atlassian.net',
    'ftp://a.net',
    'https://a b',
    'https://a(b)',
    'https://a.net\n',
    'x https://a.net',
  ]) {
    expect(SITE.test(site), site).toBe(false)
  }
})

test('project keys are words separated by commas, each starting with a letter', () => {
  for (const keys of ['ABC', 'abc, OPS', 'A1,B_2 ,c']) {
    expect(KEYS.test(keys), keys).toBe(true)
  }

  for (const keys of ['', '1ABC', 'ABC,', ',ABC', 'ABC OPS', 'ABC,,OPS', 'AB-C', 'ABC\nx']) {
    expect(KEYS.test(keys), keys).toBe(false)
  }
})

test('the button says some part is on while any of the five parts is', () => {
  const off = { ...DEFAULTS, paths: false, jira: false, images: false, draft: false, commands: false }

  expect(isActive(off)).toBe(false)

  for (const part of ['paths', 'jira', 'images', 'draft', 'commands'] as const) {
    expect(isActive({ ...off, [part]: true }), part).toBe(true)
  }

  // The rest of the settings are no part.
  expect(isActive({ ...off, title: true, resend: true })).toBe(false)
})

test('nothing typed is never refused, anything else is when it does not fit', () => {
  expect(isRefused('', SITE)).toBe(false)
  expect(isRefused('https://a.net', SITE)).toBe(false)
  expect(isRefused('a.net', SITE)).toBe(true)
})

test('a count is a whole number within its bounds', () => {
  expect(countOf('10', 10, 80)).toBe(10)
  expect(countOf('80', 10, 80)).toBe(80)
  expect(countOf('45', 10, 80)).toBe(45)
  expect(countOf('9', 10, 80)).toBeUndefined()
  expect(countOf('81', 10, 80)).toBeUndefined()
  expect(countOf('4.5', 3, 20)).toBeUndefined()
  expect(countOf('ten', 3, 20)).toBeUndefined()
  expect(countOf('', 3, 20)).toBeUndefined()
})

test('settings differ as soon as one field does', () => {
  expect(differs(DEFAULTS, { ...DEFAULTS })).toBe(false)

  for (const field of Object.keys(DEFAULTS) as (keyof typeof DEFAULTS)[]) {
    const other =
      typeof DEFAULTS[field] === 'boolean' ? !DEFAULTS[field] : typeof DEFAULTS[field] === 'number' ? 1 : 'x'

    expect(differs({ ...DEFAULTS, [field]: other }, DEFAULTS), field).toBe(true)
  }
})

test('the settings come from the project when it saved some, else from the global ones, else from the defaults', () => {
  expect(provenanceOf({}, {})).toEqual({ source: 'project', isChanged: false, hasProject: true })
  expect(provenanceOf({}, undefined)).toEqual({ source: 'project', isChanged: false, hasProject: true })
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
