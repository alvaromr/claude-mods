import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, RenderNode } from 'claude-code'

import type { Run } from '../types'
import { partsOf } from './command-parts'
import { DETACHED, copyFailure, finished, rowsOf, taken } from './command-run'
import { indentOf, outputOf, roomOf, rowOf } from './command-view'
import { reasonOf } from './reason'
import { orElse, shown } from './settings'
import { TEXT } from './text'

const runs = atom({ plugin: 'ui-linkify', key: 'runs' } as const, {} as Record<string, Run>)
// How to stop each command still running, by its row: a press on its ■. It
// lives as long as the module, so a run that outlived a reload has none.
const stops = new Map<string, () => void>()

// Runs the command as bash mode would, in the session's folder and the
// person's shell, drawing what it prints as it comes; a press while it runs
// stops it. Then hands Claude what ran and what it printed, as the two rows
// bash mode keeps; no turn starts.
async function runCommand($: EngineInterface, id: string, command: string) {
  const stop = stops.get(id)

  if (stop !== undefined) {
    stop()

    return
  }

  // Taken before any await: a second press is a stop, never a second run.
  const stopped = new Promise<'stopped'>(resolve => {
    stops.set(id, () => {
      resolve('stopped')
    })
  })
  let got = { stdout: '', stderr: '' }
  let cut = { stdout: 0, stderr: 0 }
  const running = (): Run => ({ status: 'running', ...got })
  let exitCode: number | null = null
  let ended: Run

  try {
    await update($, runs, now => ({ ...now, [id]: running() }))

    try {
      const shell = (await $.env.get('SHELL').catch(orElse($, 'reading SHELL', undefined))) || '/bin/sh'
      const child = $.process.spawn({ argv: [...DETACHED, shell, '-c', command] })

      for (;;) {
        const pulling = child.next()
        const pulled = await Promise.race([pulling, stopped])

        if (pulled === 'stopped') {
          // Closing the stream kills the child; its last pull ends with it.
          pulling.catch(orElse($, 'reading the stopped command', undefined))
          void child.return({ code: null, signal: 'SIGTERM' }).catch(orElse($, 'stopping the command', undefined))
          break
        }

        if (pulled.done === true) {
          exitCode = pulled.value.code
          break
        }

        const { stream, text } = pulled.value
        const kept = taken(got, cut, stream, text)

        got = kept.got
        cut = kept.cut

        if (kept.isChanged) {
          await update($, runs, now => ({ ...now, [id]: running() }))
        }
      }
    } catch (error) {
      got = { ...got, stderr: got.stderr + reasonOf(error) }
      exitCode = 1
    }

    ended = finished(got, cut, exitCode)
    await update($, runs, now => ({ ...now, [id]: ended }))
  } finally {
    // After the run is marked done: a press before that still stops it, and
    // none starts a second run over one that has not been written down.
    stops.delete(id)
  }

  try {
    for (const text of rowsOf(command, ended)) {
      await $.session.append({ message: { type: 'user', content: [{ type: 'text', text }] } })
    }
  } catch (error) {
    $.ui.toast(TEXT.notShared(reasonOf(error)))
  }
}

// Puts the command on the clipboard, to paste in a terminal: a ▶ run has no
// keyboard, so a command that asks for input ends there without asking.
async function copyCommand($: EngineInterface, command: string) {
  try {
    const { exitCode, stderr } = await $.process.run(['pbcopy'], { stdin: command })
    const failure = copyFailure(exitCode, stderr)

    if (failure !== undefined) {
      throw new Error(failure)
    }

    $.ui.toast(TEXT.copied)
  } catch (error) {
    $.ui.toast(TEXT.notCopied(reasonOf(error)))
  }
}

// What a run has printed under a command: see outputOf.
const output = (
  run: Run | undefined,
  isLive: boolean,
  { Box, Text }: Pick<ReturnType<EngineInterface['ui']['resolve']>, 'Box' | 'Text'>,
) => {
  const view = outputOf(run, isLive)

  if (view === undefined) {
    return null
  }

  return (
    <Box flexDirection="column" paddingLeft={2}>
      {view.hasLines && <Text dimColor>{view.head}</Text>}
      {view.hidden > 0 && <Text dimColor>{TEXT.moreLines(view.hidden)}</Text>}
      {view.isRunning && <Text dimColor>{TEXT.running}</Text>}
      {view.isStopped && <Text color="error">{TEXT.stopped}</Text>}
      {view.failure !== undefined && <Text color="error">{TEXT.exitCode(view.failure)}</Text>}
      {view.isSilent && <Text dimColor>{TEXT.noOutput}</Text>}
    </Box>
  )
}

// The commands an assistant message proposes, boxed in bash mode's color
// with a ▶ that runs them and a ⧉ that copies them; the text around them is
// drawn as before. Only in the terminal: the desktop app has a ▶ of its own.
export const registerCommands = (on: On) => {
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const parts = partsOf(e.props.text)

    if (
      e.surface !== 'terminal' ||
      e.props.isSummary ||
      !parts.some(part => 'command' in part) ||
      !(await shown($)).commands
    ) {
      return next(e)
    }

    const { Box, Button, Text } = $.ui.resolve(e)
    const done = await read($, runs)
    // A reply's first block is drawn after its bullet; what follows it lines up there.
    const indent = indentOf(e.props.isFirstOfReply)
    const room = roomOf(e.viewport?.columns, indent)
    const drawn: RenderNode[] = []

    for (const [n, part] of parts.entries()) {
      if ('text' in part) {
        const isFirst = n === 0 && e.props.isFirstOfReply
        const beneath = await next({ ...e, props: { ...e.props, text: part.text, isFirstOfReply: isFirst } })

        drawn.push(
          isFirst ? (
            beneath
          ) : (
            <Box key={`text-${n}`} paddingLeft={indent}>
              {beneath}
            </Box>
          ),
        )
        continue
      }

      const id = `${e.requestId} ${part.at}`
      const isLive = stops.has(id)

      drawn.push(
        <Box key={`command-${n}`} flexDirection="column" paddingLeft={indent}>
          <Box borderStyle="round" borderColor="bashBorder" paddingX={1}>
            <Button key={`run-${n}`} plain onPress={() => void runCommand($, id, part.command)}>
              <Text color="bashBorder">!</Text> {rowOf(part.command, room, done[id]?.status === 'running' && isLive)}
            </Button>
            <Box flexShrink={0} paddingLeft={1}>
              <Button key={`copy-${n}`} label={TEXT.copy} plain onPress={() => void copyCommand($, part.command)}>
                ⧉
              </Button>
            </Box>
          </Box>
          {output(done[id], isLive, { Box, Text })}
        </Box>,
      )
    }

    return <Box flexDirection="column">{drawn}</Box>
  })
}
