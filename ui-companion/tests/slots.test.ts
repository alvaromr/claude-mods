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
  const laid = slotted(draw(box('engine')), draw(box('slot:1.2:ui-companion')))

  expect(laid).toEqual({
    type: 'Box',
    props: { flexDirection: 'column' },
    children: [
      box('engine'),
      { type: 'Box', props: { width: '100%', gap: 2 }, children: [box('slot:1.2:ui-companion')] },
    ],
  })
})

test('elements of other mods are taken out of the tree and laid by row, then by place', () => {
  const beneath = box(undefined, [box('engine'), box('slot:9.1:git'), box('slot:1.4:linkify'), box('slot:1.1:mods')])
  const laid = slotted(draw(beneath), draw(box('slot:1.2:ui-companion')))

  expect(rows(laid)).toEqual([['slot:1.1:mods', 'slot:1.2:ui-companion', 'slot:1.4:linkify'], ['slot:9.1:git']])
  expect(((laid as Node).children ?? [])[0]).toEqual(box(undefined, [box('engine')]))
})

test('a Box left empty by what is taken out goes with it', () => {
  const beneath = box(undefined, [box(undefined, [box('slot:1.1:mods')]), box('engine')])
  const laid = slotted(draw(beneath), draw(box('slot:1.2:ui-companion')))

  expect(((laid as Node).children ?? [])[0]).toEqual(box(undefined, [box('engine')]))
})

test('with nothing left beneath, only the rows are drawn', () => {
  const laid = slotted(draw(box('slot:1.1:mods')), draw(box('slot:1.2:ui-companion')))

  expect(rows(laid)).toEqual([['slot:1.1:mods', 'slot:1.2:ui-companion']])
  expect((laid as Node).children).toHaveLength(1)
})

test('two elements of one place keep their order of arrival, and one with no place comes last', () => {
  const beneath = box(undefined, [box('slot:1:mods'), box('slot:1.1:first'), box('slot:1.1:second')])
  const laid = slotted(draw(beneath), draw(box('slot:1.1:ui-companion')))

  expect(rows(laid)).toEqual([['slot:1.1:first', 'slot:1.1:second', 'slot:1.1:ui-companion', 'slot:1:mods']])
})

test('text and a tree with no slots beneath are left as drawn', () => {
  const text = slotted('texto', draw(box('slot:1.2:ui-companion')))
  const tree = slotted(draw(box(undefined, [box('a'), box('b')])), draw(box('slot:1.2:x')))

  expect(((text as unknown as Node).children ?? [])[0]).toBe('texto')
  expect(((tree as unknown as Node).children ?? [])[0]).toEqual(box(undefined, [box('a'), box('b')]))
})
