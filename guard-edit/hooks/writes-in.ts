import { invocation, isOption } from './invocation'
import { lex, type Segment, type Word } from './lex'
import { resolve, SCRATCH_DIR } from './paths'
import { type Write, writesOf } from './written'

const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh'])

// What a command reads on its input, where the command line gives it: its
// heredocs and here-strings, else the text an `echo` or `cat <<EOF` pipes in.
const inputOf = (segment: Segment, piper?: Segment) => {
  if (segment.bodies.length > 0 || piper === undefined) {
    return segment.bodies
  }

  const { name, args } = invocation(piper.words)
  const echoed = name === 'echo' || name === 'printf' ? args.filter(arg => !isOption(arg)).map(arg => arg.text) : []

  return [...echoed, ...piper.bodies]
}

// The command line a shell, or eval, is handed: after `-c`, else on its input
// unless it is given a script file.
const scriptOf = (name: string, args: readonly Word[], input: readonly string[]) => {
  if (name === 'eval') {
    return args.map(arg => arg.text).join(' ')
  }

  if (!SHELLS.has(name)) {
    return undefined
  }

  const at = args.findIndex(arg => isOption(arg) && /^-[a-zA-Z]*c[a-zA-Z]*$/.test(arg.text))
  const isFile = args.some(arg => !isOption(arg) && arg.text !== '-') && !args.some(arg => arg.text === '-s')

  return at >= 0 ? args[at + 1]?.text : isFile || input.length === 0 ? undefined : input.join('\n')
}

/** The writes of the whole command, each from the folder its `cd`s left. */
export const writesIn = (command: string, cwd: string, home: string): Write[] => {
  const segments = lex(command)
  // `before` is what `cd -` goes back to.
  const dir = { here: cwd, before: cwd }
  // Where each subshell open began: its `cd`s end with it.
  const outside: (typeof dir)[] = []

  return segments.flatMap((segment, at): Write[] => {
    if (segment.scope !== undefined) {
      if (segment.scope === 'open') {
        outside.push({ ...dir })
      } else {
        Object.assign(dir, outside.pop())
      }

      return []
    }

    const { name, args } = invocation(segment.words)
    const input = inputOf(segment, segment.isPiped ? segments[at - 1] : undefined)
    // A script handed to a shell or to eval, like what a substitution or a
    // process substitution holds, is a command line of its own.
    const script = scriptOf(name, args, input)
    const nested = [...segment.nested, ...(script === undefined ? [] : [script])]
    const writes = [
      ...writesOf(segment, input, dir.here, home),
      ...nested.flatMap(inner => writesIn(inner, dir.here, home)),
    ]

    if (name === 'cd') {
      const target = args.find(arg => !isOption(arg))?.text ?? '~'
      // A target only the shell knows is scratch for `mktemp` and $TMPDIR, and
      // otherwise unknown: the session's folder, where the project is, so what
      // follows is asked of git rather than let through.
      const next =
        target === '-' ? dir.before : (resolve(target, dir.here, home) ?? (SCRATCH_DIR.test(target) ? '/tmp' : cwd))

      dir.before = dir.here
      dir.here = next
    }

    return writes
  })
}
