import type { Run } from '../types'
import { CONTROL } from './command-parts'

// The most lines of output drawn under a command; Claude gets all of it.
const SHOWN = 10
// The width drawn for where the surface does not say its own.
const COLUMNS = 80

/**
 * What a run has printed, its first lines, and whether it still runs, was
 * stopped, how it exited when it failed, or that it ended printing nothing. A
 * run the store says is running but nothing here can stop (it outlived a
 * reload of this module) is shown as stopped.
 */
export const outputOf = (run: Run | undefined, isLive: boolean) => {
  if (run === undefined) {
    return undefined
  }

  const lines = [run.stdout, run.stderr].flatMap(stream =>
    stream === '' ? [] : stream.replace(CONTROL, '').replace(/\n$/, '').split('\n'),
  )

  return {
    hasLines: lines.length > 0,
    head: lines.slice(0, SHOWN).join('\n'),
    hidden: Math.max(0, lines.length - SHOWN),
    isRunning: run.status === 'running' && isLive,
    isStopped: run.status === 'running' ? !isLive : run.exitCode === null,
    failure: run.status === 'done' && run.exitCode !== null && run.exitCode !== 0 ? run.exitCode : undefined,
    isSilent: run.status === 'done' && run.exitCode === 0 && lines.length === 0,
  }
}

/** How far a reply's first block, drawn after its bullet, pushes what follows it. */
export const indentOf = (isFirstOfReply: boolean) => (isFirstOfReply ? 2 : 0)

/**
 * The room for a command inside its frame: the width less the indent, the
 * borders, a space each side and one to spare, so the ▶ never wraps to a line
 * of its own.
 */
export const roomOf = (columns: number | undefined, indent: number) => (columns ?? COLUMNS) - indent - 5

/**
 * The row is the button that runs it, its ▶ near the right border, a ■ that
 * stops it while it runs; a command too long for one line wraps and the mark
 * ends its last line.
 */
export const rowOf = (command: string, room: number, isRunning: boolean) =>
  `${command}${' '.repeat(Math.max(1, room - command.length - 5))}${isRunning ? '■' : '▶'}`
