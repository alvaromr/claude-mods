import { expect, test } from 'claude-code/testing'

import { fileUrl, pathOf, placeOf, stillMoved } from '../hooks/path'
import { DEFAULTS } from '../hooks/preferences'

const HOME = '/Users/me'

test('a file link has each part of the path percent-encoded, parentheses too', () => {
  expect(fileUrl('/Users/me/my app')).toBe('file:///Users/me/my%20app')
  expect(fileUrl('/Users/me/a (b)/c#d')).toBe('file:///Users/me/a%20%28b%29/c%23d')
  expect(fileUrl('/work/año')).toBe('file:///work/a%C3%B1o')
  expect(fileUrl('/')).toBe('file:///')
})

test('a move holds while the session still reports the folder it did at the move', () => {
  const moved = { to: '/work/other', reported: '/work/app' }

  expect(stillMoved(moved, '/work/app')).toBe('/work/other')
})

test('a move holds while the session reports none', () => {
  expect(stillMoved({ to: '/work/other', reported: '/work/app' }, null)).toBe('/work/other')
})

test('a move ends once the session reports another folder', () => {
  expect(stillMoved({ to: '/work/other', reported: '/work/app' }, '/work/third')).toBeUndefined()
  expect(stillMoved({ to: '/work/other', reported: null }, '/work/app')).toBeUndefined()
})

test('there is no move to hold where there was none', () => {
  expect(stillMoved(undefined, '/work/app')).toBeUndefined()
  expect(stillMoved(undefined, null)).toBeUndefined()
})

test('the folder shown is the session’s, with the home folder the environment tells', () => {
  expect(placeOf('/work/app', HOME)).toEqual({ cwd: '/work/app', home: HOME })
})

test('where the environment tells no home folder, the place has none', () => {
  expect(placeOf('/work/app', undefined)).toEqual({ cwd: '/work/app', home: null })
  expect(placeOf('/work/app', null)).toEqual({ cwd: '/work/app', home: null })
})

test('where the session tells no folder, there is no place', () => {
  expect(placeOf(null, HOME)).toBeNull()
})

test('a folder under home is written from ~, split into the folders above and its own name', () => {
  expect(pathOf({ cwd: `${HOME}/proj/app`, home: HOME }, DEFAULTS)).toEqual({ name: 'app', parents: '~/proj/' })
})

test('home itself is ~ with nothing above it', () => {
  expect(pathOf({ cwd: HOME, home: HOME }, DEFAULTS)).toEqual({ name: '~', parents: '' })
})

test('a folder outside home, or beside it with the same beginning, is written whole', () => {
  expect(pathOf({ cwd: '/work/app', home: HOME }, DEFAULTS)).toEqual({ name: 'app', parents: '/work/' })
  expect(pathOf({ cwd: '/Users/mexico/x', home: HOME }, DEFAULTS)).toEqual({ name: 'x', parents: '/Users/mexico/' })
})

test('home is kept whole when the settings say so, or the environment tells none', () => {
  const found = { cwd: `${HOME}/proj`, home: HOME }

  expect(pathOf(found, { ...DEFAULTS, showTilde: false })).toEqual({ name: 'proj', parents: `${HOME}/` })
  expect(pathOf({ ...found, home: null }, DEFAULTS)).toEqual({ name: 'proj', parents: `${HOME}/` })
})

test('the root is its own name', () => {
  expect(pathOf({ cwd: '/', home: HOME }, DEFAULTS)).toEqual({ name: '/', parents: '' })
})
