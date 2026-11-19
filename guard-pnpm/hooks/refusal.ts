import { commandsOf } from './commands'
import { simpleCommands, substitutions, unquote, withoutHeredocs } from './shell'

const TOOLS = new Set(['npm', 'npx', 'yarn'])
const SHELL = /^(?:ba|z|da|k|a)?sh$/

/** Why `command` may not run, or undefined where it may. */
export const refusal = (command: string): string | undefined => {
  for (const raw of simpleCommands(withoutHeredocs(command))) {
    for (const word of raw) {
      for (const inner of substitutions(word)) {
        const why = refusal(inner)

        if (why !== undefined) {
          return why
        }
      }
    }

    for (const [first = '', ...rest] of commandsOf(raw.map(unquote))) {
      const name = first.split('/').pop() ?? ''
      const flag = rest.findIndex(word => /^-[A-Za-z]*c[A-Za-z]*$/.test(word))
      // A script: a command word with spaces (`env -S 'npm i'`), what `eval`
      // runs, or `bash -c`'s, behind options such as `-o pipefail`.
      const script = /\s/.test(first)
        ? first
        : name === 'eval'
          ? rest.join(' ')
          : SHELL.test(name) && flag >= 0
            ? rest[flag + 1]
            : undefined

      if (TOOLS.has(name)) {
        return `\`${name}\` is not allowed here, use pnpm (\`pnpm dlx\` or \`pnpm exec\` in place of npx).`
      }

      const why = script === undefined ? undefined : refusal(script)

      if (why !== undefined) {
        return why
      }
    }
  }

  return undefined
}
