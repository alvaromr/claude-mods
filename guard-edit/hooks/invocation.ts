import { KEYWORDS, type Word } from './lex'

// A command that runs another: the options that take the next word, and how
// many words follow its options before the command.
type Wrapper = { takes: readonly string[]; operands?: number }

const WRAPPERS = new Map<string, Wrapper>(
  Object.entries<Wrapper>({
    command: { takes: [] },
    builtin: { takes: [] },
    exec: { takes: ['-a'] },
    nohup: { takes: [] },
    setsid: { takes: [] },
    time: { takes: ['-f', '-o', '--format', '--output'] },
    env: { takes: ['-u', '-C', '-S', '--unset', '--chdir', '--split-string'] },
    sudo: {
      takes: ['-u', '-g', '-h', '-p', '-C', '-D', '-R', '-r', '-t', '-T', '-U', '--user', '--group', '--host'],
    },
    doas: { takes: ['-u', '-C'] },
    nice: { takes: ['-n', '--adjustment'] },
    ionice: { takes: ['-c', '-n', '-p', '-P', '-u', '--class', '--classdata'] },
    timeout: { takes: ['-k', '-s', '--kill-after', '--signal'], operands: 1 },
    stdbuf: { takes: ['-i', '-o', '-e', '--input', '--output', '--error'] },
    // The files it runs its command on come from its input, unknown here.
    xargs: {
      takes: [
        '-I',
        '-J',
        '-n',
        '-P',
        '-L',
        '-s',
        '-d',
        '-E',
        '-a',
        '-R',
        '-S',
        '--max-args',
        '--max-procs',
        '--delimiter',
      ],
    },
  }),
)
// The file a command is given on its input (xargs, find -exec) is unknown at
// parse time: it stands for the folder the command runs in, failing closed.
export const FED: Word = { text: '.', isQuoted: false, isBare: false }

// An option as the shell hands it: a word that starts bare with a dash.
export const isOption = (word: Word) => word.isBare && word.text.startsWith('-') && word.text !== '-'

// A command's words given the files it is fed: they go where its placeholder
// stands, else last.
export const feed = (words: readonly Word[], files: readonly Word[], placeholder?: string) =>
  placeholder !== undefined && words.some(word => word.text === placeholder)
    ? words.flatMap(word => (word.text === placeholder ? files : [word]))
    : [...words, ...files]

// The string xargs puts the file in place of, where an option says so.
export const replacement = (option: string, next?: Word) =>
  /^-[IJ]$/.test(option)
    ? next?.text
    : (/^-[IJ](.+)$|^-i(.+)$|^--replace=(.*)$/.exec(option)?.slice(1).find(Boolean) ??
      (option === '-i' || option === '--replace' ? '{}' : undefined))

// The command a line runs, past the shell's keywords, assignments and wrappers
// (`sudo -u x`, `env -i`, `timeout 5`, `xargs`...), and its arguments.
export const invocation = (words: readonly Word[]): { name: string; args: Word[] } => {
  let rest = [...words]

  for (;;) {
    const [first] = rest

    if (first === undefined) {
      return { name: '', args: [] }
    }

    const name = first.text.split('/').pop() ?? ''
    const wrapper = WRAPPERS.get(name)

    if ((!first.isQuoted && KEYWORDS.has(first.text)) || /^\w+=/.test(first.text)) {
      rest = rest.slice(1)
    } else if (wrapper === undefined) {
      return { name, args: rest.slice(1) }
    } else {
      let at = 1
      let placeholder: string | undefined

      for (let arg = rest[at]; arg !== undefined && isOption(arg); arg = rest[at]) {
        const { text } = arg
        placeholder ??= name === 'xargs' ? replacement(text, rest[at + 1]) : undefined
        at += wrapper.takes.includes(text) ? 2 : 1
      }

      rest = rest.slice(at + (wrapper.operands ?? 0))
      rest = name === 'xargs' ? feed(rest, [FED], placeholder) : rest
    }
  }
}
