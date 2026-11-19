// A title is made from the person's first prompt, and made again, to stay, once
// there are this many: by then the session has shown what it is about.
const ENOUGH = 3
// A prompt shorter than this ("sí", "sigue") says nothing of the session.
const SHORTEST = 12
const EXCERPT = 400
// A slash command (`/clear`, `/plugin:command args`), which is not a path that starts with a slash.
const IS_COMMAND = /^\/[\w:.-]+(?:\s|$)/
// What the engine wraps around what it echoes of a command or a shell line, and of what it injects.
const IS_WRAPPED = /^<(?:command-|local-command-|bash-|task-notification|system-reminder)/

/**
 * What the person typed, less the marks of what they attached; nothing for a
 * command, a prompt nobody typed or one too short to say anything.
 */
export const typed = (e: { prompt: string; source?: string }) => {
  const text = e.prompt
    .replace(/\[(?:Image|Pasted text) #\d+[^\]]*\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const isTheirs = (e.source ?? 'user') === 'user' && !IS_COMMAND.test(text) && !IS_WRAPPED.test(text)

  return isTheirs && text.length >= SHORTEST ? text.slice(0, EXCERPT) : undefined
}

/** Whether `count` prompts are all a title needs: the ones after change nothing. */
export const isFull = (count: number) => count >= ENOUGH

/** Whether `count` prompts is where the title is made again, to stay. */
export const completes = (count: number) => count === ENOUGH

/** The prompts said, numbered one to a line, as the model is asked to title them. */
export const numbered = (said: readonly string[]) => said.map((one, index) => `${index + 1}. ${one}`).join('\n')
