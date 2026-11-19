// A word as the shell splits it (quotes and escapes kept in it), a redirection
// or a separator.
const TOKEN = /\d*[<>]+(?:&\d*-?)?|(?:'[^']*'|"(?:[^"\\]|\\[\s\S])*"|\\[\s\S]|[^\s'"\\;&|(){}`<>])+|[;&|(){}`\n]/g
// A heredoc, its delimiter and the text on its line after it; not a here-string.
const HEREDOC = /(?<!<)<<(?!<)-?\s*(['"]?)(\w+)\1([^\n]*)\n[\s\S]*?(?:\n\t*\2(?=\n|$)|$)/g
// What runs inside double quotes: a $( ) substitution or a backtick one.
const SUBSTITUTION = /\$\((?:[^()]|\([^()]*\))*\)|`[^`]*`/g

/** A word as the command receives it, its quotes and escapes taken off. */
export const unquote = (word: string) =>
  word.replace(
    /'([^']*)'|"((?:[^"\\]|\\[\s\S])*)"|\\([\s\S])/g,
    (_, single?: string, double?: string, escaped?: string) =>
      single ?? double?.replace(/\\([\s\S])/g, '$1') ?? escaped ?? '',
  )

/** The scripts a word's double-quoted parts run as substitutions. */
export const substitutions = (word: string) =>
  [...word.matchAll(/'[^']*'|\\[\s\S]|("(?:[^"\\]|\\[\s\S])*")/g)].flatMap(([, double]) =>
    double === undefined
      ? []
      : [...double.matchAll(SUBSTITUTION)].map(([sub = '']) => sub.slice(sub[0] === '$' ? 2 : 1, -1)),
  )

/**
 * The text of the heredocs fed to other commands is data (`git commit -F -
 * <<EOF`); one fed to a shell, or to eval, is a script and stays.
 */
export const withoutHeredocs = (command: string) =>
  command.replace(HEREDOC, (whole, _quote: string, delimiter: string, rest: string, at: number) => {
    const line = command.slice(command.lastIndexOf('\n', at - 1) + 1, at)

    return /\b(?:(?:ba|z|da|k)?sh|eval|source)\b/.test(line + rest) ? whole : `<<${delimiter}${rest}`
  })

/** The words of each simple command, redirections and what they name left out. */
export const simpleCommands = (script: string) => {
  let current: string[] = []
  const commands: string[][] = [current]
  let isTarget = false

  // A backslash before a newline joins the lines.
  for (const [token] of script.replace(/\\\n/g, '').matchAll(TOKEN)) {
    if (/^[;&|(){}`\n]$/.test(token)) {
      current = []
      commands.push(current)
      isTarget = false
    } else if (/^\d*[<>]/.test(token)) {
      isTarget = !token.includes('&')
    } else if (isTarget) {
      isTarget = false
    } else {
      current.push(token)
    }
  }

  return commands
}
