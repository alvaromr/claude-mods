import { expect, test } from 'claude-code/testing'

import { nextMove } from '../hooks/moves'

const MOVE = { to: '/work/other', reported: '/work/app' }

test('a new session forgets the move', () => {
  expect(nextMove(MOVE, { kind: 'started' })).toBeUndefined()
  expect(nextMove(undefined, { kind: 'started' })).toBeUndefined()
})

test('a move replaces the one before, with the folder the session reported at it', () => {
  expect(nextMove(MOVE, { kind: 'moved', to: '/work/third', reported: null })).toEqual({
    to: '/work/third',
    reported: null,
  })
  expect(nextMove(undefined, { kind: 'moved', to: '/work/other', reported: '/work/app' })).toEqual(MOVE)
})

test('a read keeps the move while the session still reports the folder it did at it', () => {
  expect(nextMove(MOVE, { kind: 'read', now: '/work/app' })).toBe(MOVE)
})

test('a read keeps the move while the session’s folder cannot be read', () => {
  expect(nextMove(MOVE, { kind: 'read', now: null })).toBe(MOVE)
})

test('a read forgets the move once the session reports another folder', () => {
  expect(nextMove(MOVE, { kind: 'read', now: '/work/third' })).toBeUndefined()
  expect(nextMove({ to: '/work/other', reported: null }, { kind: 'read', now: '/work/app' })).toBeUndefined()
})

test('a read of a session that has no move leaves none', () => {
  expect(nextMove(undefined, { kind: 'read', now: '/work/app' })).toBeUndefined()
  expect(nextMove(undefined, { kind: 'read', now: null })).toBeUndefined()
})
