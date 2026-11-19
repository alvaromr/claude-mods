import { expect, test } from 'claude-code/testing'
import type { RenderNode } from 'claude-code'

import { slotted } from '../hooks/slots'

const node = (type: string, key?: string, children: RenderNode[] = []) =>
  ({ type, props: key === undefined ? {} : { key }, children }) as unknown as RenderNode

const BAND = { type: 'Box', props: { flexDirection: 'column' } }
const ROW = { type: 'Box', props: { width: '100%', gap: 2 } }

test('the own slot is laid with the others, after what the engine draws', () => {
  const own = node('Text', 'slot:1.4:own')
  const beneath = node('Box', undefined, ['engine', node('Text', 'footer')])

  expect(slotted(beneath, own)).toEqual({ ...BAND, children: [beneath, { ...ROW, children: [own] }] })
})

test('a text beneath is kept whole', () => {
  const own = node('Text', 'slot:1.4:own')

  expect(slotted('plain', own)).toEqual({ ...BAND, children: ['plain', { ...ROW, children: [own] }] })
})

test('the slots of every mod are taken out of what is beneath and laid in rows, in their numbers’ and places’ order', () => {
  const a = node('Text', 'slot:2:a')
  const b = node('Text', 'slot:1.5:b')
  const c = node('Text', 'slot:1.3:c')
  const d = node('Text', 'slot:1:d')
  const own = node('Text', 'slot:1.4:own')
  const beneath = node('Box', undefined, ['kept', a, b, c, d])

  expect(slotted(beneath, own)).toEqual({
    ...BAND,
    children: [node('Box', undefined, ['kept']), { ...ROW, children: [c, own, b, d] }, { ...ROW, children: [a] }],
  })
})

test('slots with no place, or the same one, keep their order of arrival, after the placed ones', () => {
  const first = node('Text', 'slot:1:first')
  const second = node('Text', 'slot:1:second')
  const tied = node('Text', 'slot:1.4:tied')
  const earlier = node('Text', 'slot:1.4:earlier')
  const placedFirst = node('Text', 'slot:1.0:placed')
  const own = node('Text', 'slot:1.4:own')

  expect(slotted(node('Box', undefined, [first, tied, second, earlier, placedFirst]), own)).toEqual({
    ...BAND,
    children: [{ ...ROW, children: [placedFirst, tied, earlier, own, first, second] }],
  })
})

test('a slot deep in the tree is taken out, and the boxes it leaves empty with it', () => {
  const slot = node('Text', 'slot:3:deep')
  const own = node('Text', 'slot:1.4:own')
  const beneath = node('Box', undefined, [node('Box', undefined, [node('Box', undefined, [slot])]), 'tail'])

  expect(slotted(beneath, own)).toEqual({
    ...BAND,
    children: [node('Box', undefined, ['tail']), { ...ROW, children: [own] }, { ...ROW, children: [slot] }],
  })
})

test('nothing of the tree is left when it held only slots', () => {
  const slot = node('Text', 'slot:1.1:only')
  const own = node('Text', 'slot:1.4:own')

  expect(slotted(node('Box', undefined, [slot]), own)).toEqual({
    ...BAND,
    children: [{ ...ROW, children: [slot, own] }],
  })
})

test('a box that holds no slot is kept as it is, even empty', () => {
  const empty = node('Box')
  const own = node('Text', 'slot:1.4:own')

  expect(slotted(empty, own)).toEqual({ ...BAND, children: [empty, { ...ROW, children: [own] }] })
})

test('an element whose key only resembles a slot stays where it is', () => {
  const own = node('Text', 'slot:1.4:own')
  const beneath = node('Box', undefined, [
    node('Text', 'slotted:1:x'),
    node('Text', 'my-slot:1:x'),
    node('Text', 'slot:x'),
    node('Text'),
  ])

  expect(slotted(beneath, own)).toEqual({ ...BAND, children: [beneath, { ...ROW, children: [own] }] })
})
