import { expect, test } from 'claude-code/testing'

import { checkWidth, groundOf, linesOf, pointed, roomFor, STEP, wrap } from '../hooks/list'
import type { Group, Row } from '../hooks/list'

const row = (id: string, extra: Partial<Row> = {}): Row => ({
  id,
  name: id,
  isEnabled: true,
  isLocked: false,
  isPending: false,
  isOpen: false,
  description: `descripción de ${id}`,
  ...extra,
})
const GROUPS: Group[] = [
  {
    market: 'one',
    authors: [
      { author: 'Ana', rows: [row('a'), row('b')] },
      { author: 'Beto', rows: [row('c')] },
    ],
  },
  { market: 'two', authors: [{ author: 'Cris', rows: [row('d')] }] },
]

test('a description is wrapped to the room, a word to a line when none fits beside it', () => {
  expect(wrap('uno dos tres cuatro', 8)).toEqual(['uno dos', 'tres', 'cuatro'])
  expect(wrap('uno dos', 7)).toEqual(['uno dos'])
  expect(wrap('uno dos', 6)).toEqual(['uno', 'dos'])
})

test('a word wider than the room is cut, and any run of blanks is one space', () => {
  expect(wrap('abcdefghij', 4)).toEqual(['abcd'])
  expect(wrap('  uno \n\t dos  ', 20)).toEqual(['uno dos'])
  expect(wrap('', 20)).toEqual([])
})

test('the columns before a description are the checkbox, a space and the indent of a mod', () => {
  expect(checkWidth(['■', '□'])).toBe(1 + 2 + 2 * STEP)
  expect(checkWidth(['[x]', '[ ]'])).toBe(3 + 2 + 2 * STEP)
  expect(checkWidth(['😀', '□'])).toBe(1 + 2 + 2 * STEP)
})

test('a description is wrapped to what is left of the columns, never under 20', () => {
  expect(roomFor(80, 7)).toBe(72)
  expect(roomFor(30, 7)).toBe(22)
  expect(roomFor(27, 7)).toBe(20)
  expect(roomFor(10, 7)).toBe(20)
})

test('the list has a line for each marketplace, author and mod, with a gap between marketplaces', () => {
  expect(linesOf(GROUPS, 40).map(({ kind, text }) => [kind, text])).toEqual([
    ['market', 'one'],
    ['author', 'Ana'],
    ['mod', 'a'],
    ['mod', 'b'],
    ['author', 'Beto'],
    ['mod', 'c'],
    ['gap', ''],
    ['market', 'two'],
    ['author', 'Cris'],
    ['mod', 'd'],
  ])
})

test('a marketplace counts its mods, and an author its own', () => {
  const lines = linesOf(GROUPS, 40)

  expect(lines.filter(line => line.kind === 'market').map(line => line.count)).toEqual([3, 1])
  expect(lines.filter(line => line.kind === 'author').map(line => line.count)).toEqual([2, 1, 1])
})

test('a mod’s line carries its row and the id that tells it apart, a heading’s none', () => {
  const lines = linesOf(GROUPS, 40)

  expect(lines[2]).toEqual({ id: 'a', kind: 'mod', text: 'a', row: row('a') })
  expect(lines[0]).toEqual({ id: '', kind: 'market', text: 'one', count: 3 })
  expect(lines[6]).toEqual({ id: '', kind: 'gap', text: '' })
})

test('a mod unfolded has its description under it, wrapped to the room and of its own id', () => {
  const open: Group[] = [
    {
      market: 'one',
      authors: [{ author: 'Ana', rows: [row('a', { isOpen: true, description: 'uno dos tres' }), row('b')] }],
    },
  ]

  expect(linesOf(open, 7).map(({ id, kind, text }) => [id, kind, text])).toEqual([
    ['', 'market', 'one'],
    ['', 'author', 'Ana'],
    ['a', 'mod', 'a'],
    ['a', 'text', 'uno dos'],
    ['a', 'text', 'tres'],
    ['b', 'mod', 'b'],
  ])
})

test('no marketplace, no list', () => {
  expect(linesOf([], 40)).toEqual([])
})

const LINES = linesOf(GROUPS, 40)
const CHECK = checkWidth(['■', '□'])
// The line of the mod `a`, by its place in the list.
const Y = 2

test('the pointer over a row lights it, over a heading or past the end lights none', () => {
  expect(pointed(LINES, CHECK, { type: 'move', x: 3, y: Y })).toEqual({ hover: 'a' })
  expect(pointed(LINES, CHECK, { type: 'move', x: 3, y: 0 })).toEqual({ hover: '' })
  expect(pointed(LINES, CHECK, { type: 'move', x: 3, y: 99 })).toEqual({ hover: '' })
})

test('the pointer leaving the list lights no row', () => {
  expect(pointed(LINES, CHECK, { type: 'leave', x: 3, y: Y })).toEqual({ hover: '' })
})

test('a press with the left button on the checkbox of a mod switches it', () => {
  expect(pointed(LINES, CHECK, { type: 'down', x: 1, y: Y, button: 'left' })).toEqual({
    hover: 'a',
    post: { toggle: 'a' },
  })
  expect(pointed(LINES, CHECK, { type: 'down', x: CHECK - 1, y: Y })).toEqual({ hover: 'a', post: { toggle: 'a' } })
})

test('a press anywhere else on the row, or on its description, unfolds it', () => {
  expect(pointed(LINES, CHECK, { type: 'down', x: CHECK, y: Y, button: 'left' })).toEqual({
    hover: 'a',
    post: { fold: 'a' },
  })

  const open = linesOf([{ market: 'm', authors: [{ author: 'x', rows: [row('a', { isOpen: true })] }] }], 40)

  expect(pointed(open, CHECK, { type: 'down', x: 0, y: 3 })).toEqual({ hover: 'a', post: { fold: 'a' } })
})

test('a press on the checkbox of a locked mod unfolds it, it does not switch', () => {
  const locked = linesOf([{ market: 'm', authors: [{ author: 'x', rows: [row('a', { isLocked: true })] }] }], 40)

  expect(pointed(locked, CHECK, { type: 'down', x: 1, y: 2 })).toEqual({ hover: 'a', post: { fold: 'a' } })
})

test('only a press with the left button acts: not another button, not a move, not a release', () => {
  expect(pointed(LINES, CHECK, { type: 'down', x: 1, y: Y, button: 'right' })).toEqual({ hover: 'a' })
  expect(pointed(LINES, CHECK, { type: 'move', x: 1, y: Y, button: 'left' })).toEqual({ hover: 'a' })
  expect(pointed(LINES, CHECK, { type: 'up', x: 1, y: Y, button: 'left' })).toEqual({ hover: 'a' })
})

test('a press on a heading or a gap posts nothing', () => {
  expect(pointed(LINES, CHECK, { type: 'down', x: 1, y: 0, button: 'left' })).toEqual({ hover: '' })
  expect(pointed(LINES, CHECK, { type: 'down', x: 1, y: 6, button: 'left' })).toEqual({ hover: '' })
})

test('only the row under the pointer has the ground that lights it', () => {
  expect(groundOf('a', 'a', '#333')).toBe('#333')
  expect(groundOf('a', 'b', '#333')).toBeUndefined()
  expect(groundOf('a', '', '#333')).toBeUndefined()
  expect(groundOf('', '', '#333')).toBeUndefined()
})
