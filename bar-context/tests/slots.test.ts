import { expect, test } from 'claude-code/testing'
import type { RenderNode } from 'claude-code'

import { placed } from '../hooks/slots'

const node = (type: string, key?: string, children: RenderNode[] = []) =>
  ({ type, props: key === undefined ? {} : { key }, children }) as unknown as RenderNode

const BAND = { type: 'Box', props: { flexDirection: 'column' } }
const ROW = { type: 'Box', props: { width: '100%', gap: 2 } }

test('a row with no slots beneath is laid after what the engine draws', () => {
  const beneath = node('Box', undefined, ['engine', node('Text', 'footer')])
  const own = node('Text', 'own')

  expect(placed(beneath, own)).toEqual({ ...BAND, children: [beneath, own] })
})

test('a text beneath is kept whole', () => {
  expect(placed('plain', node('Text'))).toEqual({ ...BAND, children: ['plain', node('Text')] })
})

test('the slots of every mod are taken out of what is beneath and laid in rows after the own row', () => {
  const a = node('Text', 'slot:2:a')
  const b = node('Text', 'slot:1.2:b')
  const c = node('Text', 'slot:1.1:c')
  const d = node('Text', 'slot:1:d')
  const beneath = node('Box', undefined, ['kept', a, b, c, d])
  const own = node('Text', 'own')

  expect(placed(beneath, own)).toEqual({
    ...BAND,
    children: [node('Box', undefined, ['kept']), own, { ...ROW, children: [c, b, d] }, { ...ROW, children: [a] }],
  })
})

test('slots with no place, or the same one, keep their order of arrival, after the placed ones', () => {
  const first = node('Text', 'slot:1:first')
  const second = node('Text', 'slot:1:second')
  const tied = node('Text', 'slot:1.3:tied')
  const earlier = node('Text', 'slot:1.3:earlier')
  const placedFirst = node('Text', 'slot:1.0:placed')

  expect(placed(node('Box', undefined, [first, tied, second, earlier, placedFirst]), 'own')).toEqual({
    ...BAND,
    children: ['own', { ...ROW, children: [placedFirst, tied, earlier, first, second] }],
  })
})

test('a slot deep in the tree is taken out, and the boxes it leaves empty with it', () => {
  const slot = node('Text', 'slot:3:deep')
  const beneath = node('Box', undefined, [node('Box', undefined, [node('Box', undefined, [slot])]), 'tail'])

  expect(placed(beneath, 'own')).toEqual({
    ...BAND,
    children: [node('Box', undefined, ['tail']), 'own', { ...ROW, children: [slot] }],
  })
})

test('nothing of the tree is left when it held only slots', () => {
  const slot = node('Text', 'slot:1:only')

  expect(placed(node('Box', undefined, [slot]), 'own')).toEqual({
    ...BAND,
    children: ['own', { ...ROW, children: [slot] }],
  })
})

test('an element whose key only resembles a slot stays where it is', () => {
  const beneath = node('Box', undefined, [
    node('Text', 'slotted:1:x'),
    node('Text', 'my-slot:1:x'),
    node('Text', 'slot:x'),
  ])

  expect(placed(beneath, 'own')).toEqual({ ...BAND, children: [beneath, 'own'] })
})
