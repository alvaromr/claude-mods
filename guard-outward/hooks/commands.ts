const ASSIGNMENT = /^[A-Za-z_]\w*=/
const FIND_EXEC = /^-(?:exec|execdir|ok|okdir)$/

interface Wrapper {
  // Its options that take the next word: `sudo -u me`.
  args?: readonly string[]
  // Its options that make the call a query, not a run: `command -v git`.
  query?: RegExp
}

// The words that run the command after them, as the shell or a tool does.
const WRAPPERS = new Map<string, Wrapper>([
  [
    'sudo',
    {
      args: ['-u', '-g', '-C', '-h', '-p', '-r', '-t', '-D', '-U', '-T', '--user', '--group'],
      query: /^(?:-[a-zA-Z]*[lvV][a-zA-Z]*|--list|--validate|--version|--help)$/,
    },
  ],
  ['command', { query: /^-[a-zA-Z]*[vV]/ }],
  ['env', { args: ['-u', '-C', '--unset', '--chdir'] }],
  ['exec', { args: ['-a'] }],
  ['time', { args: ['-f', '-o'] }],
  ['nice', { args: ['-n'] }],
  ['timeout', { args: ['-s', '-k', '--signal', '--kill-after'] }],
  ['xargs', { args: ['-n', '-P', '-I', '-L', '-E', '-d', '-a', '-s'] }],
  ['stdbuf', { args: ['-i', '-o', '-e'] }],
  ['watch', { args: ['-n', '--interval'] }],
  ...['nohup', 'caffeinate', 'arch', 'builtin', 'then', 'do', 'else', 'elif', 'if', 'while', 'until', '!'].map(
    (name): [string, Wrapper] => [name, {}],
  ),
])

/** Where the options of a wrapper end, or -1 where they make the call a query. */
export const pastOptions = (words: readonly string[], from: number, wrapper: Wrapper) => {
  let at = from

  // `--` ends the options; a number is a duration or a priority: `timeout 60`.
  for (let word = words[at]; word !== undefined && /^-|^\d/.test(word); word = words[at]) {
    if (wrapper.query?.test(word)) {
      return -1
    }

    at += wrapper.args?.includes(word) ? 2 : 1
  }

  return at
}

/** The commands `words` runs, each as its command word and arguments: past assignments and wrappers. */
export const commandsOf = (words: readonly string[]): (readonly string[])[] => {
  let at = 0

  for (let word = words[at]; word !== undefined; word = words[at]) {
    const name = word.split('/').pop() ?? ''

    if (ASSIGNMENT.test(word)) {
      at++
    } else if (name === 'find') {
      return words.flatMap((other, i) => (FIND_EXEC.test(other) ? commandsOf(words.slice(i + 1)) : []))
    } else {
      const wrapper = WRAPPERS.get(name)

      if (wrapper === undefined) {
        return [words.slice(at)]
      }

      at = pastOptions(words, at + 1, wrapper)

      if (at < 0) {
        return []
      }
    }
  }

  return []
}
