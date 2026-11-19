import type { ToolGroupCall } from 'claude-code'

// The tools whose result is a diff.
const EDITS = new Set(['Edit', 'Write'])
// The calls a span holds, with the edits: those the engine folds into a run's
// line, and those as little worth the eye that it draws alone, as is every MCP
// tool's, and a skill loaded. Any other tool, one that asks or tells something, ends a span.
const CALLS = new Set([
  'Read',
  'Grep',
  'Glob',
  'Bash',
  'WebSearch',
  'WebFetch',
  'ToolSearch',
  'Skill',
  'TaskStop',
  ...['TaskOutput', 'TaskList', 'TaskGet', 'CronList', 'ListAgents', 'ScheduleWakeup', 'Monitor'],
])
// The calls that look at tasks, background or scheduled, and change none.
const CHECKS = new Set(['TaskOutput', 'TaskList', 'TaskGet', 'CronList'])
// A background task's notice that it ended is a call of its span too, under
// this name, which no tool has; keyed by its task. A task that notifies more
// than once has no call of its own: the rows could not be told apart, so they
// are the engine's.
const NOTICE = 'Notification'
const ENDINGS = new Set(['completed', 'failed', 'killed'])

/** Whether a task's status is one of those that end it. */
export const isEnding = (status: string) => ENDINGS.has(status)

/** The id a task's notice is a call under. */
export const noticeId = (task: string) => `task:${task}`

/** The call a notice draws as: its summary for the input, how it ended for the result. */
export const noticeCall = (task: string, status: string, summary: string): ToolGroupCall => ({
  tool_use_id: noticeId(task),
  tool: NOTICE,
  input: { summary },
  isRunning: false,
  isErrored: status === 'failed',
  isInterrupted: status === 'killed',
})

/** What a tool is to a span: an edit, a call it folds, or neither (it ends the span). */
export const kindOf = (tool: string) =>
  EDITS.has(tool) ? ('edits' as const) : CALLS.has(tool) || tool.startsWith('mcp__') ? ('calls' as const) : undefined

/** The setting that says how a tool's call is drawn: an edit's is the diffs', a skill's the skills', any other's the commands'. */
export const levelKeyOf = (tool: string) =>
  kindOf(tool) === 'edits' ? ('diffs' as const) : tool === 'Skill' ? ('skills' as const) : ('commands' as const)

/**
 * A tool's name as the engine draws it. A web-fetch agent stands in for
 * WebFetch where a session lacks it, and is that tool, its result too, which
 * names no input: its id is kept in `fetches`, the set the caller owns.
 */
export const toolOf = (fetches: Set<string>, id: string, tool: string, input?: unknown) => {
  if (tool === 'Agent' && (input as { subagent_type?: unknown } | undefined)?.subagent_type === 'web-fetch') {
    fetches.add(id)
  }

  return fetches.has(id) ? 'WebFetch' : tool
}

// The calls' words, after the engine's own line, the others counted bare:
// «Read 2 files, 3 commands, 6 browser actions».
const BROWSER = 'mcp__claude-in-chrome__'

/** The calls counted by kind in words: «Read 2 files, 3 commands». */
export const callsWord = (calls: readonly ToolGroupCall[]) => {
  const kinds: { is: (tool: string) => boolean; verb: string; noun: string }[] = [
    { is: tool => tool === 'Read', verb: 'read ', noun: 'file' },
    { is: tool => tool === 'Grep' || tool === 'Glob', verb: 'searched for ', noun: 'pattern' },
    { is: tool => tool === 'Bash', verb: '', noun: 'command' },
    { is: tool => tool.startsWith(BROWSER), verb: '', noun: 'browser action' },
    { is: tool => tool === 'WebSearch' || tool === 'WebFetch', verb: '', noun: 'web lookup' },
    { is: tool => tool === 'ToolSearch', verb: '', noun: 'tool search' },
    { is: tool => tool === 'Skill', verb: '', noun: 'skill' },
    { is: tool => tool === 'TaskStop', verb: 'stopped ', noun: 'task' },
    { is: tool => CHECKS.has(tool), verb: 'checked ', noun: 'task' },
    { is: tool => tool === 'Monitor', verb: '', noun: 'monitor' },
    { is: tool => tool === 'ListAgents', verb: '', noun: 'agent list' },
    { is: tool => tool === 'ScheduleWakeup', verb: '', noun: 'wakeup' },
    { is: tool => tool === NOTICE, verb: '', noun: 'notification' },
    { is: tool => tool.startsWith('mcp__') && !tool.startsWith(BROWSER), verb: '', noun: 'MCP call' },
  ]
  const text = kinds
    .map(({ is, verb, noun }) => ({ verb, noun, n: calls.filter(call => is(call.tool)).length }))
    .filter(({ n }) => n > 0)
    .map(({ verb, noun, n }) => `${verb}${n} ${noun}${n === 1 ? '' : 's'}`)
    .join(', ')

  return text.charAt(0).toUpperCase() + text.slice(1)
}
