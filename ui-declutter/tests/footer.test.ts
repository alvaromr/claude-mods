import { expect, test } from 'claude-code/testing'
import type { RenderNode } from 'claude-code'

import { slotted } from '../hooks/footer'

const box = (key: string | undefined, ...children: (RenderNode | string)[]) =>
  ({ type: 'Box', props: key === undefined ? {} : { key }, children }) as unknown as RenderNode
const row = (...items: RenderNode[]) => ({ type: 'Box', props: { width: '100%', gap: 2 }, children: items })
const footer = (...children: unknown[]) => ({ type: 'Box', props: { flexDirection: 'column' }, children })

test("an element slotted by any mod is laid with this mod's, in its row, by its place", () => {
  const taken = box('slot:1.2:other', 'B')
  const own = box('slot:1.1:mine', 'A')

  expect(slotted(box(undefined, 'engine', taken), [own])).toEqual(footer(box(undefined, 'engine'), row(own, taken)))
})

test("rows come in their numbers' order after the rest, each place by its number, none last", () => {
  const second = box('slot:2:other', 'C')
  const placed = box('slot:1.5:other', 'B')
  const first = box('slot:1.1:other', 'A')

  expect(slotted(box(undefined, second, placed), [first])).toEqual(footer(row(first, placed), row(second)))
})

test('elements of one place keep their order of arrival', () => {
  const a = box('slot:1.1:a', 'A')
  const b = box('slot:1.1:b', 'B')

  expect(slotted(box(undefined, a), [b])).toEqual(footer(row(a, b)))
})

test('a Box the slots leave empty goes with them', () => {
  const taken = box('slot:1.1:other', 'A')

  expect(slotted(box(undefined, box(undefined, taken), 'rest'), [])).toEqual(footer(box(undefined, 'rest'), row(taken)))
  expect(slotted(box(undefined, box(undefined, taken)), [])).toEqual(footer(row(taken)))
})

test('a tree with no slot is the rest, as it was, with nothing laid beneath', () => {
  const tree = box(undefined, 'engine', box('other', 'x'))
  const { children } = slotted(tree, []) as unknown as { children: unknown[] }

  expect(slotted(tree, [])).toEqual(footer(tree))
  expect(children[0]).toBe(tree)
})

test('a key that only contains a slot is no slot', () => {
  const tree = box(undefined, box('my-slot:1.1:other', 'x'))

  expect(slotted(tree, [])).toEqual(footer(tree))
})
