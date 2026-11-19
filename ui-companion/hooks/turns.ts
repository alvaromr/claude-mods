import type { Mode } from '../types'
import type { Ask } from './brief'
import { ROLLING } from './modes'

/** Whether a turn's end is the conversation's own answer: not a subagent's, and not one cut short. */
export const isOwnAnswer = (agentId: string | undefined, reason: string) => agentId === undefined && reason === 'answer'

/**
 * Whether a compaction replaced the conversation's transcript: neither a
 * precompute, which installs nothing, nor an agent's own, nor one vetoed (`skip`).
 */
export const isCompaction = (trigger: string, agentId: string | undefined, skip: unknown) =>
  trigger !== 'precompute' && agentId === undefined && skip === undefined

/** Whether a mode's own comment is one already made: a turn's end and a mode turned on that land together are one. */
export const isSameTurn = (ask: Ask, commentedAt: number | undefined, length: number) =>
  ask === 'own' && commentedAt === length

/** Whether the same thing is already waiting for the model: what is asked meanwhile is answered once. */
export const isQueued = (waiting: readonly { mode: Mode; ask: Ask }[], chosen: Mode, ask: Ask) =>
  waiting.some(queued => queued.mode === chosen && queued.ask === ask)

/**
 * What a reply comes to: a kept text written, a note added (or made again), or
 * nothing. A silent reply leaves a kept text as it was, and a note made again
 * takes the place of the one it was made from even then.
 */
export const keeping = (chosen: Mode, isQuiet: boolean, ask: Ask): 'text' | 'note' | 'nothing' => {
  if (ROLLING.includes(chosen)) {
    return isQuiet ? 'nothing' : 'text'
  }

  return isQuiet && ask !== 'redo' ? 'nothing' : 'note'
}
