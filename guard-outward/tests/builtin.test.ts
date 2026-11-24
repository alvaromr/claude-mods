import { expect, test } from 'claude-code/testing'

import { builtinOutward } from '../hooks/builtin'

test('a tool that always sends or publishes is named, whatever its input', () => {
  for (const tool of ['PublishPlugin', 'SendFile', 'SendToProject', 'ShareOnboardingGuide']) {
    expect(builtinOutward(tool, {}), tool).toBe(tool)
    expect(builtinOutward(tool, undefined), tool).toBe(tool)
    expect(builtinOutward(tool, null), tool).toBe(tool)
  }
})

test('an action that deletes, publishes to others or runs remotely is named with its action', () => {
  expect(builtinOutward('Artifact', { action: 'delete', url: 'u' })).toBe('Artifact delete')
  expect(builtinOutward('ArtifactComments', { action: 'reply', url: 'u', thread_id: 't', text: 'x' })).toBe(
    'ArtifactComments reply',
  )
  expect(builtinOutward('ArtifactComments', { action: 'resolve', url: 'u', thread_id: 't' })).toBe(
    'ArtifactComments resolve',
  )
  expect(builtinOutward('DesignSync', { method: 'delete_files', projectId: 'p' })).toBe('DesignSync delete_files')
  expect(builtinOutward('Projects', { method: 'project_delete', path: 'a.md' })).toBe('Projects project_delete')

  for (const action of ['create', 'update', 'run', 'create_webhook_trigger']) {
    expect(builtinOutward('RemoteTrigger', { action }), action).toBe(`RemoteTrigger ${action}`)
  }
})

test('an action that reads or stays private is not named', () => {
  for (const action of ['publish', 'list', 'read', 'open', 'pin', 'unpin', 'quickstart']) {
    expect(builtinOutward('Artifact', { action, url: 'u' }), action).toBeUndefined()
  }

  for (const action of ['read', 'watch']) {
    expect(builtinOutward('ArtifactComments', { action, url: 'u' }), action).toBeUndefined()
  }

  for (const action of ['list', 'get', 'list_runs', 'get_run_log']) {
    expect(builtinOutward('RemoteTrigger', { action }), action).toBeUndefined()
  }

  for (const method of [
    'list_projects',
    'get_project',
    'list_files',
    'get_file',
    'finalize_plan',
    'write_files',
    'register_assets',
    'unregister_assets',
    'create_project',
    'report_validate',
  ]) {
    expect(builtinOutward('DesignSync', { method }), method).toBeUndefined()
  }

  for (const method of ['project_info', 'project_read', 'project_search', 'project_write', 'project_memory_list']) {
    expect(builtinOutward('Projects', { method }), method).toBeUndefined()
  }
})

test('an artifact publish starts private, so only a forced one is named', () => {
  expect(builtinOutward('Artifact', { file_path: 'a.html' })).toBeUndefined()
  expect(builtinOutward('Artifact', { file_path: 'a.html', force: false })).toBeUndefined()
  expect(builtinOutward('Artifact', { file_path: 'a.html', force: true })).toBe('Artifact publish force')
  expect(builtinOutward('Artifact', { action: 'publish', force: true })).toBe('Artifact publish force')
  expect(builtinOutward('Artifact', { action: 'read', force: true })).toBeUndefined()
})

test('automatic replies to comments are named only where they are turned on', () => {
  expect(builtinOutward('ArtifactComments', { action: 'watch', url: 'u', replies: true })).toBe(
    'ArtifactComments watch replies',
  )
  expect(builtinOutward('ArtifactComments', { action: 'watch', url: 'u', replies: false })).toBeUndefined()
  expect(builtinOutward('ArtifactComments', { action: 'read', replies: true })).toBeUndefined()
})

test('an artifact database write is named only where it deletes', () => {
  const write = (op: string) => ({ op, collection: 'c', doc_id: 'd' })

  expect(builtinOutward('ArtifactData', { action: 'delete', url: 'u', collection: 'c', doc_id: 'd' })).toBe(
    'ArtifactData delete',
  )
  expect(builtinOutward('ArtifactData', { action: 'batch', url: 'u', writes: [write('set'), write('delete')] })).toBe(
    'ArtifactData delete',
  )
  expect(builtinOutward('ArtifactData', { action: 'batch', url: 'u', writes: [write('set'), write('update')] })).toBe(
    undefined,
  )
  expect(builtinOutward('ArtifactData', { action: 'batch', url: 'u', writes: [null, 'x'] })).toBeUndefined()
  expect(builtinOutward('ArtifactData', { action: 'batch', url: 'u' })).toBeUndefined()
  expect(builtinOutward('ArtifactData', { action: 'batch', url: 'u', writes: 'delete' })).toBeUndefined()
  expect(builtinOutward('ArtifactData', { action: 'update', writes: [write('delete')] })).toBeUndefined()

  for (const action of ['get', 'list', 'query', 'profiles', 'set', 'update', 'str_replace']) {
    expect(builtinOutward('ArtifactData', { action, url: 'u' }), action).toBeUndefined()
  }
})

test('a message is named only where it goes to a bridge address', () => {
  expect(builtinOutward('SendMessage', { to: 'bridge:session_1', message: 'hi' })).toBe('SendMessage bridge')
  expect(builtinOutward('SendMessage', { to: 'uds:/tmp/s.sock', message: 'hi' })).toBeUndefined()
  expect(builtinOutward('SendMessage', { to: 'main', message: 'hi' })).toBeUndefined()
  expect(builtinOutward('SendMessage', { to: 'worker', message: 'hi' })).toBeUndefined()
  expect(builtinOutward('SendMessage', { to: 'a1b2c3', message: 'hi' })).toBeUndefined()
  expect(builtinOutward('SendMessage', { to: { x: 'bridge:1' }, message: 'hi' })).toBeUndefined()
  expect(builtinOutward('SendMessage', { message: 'hi' })).toBeUndefined()
})

test('a subagent is named only where it runs remotely', () => {
  expect(builtinOutward('Agent', { description: 'd', prompt: 'p', isolation: 'remote' })).toBe('Agent remote')
  expect(builtinOutward('Agent', { description: 'd', prompt: 'p', isolation: 'worktree' })).toBeUndefined()
  expect(builtinOutward('Agent', { description: 'd', prompt: 'p' })).toBeUndefined()
})

test('the tools that stay with the person or this machine are not named', () => {
  for (const tool of [
    'SendFeedback',
    'SendUserMessage',
    'SendUserFile',
    'PushNotification',
    'CronCreate',
    'CronDelete',
    'ScheduleWakeup',
    'WebFetch',
    'WebSearch',
    'ClaudeDesign',
    'ArtifactCheck',
    'Read',
    'Write',
    'Edit',
  ]) {
    expect(
      builtinOutward(tool, { action: 'delete', method: 'delete_files', isolation: 'remote' }),
      tool,
    ).toBeUndefined()
  }
})

test('a call with no input, or an input that is no object, names nothing', () => {
  for (const tool of ['Artifact', 'ArtifactComments', 'ArtifactData', 'RemoteTrigger', 'DesignSync', 'Projects']) {
    expect(builtinOutward(tool, undefined), tool).toBeUndefined()
    expect(builtinOutward(tool, null), tool).toBeUndefined()
    expect(builtinOutward(tool, 'delete'), tool).toBeUndefined()
  }
})
