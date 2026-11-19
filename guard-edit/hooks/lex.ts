// A word of a command as the shell reads it, its quotes taken off; `isBare`
// where it starts outside quotes, as an option does (`-i''`).
export type Word = { text: string; isQuoted: boolean; isBare: boolean }
// One simple command: its words, the files its redirections write, its heredocs
// and here-strings, the command lines inside its substitutions, whether a pipe
// feeds it. A segment with a `scope` is no command, but the mark of a subshell
// opening or closing.
export type Segment = {
  words: Word[]
  redirected: string[]
  bodies: string[]
  nested: string[]
  isPiped: boolean
  scope?: 'open' | 'close'
}

// What a command line may start with before its command: words of the shell's
// grammar, which run nothing themselves.
export const KEYWORDS = new Set(['if', 'then', 'else', 'elif', 'while', 'until', 'do', '!', '{', '}'])
// What `[[ ]]` reads as words, where `>` and `<` compare and `&&` joins.
const TEST_OPERATOR = /^(?:&&|\|\||[<>()|&])/

// The command cut into simple commands, as far as a shell's grammar matters
// here: quotes, escapes, substitutions, redirections and heredocs.
export const lex = (command: string): Segment[] => {
  const segments: Segment[] = []
  const n = command.length
  const fresh = (isPiped = false): Segment => ({ words: [], redirected: [], bodies: [], nested: [], isPiped })
  let segment = fresh()
  // The heredocs a line opens, each owned by the command that opened it.
  let pending: { delimiter: string; isIndented: boolean; owner: Segment }[] = []
  // Inside `[[ ]]`, where the operators are words.
  let isTest = false
  let i = 0

  const end = (isPipe = false) => {
    if (
      segment.words.length > 0 ||
      segment.redirected.length > 0 ||
      segment.bodies.length > 0 ||
      segment.nested.length > 0 ||
      pending.some(({ owner }) => owner === segment)
    ) {
      segments.push(segment)
    }

    segment = fresh(isPipe)
  }

  // Up to its closing mark, nested ones counted: $( ), ${ }, backticks.
  const closing = (from: number, open: string, close: string) => {
    let depth = 0

    for (let j = from; j < n; j++) {
      if (command[j] === '\\') {
        j++
      } else if (command[j] === open && open !== close) {
        depth++
      } else if (command[j] === close && (open === close ? j > from : --depth === 0)) {
        return j + 1
      }
    }

    return n
  }

  // A substitution at `from` ($( ) or backticks): its command line is a command
  // of the segment's own. Where it ends; an arithmetic $(( )) holds none.
  const substitution = (from: number) => {
    const isBacktick = command[from] === '`'
    const to = isBacktick ? closing(from, '`', '`') : closing(from + 1, '(', ')')

    if (isBacktick || command[from + 2] !== '(') {
      const inner = command.slice(from + (isBacktick ? 1 : 2), to)
      segment.nested.push(inner.endsWith(isBacktick ? '`' : ')') ? inner.slice(0, -1) : inner)
    }

    return to
  }

  const word = (): Word => {
    let text = ''
    let isQuoted = false
    const isBare = command.charAt(i) !== "'" && command.charAt(i) !== '"'

    while (i < n && !/[\s;&|()<>]/.test(command.charAt(i))) {
      const c = command.charAt(i)

      if (c === "'") {
        const j = command.indexOf("'", i + 1)
        text += command.slice(i + 1, j < 0 ? n : j)
        i = j < 0 ? n : j + 1
        isQuoted = true
      } else if (c === '"') {
        let j = i + 1

        while (j < n && command[j] !== '"') {
          if (command[j] === '\\') {
            j += 2
          } else if (command[j] === '`' || (command[j] === '$' && command[j + 1] === '(')) {
            j = substitution(j)
          } else {
            j++
          }
        }

        text += command.slice(i + 1, j).replace(/\\(["\\$`])/g, '$1')
        i = j + 1
        isQuoted = true
      } else if (c === '\\') {
        text += command[i + 1] ?? ''
        i += 2
      } else if ((c === '$' && command[i + 1] === '(') || c === '`') {
        const j = substitution(i)
        text += command.slice(i, j)
        i = j
      } else if (c === '$' && command[i + 1] === '{') {
        const j = closing(i + 1, '{', '}')
        text += command.slice(i, j)
        i = j
      } else {
        text += c
        i++
      }
    }

    return { text, isQuoted, isBare }
  }

  const skipBlanks = () => {
    while (i < n && (command[i] === ' ' || command[i] === '\t')) {
      i++
    }
  }

  while (i < n) {
    const c = command.charAt(i)
    const rest = command.slice(i)
    const testOperator = isTest ? TEST_OPERATOR.exec(rest) : null
    const operator = /^(?:&&|\|\||;;|\|&|[;&|()])/.exec(rest)
    const redirection = /^(?:\d*|&)(?:>>|>\||>&|>|<<<|<<-|<<|<>|<&|<)/.exec(rest)

    // Any blank but a newline, a \r or a no-break space as well: a word stops at
    // each, so one left unskipped would never be passed.
    if (c !== '\n' && /\s/.test(c)) {
      i++
    } else if (c === '\n') {
      i++

      // The heredocs opened on the line take the lines after it.
      for (const { delimiter, isIndented, owner } of pending) {
        const lines: string[] = []

        while (i < n) {
          const next = command.indexOf('\n', i)
          const line = command.slice(i, next < 0 ? n : next)
          i = next < 0 ? n : next + 1

          if ((isIndented ? line.replace(/^\t+/, '') : line) === delimiter) {
            break
          }

          lines.push(line)
        }

        owner.bodies.push(lines.join('\n'))
      }

      pending = []
      isTest = false
      end()
    } else if (c === '#' && (i === 0 || /\s/.test(command.charAt(i - 1)))) {
      while (i < n && command[i] !== '\n') {
        i++
      }
    } else if (testOperator) {
      const [op] = testOperator
      segment.words.push({ text: op, isQuoted: false, isBare: false })
      i += op.length
    } else if (operator && !/^&>/.test(rest)) {
      const [op] = operator
      i += op.length
      isTest = false
      end(op === '|' || op === '|&')

      // A subshell's `cd`s end with it.
      if (op === '(' || op === ')') {
        segments.push({ ...fresh(), scope: op === '(' ? 'open' : 'close' })
      }
    } else if (redirection) {
      const [op] = redirection
      i += op.length
      skipBlanks()

      if (!op.endsWith('<<<') && /<<-?$/.test(op)) {
        pending.push({ delimiter: word().text, isIndented: op.endsWith('<<-'), owner: segment })
      } else if (command[i] === '(') {
        // A process substitution: no file, but a command line of the segment's own.
        const j = closing(i, '(', ')')
        const inner = command.slice(i + 1, j)
        segment.nested.push(inner.endsWith(')') ? inner.slice(0, -1) : inner)
        i = j
      } else if (op.endsWith('<<<')) {
        // A here-string is what a shell that reads it runs.
        segment.bodies.push(word().text)
      } else {
        const target = word().text
        const isWrite = /^(?:\d*|&)(?:>>|>\||>|<>)$/.test(op) || (op.endsWith('>&') && !/^\d+$|^-$/.test(target))

        if (isWrite && target !== '') {
          segment.redirected.push(target)
        }
      }
    } else {
      const next = word()

      if (next.text === '[[' && !next.isQuoted && segment.words.every(({ text }) => KEYWORDS.has(text))) {
        isTest = true
      } else if (next.text === ']]') {
        isTest = false
      }

      segment.words.push(next)
    }
  }

  end()

  return segments
}
