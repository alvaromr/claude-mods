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
// What Orca writes in a worker's prompt box: a message waiting, one relayed from another terminal, a note of its own.
const IS_ORCA_NOTICE = /^(?:You have \d+ orchestration messages?|──── From: |\[Orca: )/
// Orca's brief to a worker: its own instructions, then, after this line, the task.
const TASK = /^=== TASK ===$/m

/** What a prompt asks: all of it, or of Orca's brief to a worker, the task after its marker. */
const taskOf = (prompt: string) => {
  const marker = TASK.exec(prompt)

  return marker === null ? prompt : prompt.slice(marker.index + marker[0].length)
}

/**
 * What the person typed, less the marks of what they attached or pasted; nothing for a
 * command, a prompt nobody typed, Orca's notice or one too short to say anything.
 */
export const typed = (e: { prompt: string; source?: string }) => {
  const text = taskOf(e.prompt)
    .replace(/\[(?:Image|Pasted text) #\d+[^\]]*\]/g, ' ')
    .replace(/<\/?pasted_content[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const isTheirs =
    (e.source ?? 'user') === 'user' && !IS_COMMAND.test(text) && !IS_WRAPPED.test(text) && !IS_ORCA_NOTICE.test(text)

  return isTheirs && text.length >= SHORTEST ? text.slice(0, EXCERPT) : undefined
}

/** Whether `count` prompts are all a title needs: the ones after change nothing. */
export const isFull = (count: number) => count >= ENOUGH

/** Whether `count` prompts is where the title is made again, to stay. */
export const completes = (count: number) => count === ENOUGH

/** The prompts said, numbered one to a line, as the model is asked to title them. */
export const numbered = (said: readonly string[]) => said.map((one, index) => `${index + 1}. ${one}`).join('\n')
