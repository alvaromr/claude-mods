import type { RenderElement, RenderNode } from 'claude-code'

type Tree = { type: string; props?: { key?: unknown }; children?: RenderNode[] }

/**
 * The footer's shared rows. An element keyed `slot:<row>.<place>:<mod>`, of any
 * mod, is taken out of the tree drawn beneath, with any Box it leaves empty, and
 * laid with this mod's in its row: rows in their numbers' order after the rest,
 * each in its places' order, first come first served where two share one or
 * give none. Every mod drawing there does the same, so the footer comes out
 * alike whatever order the mods run in.
 */
const SLOT = /^slot:(\d+)(?:\.(\d+))?:/

const unslot = (node: RenderNode): { rest?: RenderNode; taken: RenderNode[] } => {
  if (typeof node === 'string') {
    return { rest: node, taken: [] }
  }

  const { props, children } = node as Tree

  if (SLOT.test(String(props?.key))) {
    return { taken: [node] }
  }

  if (children === undefined || children.length === 0) {
    return { rest: node, taken: [] }
  }

  const parts = children.map(unslot)
  const taken = parts.flatMap(part => part.taken)
  const kept = parts.flatMap(part => (part.rest === undefined ? [] : [part.rest]))

  if (taken.length === 0) {
    return { rest: node, taken }
  }

  return { rest: kept.length === 0 ? undefined : ({ ...(node as Tree), children: kept } as RenderNode), taken }
}

export const slotted = (beneath: RenderNode, own: RenderNode): RenderElement => {
  const { rest, taken } = unslot(beneath)
  const rows = new Map<number, { place: number; item: RenderNode }[]>()

  for (const item of [...taken, own]) {
    const [, row, place] = SLOT.exec(String((item as Tree).props?.key)) ?? []
    const n = Number(row)
    rows.set(n, [...(rows.get(n) ?? []), { place: place === undefined ? Infinity : Number(place), item }])
  }

  // Sorting is stable: equal places keep their order of arrival.
  const laid = [...rows]
    .sort(([a], [b]) => a - b)
    .map(([, items]) => ({
      type: 'Box',
      props: { width: '100%', gap: 2 },
      children: items.sort((a, b) => a.place - b.place).map(({ item }) => item),
    }))

  return {
    type: 'Box',
    props: { flexDirection: 'column' },
    children: [...(rest === undefined ? [] : [rest]), ...laid],
  } as RenderElement
}
