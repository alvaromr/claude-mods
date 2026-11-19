import type { ToolGroupCall } from 'claude-code'

import type { Level } from '../types'
import { kindOf } from './calls'
import { idOf, reasonOf } from './conversation'
import type { Edit, Item, Span } from './conversation'
import type { Hunk, Outcome } from './outcome'

// The kinds a span's line holds, the skills apart from the other calls; and
// the files a command changed, there while the edits are and the command is
// not the engine's.
export type Shown = { calls: boolean; skills: boolean; edits: boolean; changes: boolean }
// An edit, or a file a command changed, with its hunks, `null` where unknown.
// `isChange`: a file a command changed, by the command's id; its time is the command's.
export type EditLine = Edit & { hunks: Hunk[] | null; isChange: boolean }

/** What a span's line holds: the kinds in summary; a hidden kind is nowhere, a full one the engine's. */
export const shownFor = ({ diffs, commands, skills }: { diffs: Level; commands: Level; skills: Level }): Shown => ({
  calls: commands === 'summary',
  skills: skills === 'summary',
  edits: diffs === 'summary',
  changes: diffs === 'summary' && commands !== 'full',
})

// Whether a call is in its span's line: a skill by the skills' level, any other by the commands'.
const isCallShown = (call: ToolGroupCall, shown: Shown) => (call.tool === 'Skill' ? shown.skills : shown.calls)

// A command, for the files it may have changed.
const isCommand = (item: Item): item is Extract<Item, { kind: 'calls' }> =>
  item.kind === 'calls' && item.call.tool === 'Bash'

/**
 * A call the conversation does not hold yet, as an item of its span of its
 * own: an edit with its path and, if it failed, why (from its `output`); any
 * other tool's a call.
 */
export const itemOf = (call: ToolGroupCall, output: unknown): Item =>
  kindOf(call.tool) === 'edits'
    ? {
        kind: 'edits',
        edit: {
          id: call.tool_use_id ?? '',
          // eslint-disable-next-line @typescript-eslint/no-base-to-string -- the tool's input comes from the model, so `file_path` may be of any type; the coercion stays as it was
          path: String((call.input as { file_path?: unknown } | undefined)?.file_path ?? ''),
          ...(call.isErrored ? { failure: reasonOf(typeof output === 'string' ? output : '') } : {}),
        },
      }
    : { kind: 'calls', call }

/** Whether a call's row is the engine's: of a run it unfolded, or drawn in full (ctrl+o, --verbose) but for those of a run the mod unfolded. */
export const isEngineRow = (
  id: string,
  isExpanded: boolean | undefined,
  unfolded: ReadonlySet<string>,
  unfoldedHere: ReadonlySet<string>,
) => unfolded.has(id) || (isExpanded === true && !unfoldedHere.has(id))

/** What a run drawn by the engine tells of its calls: unfolded, they are the engine's (and no longer the mod's own unfolding); folded, they go back to their span. */
export const engineUnfolds = (
  ids: readonly string[],
  isExpanded: boolean,
  unfolded: Set<string>,
  unfoldedHere: Set<string>,
) => {
  for (const id of ids) {
    if (isExpanded) {
      unfolded.add(id)
      unfoldedHere.delete(id)
    } else {
      unfolded.delete(id)
    }
  }
}

/** How a run is drawn, by its calls' levels: as the engine does if all are normal; its rows, each by its own level, if some are; else its span's line. */
export const treatmentOf = (levels: readonly Level[]) =>
  levels.every(level => level === 'full')
    ? ('engine' as const)
    : levels.includes('full')
      ? ('rows' as const)
      : ('span' as const)

/** The edits that changed something, and those that failed apart. */
export const splitEdits = (edits: readonly EditLine[]) => ({
  done: edits.filter(edit => edit.failure === undefined),
  failed: edits.filter(edit => edit.failure !== undefined),
})

/** The span draws where its first shown item is; the rest of it draws nothing. */
export const drawerOf = (span: Span, shown: Shown) => {
  const first = span.items.find(item =>
    item.kind === 'edits' ? shown.edits : isCallShown(item.call, shown) || (shown.changes && isCommand(item)),
  )

  return first === undefined ? undefined : idOf(first)
}

/** A span less the calls an unfolded run of the engine's draws: the line is of the rest, and draws where the first of them is. */
export const foldable = (span: Span, unfolded: ReadonlySet<string>): Span => ({
  ...span,
  items: span.items.filter(item => !unfolded.has(idOf(item))),
})

/** The calls of a span its line holds, each as the drawing gives it where it does (its own, fresher), else as the conversation has it. */
export const callsOf = (span: Span, shown: Shown, fresh: readonly ToolGroupCall[]) =>
  span.items.flatMap(item =>
    item.kind === 'calls' && isCallShown(item.call, shown)
      ? [fresh.find(own => own.tool_use_id === item.call.tool_use_id) ?? item.call]
      : [],
  )

/**
 * The ids whose results the line needs: the edits that changed something, and
 * the commands for the files they changed, in order; a read of an image or a
 * PDF, opened, for what it took in.
 */
export const wantedOf = (
  span: Span,
  shown: Shown,
  calls: readonly ToolGroupCall[],
  pictures: ReadonlyMap<string, string>,
  open: readonly string[],
) => [
  ...span.items.flatMap(item =>
    item.kind === 'edits'
      ? shown.edits && item.edit.failure === undefined
        ? [item.edit.id]
        : []
      : shown.changes && isCommand(item)
        ? [item.call.tool_use_id ?? '']
        : [],
  ),
  ...calls.flatMap(({ tool, tool_use_id: id = '' }) =>
    tool === 'Read' && pictures.has(id) && open.includes(`row:${id}`) ? [id] : [],
  ),
]

/** A span's edits and the files its commands changed, in order, each with the hunks its result gave. */
export const editsOf = (
  span: Span,
  shown: Shown,
  outcomes: ReadonlyMap<string, Outcome | null | undefined>,
): EditLine[] =>
  span.items.flatMap((item): EditLine[] =>
    item.kind === 'edits'
      ? shown.edits
        ? [{ ...item.edit, hunks: outcomes.get(item.edit.id)?.hunks ?? null, isChange: false }]
        : []
      : shown.changes && isCommand(item)
        ? (outcomes.get(item.call.tool_use_id ?? '')?.changes ?? []).map(change => ({
            id: item.call.tool_use_id ?? '',
            ...change,
            isChange: true,
          }))
        : [],
  )
