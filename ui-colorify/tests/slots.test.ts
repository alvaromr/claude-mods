import { expect, test } from 'claude-code/testing'
import type { RenderNode } from 'claude-code'

import { slotted } from '../hooks/slots'

const node = (type: string, key?: unknown, children: RenderNode[] = []) =>
  ({ type, props: key === undefined ? {} : { key }, children }) as unknown as RenderNode

const COLUMN = { type: 'Box', props: { flexDirection: 'column' } }
const ROW = { type: 'Box', props: { width: '100%', gap: 2 } }

test('the own element is laid in its row after what the engine draws', () => {
  const beneath = node('Box', undefined, ['engine', node('Text', 'footer')])
  const own = node('Text', 'slot:1.5:ui-colorify')

  expect(slotted(beneath, own)).toEqual({ ...COLUMN, children: [beneath, { ...ROW, children: [own] }] })
})

test('a text beneath is kept whole', () => {
  const own = node('Text', 'slot:1.5:own')

  expect(slotted('plain', own)).toEqual({ ...COLUMN, children: ['plain', { ...ROW, children: [own] }] })
})

test('the slots of every mod are taken out of what is beneath and laid in rows by number, each in its places order', () => {
  const a = node('Text', 'slot:2:a')
  const b = node('Text', 'slot:1.2:b')
  const c = node('Text', 'slot:1.1:c')
  const d = node('Text', 'slot:1:d')
  const own = node('Text', 'slot:1.5:own')
  const beneath = node('Box', undefined, ['kept', a, b, c, d])

  expect(slotted(beneath, own)).toEqual({
    ...COLUMN,
    children: [node('Box', undefined, ['kept']), { ...ROW, children: [c, b, own, d] }, { ...ROW, children: [a] }],
  })
})

test('slots with no place, or the same one, keep their order of arrival, after the placed ones', () => {
  const first = node('Text', 'slot:1:first')
  const second = node('Text', 'slot:1:second')
  const tied = node('Text', 'slot:1.3:tied')
  const own = node('Text', 'slot:1.3:own')
  const placedFirst = node('Text', 'slot:1.0:placed')

  expect(slotted(node('Box', undefined, [first, tied, second, placedFirst]), own)).toEqual({
    ...COLUMN,
    children: [{ ...ROW, children: [placedFirst, tied, own, first, second] }],
  })
})

test('a slot deep in the tree is taken out, and the boxes it leaves empty with it', () => {
  const slot = node('Text', 'slot:3:deep')
  const own = node('Text', 'slot:1.5:own')
  const beneath = node('Box', undefined, [node('Box', undefined, [node('Box', undefined, [slot])]), 'tail'])

  expect(slotted(beneath, own)).toEqual({
    ...COLUMN,
    children: [node('Box', undefined, ['tail']), { ...ROW, children: [own] }, { ...ROW, children: [slot] }],
  })
})

test('nothing of the tree is left when it held only slots', () => {
  const slot = node('Text', 'slot:3:deep')
  const own = node('Text', 'slot:1.5:own')

  expect(slotted(node('Box', undefined, [node('Box', undefined, [slot])]), own)).toEqual({
    ...COLUMN,
    children: [
      { ...ROW, children: [own] },
      { ...ROW, children: [slot] },
    ],
  })
})

test('a tree with no slot, empty boxes and keys that are no slots included, is kept as it is', () => {
  const empty = node('Box')
  const keyed = node('Text', 'my-slot:1:no')
  const near = node('Text', 'slotted:1:no')
  const numbered = node('Text', 7)
  const beneath = node('Box', undefined, [empty, keyed, near, numbered])

  expect(slotted(beneath, node('Text', 'slot:1:own'))).toEqual({
    ...COLUMN,
    children: [beneath, { ...ROW, children: [node('Text', 'slot:1:own')] }],
  })
})
