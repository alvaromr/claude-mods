import type { Run } from '../types'
import { TEXT } from './text'

// The most characters kept of each stream a command prints, as bash mode caps
// its output (30000); Claude gets those, and the drawing the first lines of them.
const KEPT = 30_000

// Starts what follows it in a session of its own, so without the terminal: a
// child that kept it could open /dev/tty to ask, as sudo does for a password,
// and take the keys and the mouse from the prompt box.
// A group leader, as a child started by the engine may already be, cannot start
// a session (EPERM) and is detached enough: only another failure is an error.
export const DETACHED = [
  'perl',
  '-MPOSIX',
  '-e',
  'setsid() != -1 or $!{EPERM} or die "setsid: $!\\n"; exec @ARGV or die "$ARGV[0]: $!\\n"',
]

/** What each stream of a command has printed. */
export type Printed = { stdout: string; stderr: string }
/** How many characters each stream printed past KEPT. */
export type Cut = { stdout: number; stderr: number }

/** What the streams hold once `text` came on `stream`, and whether that asks for a drawing. */
export const taken = (got: Printed, cut: Cut, stream: 'stdout' | 'stderr', text: string) => {
  const room = KEPT - got[stream].length

  return {
    // Once full, a stream asks for no drawing: a flood does not rewrite the atom.
    got: room > 0 ? { ...got, [stream]: got[stream] + text.slice(0, room) } : got,
    cut: { ...cut, [stream]: cut[stream] + Math.max(0, text.length - room) },
    isChanged: room > 0,
  }
}

/** A command's end: what each stream kept, with how much more it printed, and how it exited. */
export const finished = (got: Printed, cut: Cut, exitCode: number | null): Run => {
  const whole = (stream: 'stdout' | 'stderr') => got[stream] + (cut[stream] > 0 ? TEXT.cut(cut[stream]) : '')

  return { status: 'done', exitCode, stdout: whole('stdout'), stderr: whole('stderr') }
}

// The rows are read by their tags: a command or output that holds one, such as
// `</bash-stdout>`, would close its row and forge the next. Any hyphenated tag
// (bash-*, local-command-*, system-reminder) has its `<` escaped.
const escaped = (text: string) => text.replace(/<(?=\/?[a-z][a-z0-9]*-)/gi, '&lt;')

/** The two rows bash mode keeps of a command, for Claude: what ran and what it printed. */
export const rowsOf = (command: string, { stdout, stderr }: Printed) => {
  const printed = stdout === '' && stderr === '' ? '(Bash completed with no output)' : stdout

  return [
    `<bash-input>${escaped(command)}</bash-input>`,
    `<bash-stdout>${escaped(printed)}</bash-stdout><bash-stderr>${escaped(stderr)}</bash-stderr>`,
  ]
}

/** Why `pbcopy` failed, none when it exited well. */
export const copyFailure = (exitCode: number, stderr: string) =>
  exitCode === 0 ? undefined : stderr.trim() || `pbcopy: exit ${exitCode}`
