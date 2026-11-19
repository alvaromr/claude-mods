import { TEXT } from './text'

/** What the launcher (app/launch.sh) can be asked: a session `start`s it, /pet `open`s it, /pet salir `quit`s it. */
export type Action = 'start' | 'open' | 'quit'

/** What the launcher left when it ran: its exit code and what it said on stderr. */
export type Ran = { exitCode: number; stderr: string }

/** What /pet asks of the launcher: to close the pet for «salir», whatever the spaces around, else to open it. */
export const actionOf = (args: string): 'open' | 'quit' => (args.trim() === TEXT.quit ? 'quit' : 'open')

/** The line a session's start logs for a launcher that failed; nothing for one that did not. */
export const startFailure = ({ exitCode, stderr }: Ran) =>
  exitCode === 0 ? undefined : TEXT.openFailedLog(stderr.trim())

/** What /pet answers once the launcher has run `action`: that it opened or closed the pet, or why it could not. */
export const answerTo = (action: 'open' | 'quit', { exitCode, stderr }: Ran) => {
  const isQuit = action === 'quit'

  if (exitCode !== 0) {
    return TEXT.runFailed(isQuit, stderr.trim())
  }

  return isQuit ? TEXT.closed : TEXT.opened
}
