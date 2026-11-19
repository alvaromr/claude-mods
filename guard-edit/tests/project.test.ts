import { expect, test } from 'claude-code/testing'

import { askedOf, caughtOf, denial, projectArgs } from '../hooks/project'

const repo = { path: '/repo/a.ts', how: 'tee' }
const scratch = { path: '/tmp/a', how: 'tee' }
const copy = { path: '/repo/b.ts', how: 'cp', ifExists: true }

test('a write to a scratch folder is not asked of git', () => {
  expect(askedOf([repo, scratch, copy])).toEqual([repo, copy])
  expect(askedOf([scratch])).toEqual([])
  expect(askedOf([])).toEqual([])
})

test('a path that counts only where a file is there is marked', () => {
  expect(projectArgs([repo, copy])).toEqual(['/repo/a.ts', '?/repo/b.ts'])
})

test('the writes caught are those whose path git printed', () => {
  expect(caughtOf([repo, copy], '/repo/b.ts\n\n')).toEqual([copy])
  expect(caughtOf([repo, copy], '')).toEqual([])
  expect(caughtOf([repo, copy], '/repo/a.ts\n/repo/b.ts\n')).toEqual([repo, copy])
  expect(caughtOf([repo, copy], '/repo/other.ts\n')).toEqual([])
})

test('the denial names each file and each way once, by the plugin', () => {
  const message = denial('guard-edit', [repo, repo, { path: '/repo/b.ts', how: 'sed -i' }, copy])

  expect(message).toContain('guard-edit: this command writes /repo/a.ts, /repo/b.ts from the shell (tee, sed -i, cp)')
  expect(message).toContain('change it with Edit or Write')
  expect(message).toContain('files git ignores is allowed.')
})
