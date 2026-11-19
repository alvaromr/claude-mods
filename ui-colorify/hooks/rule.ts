import type { RenderElement } from 'claude-code'

/**
 * No Box draws a border on two sides alone: a line above or below is a Text
 * as wide as the row, cut at its edge rather than wrapped.
 */
export const rule = (columns: number, color: string, dashed: boolean): RenderElement => ({
  type: 'Text',
  props: { color, wrap: 'truncate-end' },
  children: [(dashed ? '╌' : '─').repeat(Math.max(1, columns))],
})
