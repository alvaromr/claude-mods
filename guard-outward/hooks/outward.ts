import { bashOutward } from './bash'
import { mcpOutward } from './mcp'

/** The commands the person listed, each as its first words: `mycli send`. */
export const listedCommands = (setting: string) =>
  setting
    .split(',')
    .map(entry => entry.trim().split(/\s+/).filter(Boolean))
    .filter(words => words.length > 0)

/** What the call sends outside the session, as it reads; undefined where it sends nothing. */
export const outwardOf = (tool: string, input: unknown, listed: readonly (readonly string[])[]) => {
  const command = (input as { command?: unknown } | undefined)?.command

  return tool.startsWith('mcp__')
    ? mcpOutward(tool)
    : (tool === 'Bash' || tool === 'Monitor') && typeof command === 'string'
      ? bashOutward(command, listed)
      : undefined
}
