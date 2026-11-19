export type Row = {
  /** What tells the row from the rest: the mod's id, and its scope where it has one. */
  id: string
  name: string
  isEnabled: boolean
  /** No switch turns it off: a press on its checkbox unfolds it, as on the rest of the row. */
  isLocked: boolean
  isPending: boolean
  isOpen: boolean
  description: string
}
/** A marketplace's mods, one list to each author. */
export type Group = { market: string; authors: { author: string; rows: Row[] }[] }
/** `boxes`: the checkbox drawn on and off; `hoverBg`: the ground of the row under the pointer. */
export type RowsProps = { groups: Group[]; boxes: [string, string]; hoverBg: string }

export type Line = {
  id: string
  kind: 'gap' | 'market' | 'author' | 'mod' | 'text'
  text: string
  row?: Row
  count?: number
}

// Columns each level of the list goes in by.
export const STEP = 2

// Word-wrapped to the room, one string per line; a word wider than it is cut.
export const wrap = (text: string, width: number) =>
  text
    .split(/\s+/)
    .filter(Boolean)
    .reduce<string[]>((lines, word) => {
      const last = lines[lines.length - 1]

      return last !== undefined && last.length + 1 + word.length <= width
        ? [...lines.slice(0, -1), `${last} ${word}`]
        : [...lines, word.slice(0, width)]
    }, [])

/**
 * The columns a press is a switch's in: the checkbox, a space, and the row's
 * padding and indent on its left: an author's line one step in from its
 * marketplace's, a mod's one more.
 */
export const checkWidth = (boxes: [string, string]) => Array.from(boxes[0]).length + 2 + 2 * STEP

/** The columns a description is wrapped to: what is left of the surface's after the checkbox, never under 20. */
export const roomFor = (columns: number, check: number) => Math.max(20, columns - check - 1)

/**
 * The lines of the list, one to each: a gap between marketplaces, each
 * marketplace and author with its count of mods, each mod and, unfolded, its
 * description wrapped to `room`.
 */
export const linesOf = (groups: readonly Group[], room: number): Line[] =>
  groups.flatMap((group, index) => [
    ...(index > 0 ? [{ id: '', kind: 'gap' as const, text: '' }] : []),
    {
      id: '',
      kind: 'market' as const,
      text: group.market,
      count: group.authors.reduce((sum, { rows }) => sum + rows.length, 0),
    },
    ...group.authors.flatMap(({ author, rows }) => [
      { id: '', kind: 'author' as const, text: author, count: rows.length },
      ...rows.flatMap(row => [
        { id: row.id, kind: 'mod' as const, text: row.name, row },
        ...(row.isOpen ? wrap(row.description, room).map(text => ({ id: row.id, kind: 'text' as const, text })) : []),
      ]),
    ]),
  ])

/**
 * What a pointer event on the list does: the row it lights (`hover`, none when
 * it leaves or is over a line with no row) and, for a press of the left button
 * on a row, what to post: `{ toggle }` on the checkbox of a mod that can be
 * switched, `{ fold }` anywhere else on the row or its description.
 */
export const pointed = (
  lines: readonly Line[],
  check: number,
  e: { type: string; x: number; y: number; button?: string },
): { hover: string; post?: { toggle: string } | { fold: string } } => {
  const line = e.type === 'leave' ? undefined : lines[e.y]
  const hover = line?.id ?? ''

  if (e.type === 'down' && (e.button ?? 'left') === 'left' && hover !== '') {
    const isSwitch = line?.kind === 'mod' && line.row?.isLocked !== true && e.x < check

    return { hover, post: isSwitch ? { toggle: hover } : { fold: hover } }
  }

  return { hover }
}

/** The ground of a line: the row under the pointer's, none for any other. */
export const groundOf = (id: string, hover: string, hoverBg: string) =>
  id !== '' && id === hover ? hoverBg : undefined
