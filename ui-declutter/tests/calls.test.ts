import { expect, test } from 'claude-code/testing'
import type { ToolGroupCall } from 'claude-code'

import { callsWord, isEnding, kindOf, levelKeyOf, noticeCall, noticeId, toolOf } from '../hooks/calls'

const call = (tool: string): ToolGroupCall => ({
  tool_use_id: tool,
  tool,
  input: {},
  isRunning: false,
  isErrored: false,
  isInterrupted: false,
})

test('a tool is an edit, a call a span folds, or neither, which ends the span', () => {
  expect(['Edit', 'Write'].map(kindOf)).toEqual(['edits', 'edits'])
  expect(['Read', 'Bash', 'Skill', 'Monitor', 'mcp__github__get_issue'].map(kindOf)).toEqual(
    Array.from({ length: 5 }, () => 'calls'),
  )
  expect(['AskUserQuestion', 'Agent', 'TodoWrite'].map(kindOf)).toEqual([undefined, undefined, undefined])
})

test('a web-fetch agent is the WebFetch tool, its result too, which names no input', () => {
  const fetches = new Set<string>()

  expect(toolOf(fetches, 'a', 'Agent', { subagent_type: 'web-fetch' })).toBe('WebFetch')
  expect(toolOf(fetches, 'a', 'Agent')).toBe('WebFetch')
})

test('any other agent, and any other tool, keeps its name', () => {
  const fetches = new Set<string>()

  expect(toolOf(fetches, 'a', 'Agent', { subagent_type: 'Explore' })).toBe('Agent')
  expect(toolOf(fetches, 'b', 'Agent')).toBe('Agent')
  expect(toolOf(fetches, 'c', 'Read', { file_path: '/x' })).toBe('Read')
  expect(fetches.size).toBe(0)
})

test('only a task that completed, failed or was killed has ended', () => {
  expect(['completed', 'failed', 'killed'].map(isEnding)).toEqual([true, true, true])
  expect(['running', 'pending', ''].map(isEnding)).toEqual([false, false, false])
})

test('a notice is a call under its task, drawn with its summary and how the task ended', () => {
  expect(noticeId('t1')).toBe('task:t1')
  expect(noticeCall('t1', 'completed', 'Build done')).toEqual({
    tool_use_id: 'task:t1',
    tool: 'Notification',
    input: { summary: 'Build done' },
    isRunning: false,
    isErrored: false,
    isInterrupted: false,
  })
  expect(noticeCall('t1', 'failed', '').isErrored).toBe(true)
  expect(noticeCall('t1', 'killed', '').isInterrupted).toBe(true)
})

test("calls are counted by kind after the engine's own line, the first letter capital", () => {
  expect(callsWord([call('Read'), call('Read'), call('Bash')])).toBe('Read 2 files, 1 command')
  expect(callsWord([call('Grep'), call('Glob')])).toBe('Searched for 2 patterns')
  expect(callsWord([call('TaskStop'), call('TaskOutput')])).toBe('Stopped 1 task, checked 1 task')
  expect(callsWord([call('Notification'), call('Skill'), call('WebFetch')])).toBe(
    '1 web lookup, 1 skill, 1 notification',
  )
})

test('browser actions and other MCP calls are counted apart', () => {
  expect(
    callsWord([call('mcp__claude-in-chrome__click'), call('mcp__github__get_issue'), call('mcp__github__x')]),
  ).toBe('1 browser action, 2 MCP calls')
})

test('no calls have no words', () => {
  expect(callsWord([])).toBe('')
})

test("an edit's level is the diffs', a skill's the skills', any other tool's the commands'", () => {
  expect(['Edit', 'Write'].map(levelKeyOf)).toEqual(['diffs', 'diffs'])
  expect(levelKeyOf('Skill')).toBe('skills')
  expect(['Bash', 'Read', 'mcp__github__get_issue', 'AskUserQuestion'].map(levelKeyOf)).toEqual(
    Array.from({ length: 4 }, () => 'commands'),
  )
})
