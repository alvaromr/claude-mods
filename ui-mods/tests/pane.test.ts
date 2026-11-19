import { expect, test } from 'claude-code/testing'

import type { Mod } from '../types'
import { activeOf, BOXES, groupsOf, hoverBgOf } from '../hooks/pane'
import { TEXT } from '../hooks/text'

const mod = (id: string, extra: Partial<Mod> = {}): Mod => ({ id, isEnabled: true, description: `de ${id}`, ...extra })

test('a full square is a mod on and an empty one a mod off', () => {
  expect(BOXES).toEqual(['■', '□'])
})

test('the desktop app lights the row under the pointer with a faint wash, the terminal with a solid ground', () => {
  expect(hoverBgOf('desktop')).toBe('#8080801f')
  expect(hoverBgOf('terminal')).toBe('#3a3f4b')
})

test('the pane counts the mods that are on', () => {
  expect(activeOf([mod('a@m'), mod('b@m', { isEnabled: false }), mod('c@m')])).toBe(2)
  expect(activeOf([])).toBe(0)
})

test('the mods are listed under their marketplace, and in it under their author, with no author told apart', () => {
  const groups = groupsOf(
    [
      mod('a@one', { author: 'Ana' }),
      mod('b@two'),
      mod('c@one', { author: 'Beto' }),
      mod('d@one', { author: 'Ana' }),
      mod('e@one'),
    ],
    [],
    [],
  )

  expect(
    groups.map(({ market, authors }) => [market, authors.map(({ author, rows }) => [author, rows.map(row => row.id)])]),
  ).toEqual([
    [
      'one',
      [
        ['Ana', ['a@one', 'd@one']],
        ['Beto', ['c@one']],
        [TEXT.noAuthor, ['e@one']],
      ],
    ],
    ['two', [[TEXT.noAuthor, ['b@two']]]],
  ])
})

test('a mod with no marketplace is listed under an empty one, and its name is its whole id', () => {
  const [group] = groupsOf([mod('lonely')], [], [])

  expect(group?.market).toBe('')
  expect(group?.authors[0]?.rows[0]?.name).toBe('lonely')
})

test('a row is named by its plugin’s name, and carries the mod’s state and description', () => {
  const [group] = groupsOf([mod('pet@market', { isEnabled: false, description: 'Un bicho.' })], [], [])

  expect(group?.authors[0]?.rows[0]).toEqual({
    id: 'pet@market',
    name: 'pet',
    isEnabled: false,
    isLocked: false,
    isPending: false,
    isOpen: false,
    description: 'Un bicho.',
  })
})

test('a locked mod’s row says so', () => {
  const [group] = groupsOf([mod('sec@builtin', { isLocked: true })], [], [])

  expect(group?.authors[0]?.rows[0]?.isLocked).toBe(true)
})

test('a plugin installed in more than one scope names its scope on each row, in the person’s language', () => {
  const rows = groupsOf([mod('pet@market', { scope: 'user' }), mod('pet@market', { scope: 'project' })], [], [])[0]
    ?.authors[0]?.rows

  expect(rows?.map(row => row.name)).toEqual([
    TEXT.inScope('pet', TEXT.scopes.user ?? ''),
    TEXT.inScope('pet', TEXT.scopes.project ?? ''),
  ])
})

test('a scope the person has no word for is named as it comes', () => {
  const rows = groupsOf([mod('pet@market', { scope: 'managed' }), mod('pet@market', { scope: 'user' })], [], [])[0]
    ?.authors[0]?.rows

  expect(rows?.[0]?.name).toBe(TEXT.inScope('pet', 'managed'))
})

test('a plugin installed in one scope only does not name it, nor does one in two scopes of different ids', () => {
  const rows = groupsOf([mod('pet@market', { scope: 'user' }), mod('cat@market', { scope: 'user' })], [], [])[0]
    ?.authors[0]?.rows

  expect(rows?.map(row => row.name)).toEqual(['pet', 'cat'])
})

test('a row is told apart by its key, the scope included, for what is pending and unfolded', () => {
  const rows = groupsOf(
    [mod('pet@market', { scope: 'user' }), mod('pet@market', { scope: 'project' }), mod('cat@market')],
    ['pet@market:project'],
    ['cat@market', 'pet@market:user'],
  )[0]?.authors[0]?.rows

  expect(rows?.map(row => [row.id, row.isPending, row.isOpen])).toEqual([
    ['pet@market:user', false, true],
    ['pet@market:project', true, false],
    ['cat@market', false, true],
  ])
})
