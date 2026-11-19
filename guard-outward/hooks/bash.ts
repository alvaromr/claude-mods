import { commandsOf } from './commands'
import { ghOutward } from './gh'
import { simpleCommands, substitutions, unquote } from './shell'

const SHELL = /^(?:ba|z|da|k|a)?sh$/

// git's own options before its subcommand that take the next word.
const GIT_OPTION_ARGS = new Set([
  '-C',
  '-c',
  '--git-dir',
  '--work-tree',
  '--namespace',
  '--super-prefix',
  '--config-env',
  '--attr-source',
])
// The git subcommands that send, and those that send through a verb of their own.
const GIT_SENDING = new Set(['push', 'send-email', 'imap-send'])
const GIT_SENDING_VERBS = new Map([
  ['subtree', 'push'],
  ['lfs', 'push'],
  ['svn', 'dcommit'],
])
const DRY_RUN = /^(?:--dry-run|-n)$/

/** What a git command, as the words after `git`, sends outside the session, as it reads; undefined where it sends nothing. */
export const gitOutward = (args: readonly string[], listed: readonly (readonly string[])[]): string | undefined => {
  // Aliases the line defines for this call: `git -c alias.p=push p`.
  const aliases = new Map<string, string>()
  let at = 0

  for (let option = args[at]; option?.startsWith('-'); option = args[at]) {
    const alias = option === '-c' ? /^alias\.([^=]+)=([\s\S]*)$/i.exec(args[at + 1] ?? '') : null

    if (alias) {
      const [, name = '', value = ''] = alias

      aliases.set(name.toLowerCase(), value)
    }

    at += GIT_OPTION_ARGS.has(option) ? 2 : 1
  }

  const [sub = '', ...rest] = args.slice(at)
  const alias = aliases.get(sub)

  if (alias !== undefined) {
    // An alias that starts with ! is a shell command.
    return alias.startsWith('!')
      ? bashOutward(`${alias.slice(1)} ${rest.join(' ')}`, listed)
      : gitOutward([...alias.split(/\s+/).filter(Boolean), ...rest], listed)
  }

  const verb = rest.find(arg => !arg.startsWith('-'))
  const sending = GIT_SENDING.has(sub)
    ? sub
    : verb !== undefined && GIT_SENDING_VERBS.get(sub) === verb
      ? `${sub} ${verb}`
      : undefined

  if (sending !== undefined) {
    return rest.some(arg => DRY_RUN.test(arg)) ? undefined : `git ${sending}`
  }

  // `git submodule foreach 'git push'` runs its command in every submodule.
  const each = sub === 'submodule' ? rest.indexOf('foreach') : -1

  return each < 0
    ? undefined
    : bashOutward(
        rest
          .slice(each + 1)
          .join(' ')
          .replace(/^(?:-\S+\s+)+/, ''),
        listed,
      )
}

/** The first command of the line that reaches outside the session, as it reads. */
export const bashOutward = (command: string, listed: readonly (readonly string[])[]): string | undefined => {
  for (const raw of simpleCommands(command)) {
    for (const word of raw) {
      for (const inner of substitutions(word)) {
        const found = bashOutward(inner, listed)

        if (found !== undefined) {
          return found
        }
      }
    }

    for (const [first = '', ...args] of commandsOf(raw.map(unquote))) {
      const name = first.split('/').pop() ?? ''
      const flag = args.findIndex(word => /^-[A-Za-z]*c[A-Za-z]*$/.test(word))
      // A script handed on: what `eval` runs, or `bash -c`'s, behind options
      // such as `-o pipefail`.
      const script = name === 'eval' ? args.join(' ') : SHELL.test(name) && flag >= 0 ? args[flag + 1] : undefined
      const found =
        (name === 'git' ? gitOutward(args, listed) : name === 'gh' ? ghOutward(args, command) : undefined) ??
        (script === undefined ? undefined : bashOutward(script, listed)) ??
        listed
          .find(entry => entry[0] === name && entry.every((word, at) => at === 0 || args[at - 1] === word))
          ?.join(' ')

      if (found !== undefined) {
        return found
      }
    }
  }

  return undefined
}
