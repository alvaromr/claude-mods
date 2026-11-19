import { type Found, scanGit } from './git'
import { simpleCommands, substitutions, unquote } from './shell'

const SHELL = /^(?:ba|z|da|k|a)?sh$/

// Walks a script, and the scripts inside it that a shell is handed.
export const scan = (script: string, found: Found) => {
  for (const raw of simpleCommands(script)) {
    for (const word of raw) {
      for (const inner of substitutions(word)) {
        scan(inner, found)
      }
    }

    const words = raw.map(unquote)

    for (const [at, word] of words.entries()) {
      const name = word.split('/').pop() ?? ''
      const assigned = /^([A-Za-z_]\w*)=([\s\S]*)$/.exec(word)

      if (assigned) {
        const [, key = '', value = ''] = assigned

        found.env.set(key, value)
      } else if (name === 'git') {
        scanGit(words.slice(at + 1), found)
      } else if (name === 'eval') {
        scan(words.slice(at + 1).join(' '), found)
      } else if (SHELL.test(name)) {
        // The script of `bash -c`, behind options such as `-o pipefail`.
        const flag = words.findIndex((other, i) => i > at && /^-[A-Za-z]*c[A-Za-z]*$/.test(other))

        const inner = words[flag + 1]

        if (flag > 0 && inner !== undefined) {
          scan(inner, found)
        }
      }
    }
  }
}
