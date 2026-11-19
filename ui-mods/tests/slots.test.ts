import { expect, test } from 'claude-code/testing'
import type { RenderNode } from 'claude-code'

import { slotted } from '../hooks/slots'

type Node = { type: string; props: Record<string, unknown>; children?: Node[] }

const box = (key: string | undefined, children?: Node[]): Node => ({
  type: 'Box',
  props: key === undefined ? {} : { key },
  ...(children ? { children } : {}),
})
const draw = (node: Node) => node as unknown as RenderNode

// The keys of a row's items, from the tree `slotted` lays out.
const rows = (laid: unknown) =>
  ((laid as Node).children ?? [])
    .filter(row => row.props.width === '100%')
    .map(row => (row.children ?? []).map(item => item.props.key ?? item.type))

test('the mod’s own element is laid in a row after what is drawn beneath', () => {
  const laid = slotted(draw(box('engine')), draw(box('slot:1.1:ui-mods')))

  expect(laid).toEqual({
    type: 'Box',
    props: { flexDirection: 'column' },
    children: [box('engine'), { type: 'Box', props: { width: '100%', gap: 2 }, children: [box('slot:1.1:ui-mods')] }],
  })
})

test('elements of other mods are taken out of the tree and laid by row, then by place', () => {
  const beneath = box(undefined, [
    box('engine'),
    box('slot:9.1:git'),
    box('slot:1.4:linkify'),
    box('slot:1.2:companion'),
  ])
  const laid = slotted(draw(beneath), draw(box('slot:1.1:ui-mods')))

  expect(rows(laid)).toEqual([['slot:1.1:ui-mods', 'slot:1.2:companion', 'slot:1.4:linkify'], ['slot:9.1:git']])
  expect(((laid as Node).children ?? [])[0]).toEqual(box(undefined, [box('engine')]))
})

test('the rows go in their numbers’ order, not the order they arrive in', () => {
  const beneath = box(undefined, [box('slot:10.1:path'), box('slot:9.1:git'), box('slot:0.1:limits')])
  const laid = slotted(draw(beneath), draw(box('slot:1.1:ui-mods')))

  expect(rows(laid)).toEqual([['slot:0.1:limits'], ['slot:1.1:ui-mods'], ['slot:9.1:git'], ['slot:10.1:path']])
})

test('a Box left empty by what is taken out goes with it', () => {
  const beneath = box(undefined, [box(undefined, [box('slot:1.2:companion')]), box('engine')])
  const laid = slotted(draw(beneath), draw(box('slot:1.1:ui-mods')))

  expect(((laid as Node).children ?? [])[0]).toEqual(box(undefined, [box('engine')]))
})

test('with nothing left beneath, only the rows are drawn', () => {
  const laid = slotted(draw(box('slot:1.2:companion')), draw(box('slot:1.1:ui-mods')))

  expect(rows(laid)).toEqual([['slot:1.1:ui-mods', 'slot:1.2:companion']])
  expect((laid as Node).children).toHaveLength(1)
})

test('two elements of one place keep their order of arrival, and one with no place comes last', () => {
  const beneath = box(undefined, [box('slot:1:first'), box('slot:1.1:second'), box('slot:1.1:third')])
  const laid = slotted(draw(beneath), draw(box('slot:1.1:ui-mods')))

  expect(rows(laid)).toEqual([['slot:1.1:second', 'slot:1.1:third', 'slot:1.1:ui-mods', 'slot:1:first']])
})

test('an element taken out is the one with a slot key, and one keyed otherwise stays', () => {
  const beneath = box(undefined, [box('slotted'), box('engine'), box('slot:x:y')])
  const laid = slotted(draw(beneath), draw(box('slot:1.1:ui-mods')))

  expect(((laid as Node).children ?? [])[0]).toEqual(box(undefined, [box('slotted'), box('engine'), box('slot:x:y')]))
})

test('text and a tree with no slots beneath are left as drawn', () => {
  const text = slotted('texto', draw(box('slot:1.1:ui-mods')))
  const tree = slotted(draw(box(undefined, [box('a'), box('b')])), draw(box('slot:1.1:ui-mods')))

  expect(((text as unknown as Node).children ?? [])[0]).toBe('texto')
  expect(((tree as unknown as Node).children ?? [])[0]).toEqual(box(undefined, [box('a'), box('b')]))
})
