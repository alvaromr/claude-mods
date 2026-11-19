import { FED, feed, invocation, isOption } from './invocation'
import type { Segment, Word } from './lex'
import { resolve } from './paths'

// A file a command writes, and how; `ifExists` for a copy or move, which
// writes a file of the project only by replacing one.
export type Write = { path: string; how: string; ifExists?: boolean }

const SCRIPTS = new Set(['python', 'python3', 'node', 'bun', 'deno', 'ruby', 'perl'])
// A script's calls that write a file, with the literal path when it gives one.
const WRITE_CALLS = [
  /\bopen\(\s*(['"])(.+?)\1\s*,\s*['"][^'"]*[wax]/g,
  /\bPath\(\s*(['"])(.+?)\1\s*\)\s*\.\s*write_(?:text|bytes)\(/g,
  /\b(?:writeFileSync|writeFile|appendFileSync|appendFile)\(\s*(['"`])(.+?)\1/g,
  /\bFile\.write\(\s*(['"])(.+?)\1/g,
]
const WRITES_FILE =
  /\bopen\([^)]*,\s*['"][^'"]*[wax]|\.write_(?:text|bytes)\(|\b(?:writeFileSync|writeFile|appendFileSync|appendFile)\(|\bFile\.write\(|\bshutil\.(?:copy|move)/
// What looks like a path in a script: with a slash, or a name and extension.
const PATH_LITERAL = /(['"`])((?:~|\.{0,2})\/[^'"`\n]*|[\w.-]+\/[^'"`\n]*|[\w-]+\.\w{1,8})\1/g
// The path in a match of either pattern above: their second group is not optional.
const pathIn = ([, , path]: RegExpMatchArray) => {
  if (path === undefined) {
    throw new Error('A path pattern matched without its path group.')
  }

  return path
}

// git's own options before its subcommand that take the next word.
const GIT_OPTION_ARGS = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--super-prefix'])

// The files an in-place editor rewrites: what is not an option nor its script.
export const editedFiles = (args: readonly Word[], hasScriptOption: (option: string) => boolean) => {
  const files: Word[] = []
  let isScriptGiven = false
  // The word after an option that takes the script is that script.
  let isScriptNext = false

  for (const arg of args) {
    if (isScriptNext) {
      isScriptNext = false
    } else if (isOption(arg)) {
      if (hasScriptOption(arg.text)) {
        isScriptGiven = true
        isScriptNext = true
      }
    } else if (!isScriptGiven) {
      isScriptGiven = true
    } else {
      files.push(arg)
    }
  }

  return files
}

// The folder a `cp` or `mv` puts its files into, where `-t` names it.
export const targetDirectory = (args: readonly Word[]) => {
  const at = args.findIndex(arg => isOption(arg) && /^-[a-zA-Z]*t$|^--target-directory$/.test(arg.text))
  const attached = args.find(arg => isOption(arg) && /^(?:-t|--target-directory=)./.test(arg.text))

  return { word: at < 0 ? undefined : args[at + 1], text: attached?.text.replace(/^(?:-t|--target-directory=)/, '') }
}

// The files a command writes, from its words and what it reads as input
// (heredocs, a here-string, a pipe); paths as written, not yet resolved.
export const writtenBy = (words: readonly Word[], input: readonly string[]): Write[] => {
  const writes: Write[] = []
  const { name, args } = invocation(words)
  const options = args.filter(isOption).map(arg => arg.text)
  const positional = args.filter(arg => !isOption(arg))

  if (name === 'find') {
    // What -exec runs gets the files found, those under the folders searched.
    const first = args.findIndex(arg => (isOption(arg) && !/^-[HLP]$/.test(arg.text)) || /^[!(]$/.test(arg.text))
    const starts = args.slice(0, first < 0 ? args.length : first).filter(arg => !isOption(arg))
    const clauses: Word[][] = []
    let open: Word[] | undefined

    for (const arg of args) {
      if (open !== undefined && (arg.text === ';' || arg.text === '+')) {
        open = undefined
      } else if (open !== undefined) {
        open.push(arg)
      } else if (/^-(?:exec|execdir|ok|okdir)$/.test(arg.text)) {
        // A `;` left unescaped ends the line before the clause does: still a clause.
        open = []
        clauses.push(open)
      }
    }

    writes.push(...clauses.flatMap(clause => writtenBy(feed(clause, starts.length > 0 ? starts : [FED], '{}'), [])))
  }

  if (name === 'tee') {
    writes.push(...positional.map(arg => ({ path: arg.text, how: 'tee' })))
  }

  if ((name === 'sed' || name === 'gsed') && options.some(option => /^-[a-zA-Z]*i|^--in-place/.test(option))) {
    // `-i ''` on macOS: the empty suffix is no file.
    const files = editedFiles(
      args.filter(arg => arg.text !== ''),
      option => /^-[a-zA-Z]*[ef]$|^--(?:expression|file)$/.test(option),
    )
    writes.push(...files.map(arg => ({ path: arg.text, how: 'sed -i' })))
  }

  if ((name === 'perl' || name === 'ruby') && options.some(option => /^-[a-zA-Z0-9]*i/.test(option))) {
    const files = editedFiles(args, option => /^-[a-zA-Z0-9]*e$/.test(option))
    writes.push(...files.map(arg => ({ path: arg.text, how: `${name} -i` })))
  }

  if (
    (name === 'awk' || name === 'gawk') &&
    args.some((arg, at) => arg.text === '-i' && args[at + 1]?.text === 'inplace')
  ) {
    const files = editedFiles(
      args.filter((arg, at) => arg.text !== 'inplace' || args[at - 1]?.text !== '-i'),
      option => option === '-f',
    )
    writes.push(...files.map(arg => ({ path: arg.text, how: 'awk -i inplace' })))
  }

  if (name === 'cp' || name === 'mv') {
    const directory = targetDirectory(args)
    const operands = positional.filter(arg => arg !== directory.word)
    const named = (arg: Word) => arg.text.split('/').pop() ?? ''
    const folder = directory.word?.text ?? directory.text
    const last = operands.at(-1)

    if (folder !== undefined) {
      // `-t dir`: every operand is a source, into the folder.
      writes.push(...operands.map(arg => ({ path: `${folder}/${named(arg)}`, how: name, ifExists: true })))
    } else if (last !== undefined && operands.length >= 2) {
      const target = last.text
      const sources = operands.slice(0, -1).map(named)
      // Into a folder each source keeps its name; a target with no slash may be
      // the file or a folder, so both are asked of.
      const into = sources.map(source => `${target}/${source}`)
      const paths = target.endsWith('/') || sources.length > 1 ? into : [target, ...into]
      writes.push(...paths.map(path => ({ path, how: name, ifExists: true })))
    }
  }

  // git's subcommand, past its own options: `git -C repo apply`.
  let sub = 0

  for (let arg = args[sub]; name === 'git' && arg !== undefined && isOption(arg); arg = args[sub]) {
    sub += GIT_OPTION_ARGS.has(arg.text) ? 2 : 1
  }

  // A patch only checked or measured writes nothing.
  const isDry = options.some(option => /^--(?:check|stat|numstat|summary|dry-run)$/.test(option))

  if (!isDry && (name === 'patch' || (name === 'git' && args[sub]?.text === 'apply'))) {
    writes.push({ path: '.', how: name === 'git' ? 'git apply' : 'patch' })
  }

  if (SCRIPTS.has(name)) {
    const script = [
      ...input,
      ...args.filter((arg, at) => /^-[a-zA-Z]*[ce]$|^--eval$/.test(args[at - 1]?.text ?? '')).map(arg => arg.text),
    ].join('\n')

    if (WRITES_FILE.test(script)) {
      const literal = WRITE_CALLS.flatMap(call => [...script.matchAll(call)].map(pathIn))
      const paths = literal.length > 0 ? literal : [...script.matchAll(PATH_LITERAL)].map(pathIn)
      writes.push(...paths.map(path => ({ path, how: `a ${name} script` })))
    }
  }

  return writes
}

/** The files a segment writes, its redirections' and its command's, resolved from the folder it runs in. */
export const writesOf = (segment: Segment, input: readonly string[], cwd: string, home: string): Write[] =>
  [...segment.redirected.map(path => ({ path, how: 'a redirection' })), ...writtenBy(segment.words, input)].flatMap(
    write => {
      const path = resolve(write.path, cwd, home)

      return path === undefined ? [] : [{ ...write, path }]
    },
  )
