import { expect, test } from 'claude-code/testing'

import { DEFAULTS } from '../hooks/preferences'
import { asCommand, rowOf } from '../hooks/row'
import type { Repo } from '../types'

const PENDING: Repo = { branch: 'main', dirty: 2, added: 14, removed: 3, ahead: 2 }
const CLEAN: Repo = { branch: 'main', dirty: 0, added: 0, removed: 0, ahead: 0 }
const AHEAD: Repo = { ...CLEAN, ahead: 3 }

test('the terminal draws everything there is to draw of a repository with changes', () => {
  expect(rowOf(PENDING, DEFAULTS, 'terminal')).toEqual({
    isTerminal: true,
    hasCommit: true,
    hasIntegrate: true,
    hasLines: true,
    hasChanges: true,
    hasAhead: true,
    hasHead: true,
  })
})

test('a clean repository has the branch alone, and no button', () => {
  expect(rowOf(CLEAN, DEFAULTS, 'terminal')).toEqual({
    isTerminal: true,
    hasCommit: false,
    hasIntegrate: false,
    hasLines: true,
    hasChanges: false,
    hasAhead: false,
    hasHead: true,
  })
})

test('commits no remote has offer to integrate, not to commit', () => {
  expect(rowOf(AHEAD, DEFAULTS, 'terminal')).toMatchObject({ hasCommit: false, hasIntegrate: true, hasAhead: true })
})

test('changes offer to commit, and to integrate them', () => {
  expect(rowOf({ ...CLEAN, dirty: 1 }, DEFAULTS, 'terminal')).toMatchObject({
    hasCommit: true,
    hasIntegrate: true,
    hasAhead: false,
    hasChanges: true,
  })
})

test('each button hides when its setting says so', () => {
  expect(rowOf(PENDING, { ...DEFAULTS, showCommit: false }, 'terminal')).toMatchObject({
    hasCommit: false,
    hasIntegrate: true,
  })
  expect(rowOf(PENDING, { ...DEFAULTS, showIntegrate: false }, 'terminal')).toMatchObject({
    hasCommit: true,
    hasIntegrate: false,
  })
})

test('the files and the lines hide when their settings say so, the changes only when both do', () => {
  const changes = (s: object) => rowOf(PENDING, { ...DEFAULTS, ...s }, 'terminal')?.hasChanges

  expect(changes({ showFiles: false })).toBe(true)
  expect(changes({ showLines: false })).toBe(true)
  expect(changes({ showFiles: false, showLines: false })).toBe(false)
})

test('the lines are left out where they could not be counted', () => {
  const uncounted = { ...PENDING, added: null, removed: null }

  expect(rowOf(uncounted, DEFAULTS, 'terminal')).toMatchObject({ hasLines: false, hasChanges: true })
  expect(rowOf(uncounted, { ...DEFAULTS, showFiles: false }, 'terminal')).toMatchObject({
    hasLines: false,
    hasChanges: false,
  })
  expect(rowOf(PENDING, { ...DEFAULTS, showLines: false }, 'terminal')).toMatchObject({ hasLines: false })
})

test('the commits no remote has hide when the setting says so', () => {
  expect(rowOf(PENDING, { ...DEFAULTS, showAhead: false }, 'terminal')).toMatchObject({ hasAhead: false })
})

test('the branch row hides when neither the icon nor the branch is to show', () => {
  const head = (s: object) => rowOf(PENDING, { ...DEFAULTS, ...s }, 'terminal')?.hasHead

  expect(head({ showIcon: false })).toBe(true)
  expect(head({ showBranch: false })).toBe(true)
  expect(head({ showIcon: false, showBranch: false })).toBe(false)
})

test('a surface that is no terminal draws only the buttons', () => {
  expect(rowOf(PENDING, DEFAULTS, 'mobile')).toEqual({
    isTerminal: false,
    hasCommit: true,
    hasIntegrate: true,
    hasLines: true,
    hasChanges: false,
    hasAhead: false,
    hasHead: false,
  })
})

test('a surface that is no terminal draws nothing where there is no button to show', () => {
  expect(rowOf(CLEAN, DEFAULTS, 'mobile')).toBeNull()
  expect(rowOf(PENDING, { ...DEFAULTS, showCommit: false, showIntegrate: false }, 'mobile')).toBeNull()
})

test('the desktop app draws nothing, since it tells the branch and its changes itself', () => {
  expect(rowOf(PENDING, DEFAULTS, 'desktop')).toBeNull()
})

test('where the folder is no repository nothing is drawn', () => {
  expect(rowOf(null, DEFAULTS, 'terminal')).toBeNull()
})

test('a button whose text starts with a slash is the command it names, with its arguments', () => {
  expect(asCommand('/commit')).toEqual({ command: 'commit', args: '' })
  expect(asCommand('/commit -m "a b"')).toEqual({ command: 'commit', args: '-m "a b"' })
  expect(asCommand('/review  two words\nmore')).toEqual({ command: 'review', args: 'two words\nmore' })
})

test('any other text is a prompt', () => {
  expect(asCommand('haz commit')).toBeUndefined()
  expect(asCommand('haz /commit')).toBeUndefined()
  expect(asCommand(' /commit')).toBeUndefined()
  expect(asCommand('/')).toBeUndefined()
  expect(asCommand('')).toBeUndefined()
})
