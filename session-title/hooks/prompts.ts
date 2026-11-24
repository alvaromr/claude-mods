// A title is made from the person's first prompt, and made again once there are
// this many: at the third the session has shown what it is about, and at the
// tenth and the thirtieth a long one may have moved on; after that it stays.
const AGAIN = [3, 10, 30]
// The prompts a title is made from: the first ones, what the session set out to
// do, and the last ones, what it does now; the list stays this short.
const FIRST = 2
const LAST = 5
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
 * What the person typed, less the marks of what they attached or pasted; for a command, a prompt
 * nobody typed, Orca's notice or one too short to say anything, why it is left out.
 */
export const typed = (e: { prompt: string; source?: string }): { text: string } | { dropped: string } => {
  const text = taskOf(e.prompt)
    .replace(/\[(?:Image|Pasted text) #\d+[^\]]*\]/g, ' ')
    .replace(/<\/?pasted_content[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  // Each reason to leave a prompt out, and whether it holds, the first that does said.
  const reasons: [boolean, string][] = [
    [(e.source ?? 'user') !== 'user', 'not typed by the person'],
    [IS_COMMAND.test(text), 'a slash command'],
    [IS_WRAPPED.test(text), "Claude Code's own text"],
    [IS_ORCA_NOTICE.test(text), 'a notice of Orca'],
    [text.length < SHORTEST, 'too short to say anything'],
  ]
  const dropped = reasons.find(([holds]) => holds)?.[1]

  return dropped === undefined ? { text: text.slice(0, EXCERPT) } : { dropped }
}

/** Whether `count` prompts are all a title needs: the ones after change nothing. */
export const isFull = (count: number) => count >= Math.max(...AGAIN)

/** Whether the `count`th prompt makes a title: where it is made again, or before the first of those, while none was given. */
export const isDue = (count: number, isTitled: boolean) =>
  AGAIN.includes(count) || (!isTitled && count < Math.min(...AGAIN))

/** The prompts kept once `text` is said after `said`: the first and the last ones. */
export const kept = (said: readonly string[], text: string) => {
  const all = [...said, text]

  return all.length <= FIRST + LAST ? all : [...all.slice(0, FIRST), ...all.slice(-LAST)]
}

/** The prompts kept of `count` said, one to a line, each numbered by its place, as the model is asked to title them. */
export const numbered = (said: readonly string[], count: number) =>
  said.map((one, index) => `${index < FIRST ? index + 1 : count - said.length + index + 1}. ${one}`).join('\n')
