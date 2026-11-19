import { expect, test } from 'claude-code/testing'

import { mcpOutward } from '../hooks/mcp'

const READ_VERBS = ['get', 'list', 'search', 'query', 'read', 'fetch', 'lookup', 'find', 'view', 'show']
const WRITE_VERBS = [
  'add',
  'apply',
  'assign',
  'create',
  'delete',
  'edit',
  'grant',
  'insert',
  'publish',
  'remove',
  'replace',
  'respond',
  'revoke',
  'send',
  'set',
  'submit',
  'transition',
  'update',
  'upload',
  'write',
]
const AMBIGUOUS_VERBS = [
  'archive',
  'close',
  'comment',
  'copy',
  'deploy',
  'execute',
  'forward',
  'invite',
  'label',
  'mark',
  'merge',
  'move',
  'post',
  'reply',
  'resolve',
  'run',
  'share',
  'trash',
]
const READ_NOUNS = ['status', 'info', 'id', 'ids', 'list', 'history', 'details', 'count', 'logs']

/** Whether the tool asks. */
const asks = (tool: string) => mcpOutward(tool) === tool

test('a tool whose name starts with a read verb reads', () => {
  for (const verb of READ_VERBS) {
    expect(mcpOutward(`mcp__x__${verb}_thing`), verb).toBeUndefined()
  }

  expect(mcpOutward('mcp__mail__search_threads')).toBeUndefined()
  expect(mcpOutward('mcp__cloud__cloud_get_project')).toBeUndefined()
})

test('a tool that is not a read is named whole', () => {
  expect(mcpOutward('mcp__mail__send_message')).toBe('mcp__mail__send_message')
  expect(mcpOutward('mcp__x__whoami')).toBe('mcp__x__whoami')
})

test('a read verb joined to a verb that writes writes', () => {
  for (const verb of WRITE_VERBS) {
    expect(asks(`mcp__x__get_${verb}`), verb).toBe(true)
  }

  expect(asks('mcp__x__find_and_replace')).toBe(true)
  expect(asks('mcp__x__get_and_delete')).toBe(true)
})

test('an ambiguous word after a read verb reads, unless a joiner leads it', () => {
  for (const verb of AMBIGUOUS_VERBS) {
    expect(asks(`mcp__x__get_${verb}`), verb).toBe(false)
    expect(asks(`mcp__x__get_and_${verb}`), verb).toBe(true)
  }

  for (const joiner of ['and', 'or', 'then']) {
    expect(asks(`mcp__x__get_${joiner}_run`), joiner).toBe(true)
  }

  expect(asks('mcp__jira__getConfluenceCommentChildren')).toBe(false)
  expect(asks('mcp__gmail__list_labels')).toBe(false)
})

test('an ambiguous leading verb reads only where a read noun ends the name', () => {
  for (const verb of AMBIGUOUS_VERBS) {
    expect(asks(`mcp__x__${verb}`), verb).toBe(true)
    expect(asks(`mcp__x__${verb}_status`), verb).toBe(false)
  }

  for (const noun of READ_NOUNS) {
    expect(asks(`mcp__x__deploy_${noun}`), noun).toBe(false)
  }

  expect(asks('mcp__x__resolve_library_id')).toBe(false)
  expect(asks('mcp__x__resolve_thread')).toBe(true)
  expect(asks('mcp__x__deploy_info_x')).toBe(true)
})

test('a name with no verb asks', () => {
  expect(asks('mcp__x__whoami')).toBe(true)
  expect(asks('mcp__x__batch')).toBe(true)
  expect(asks('mcp__x__')).toBe(true)
  expect(asks('mcp__x')).toBe(true)
  expect(asks('mcp')).toBe(true)
})

test('the server of the tool is no verb of it', () => {
  expect(asks('mcp__search__whoami')).toBe(true)
  expect(asks('mcp__get__send')).toBe(true)
})

test('a tool name with a double underscore is read by all its words', () => {
  expect(asks('mcp__s__get__project')).toBe(false)
  expect(asks('mcp__a__b__get__c')).toBe(false)
  expect(asks('mcp__a__get__delete')).toBe(true)
})

test('a name is split at marks and at a capital after a lower-case letter or a digit', () => {
  expect(asks('mcp__x__getJiraIssue')).toBe(false)
  expect(asks('mcp__x__GetProject')).toBe(false)
  expect(asks('mcp__x__getV2Delete')).toBe(true)
  expect(asks('mcp__x__get2Run')).toBe(true)
  expect(asks('mcp__x__getA1Delete')).toBe(true)
  expect(asks('mcp__x__get-docs-delete')).toBe(true)
  expect(asks('mcp__context7__resolve-library-id')).toBe(false)
})

test('a verb is read in any case', () => {
  expect(asks('mcp__x__GET_THING')).toBe(false)
  expect(asks('mcp__x__Search')).toBe(false)
  expect(asks('mcp__x__GET_DELETE')).toBe(true)
})

test('a trailing mark is no word', () => {
  expect(asks('mcp__x__deploy_status_')).toBe(false)
  expect(asks('mcp__x__get_thing__')).toBe(false)
})
