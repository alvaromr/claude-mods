import { expect, test } from 'claude-code/testing'

import { READ_MS, isRead, readOf, repoOf } from '../hooks/repo'

const ok = (stdout: string) => ({ stdout, exitCode: 0 })
const PENDING = [
  '# branch.oid 1234567890',
  '# branch.head main',
  '# branch.upstream origin/main',
  '# branch.ab +2 -0',
  '1 .M f',
  '? g',
].join('\n')

test('git may take ten seconds to read each part', () => {
  expect(READ_MS).toBe(10_000)
})

test('a read runs in the session’s own folder unless one is named', () => {
  expect(readOf()).toEqual({ timeoutMs: READ_MS })
  expect(readOf('/work/other')).toEqual({ timeoutMs: READ_MS, cwd: '/work/other' })
})

test('git status found a repository when it ran and ended well', () => {
  expect(isRead(ok(''))).toBe(true)
  expect(isRead({ stdout: '', exitCode: 128 })).toBe(false)
  expect(isRead(undefined)).toBe(false)
})

test('the branch, the files, the changed lines and the commits no remote has are read from what git printed', () => {
  expect(repoOf(PENDING, ok('10\t3\tf\n-\t-\tlogo.png\n4\t0\n'), ok('2\n'))).toEqual({
    branch: 'main',
    dirty: 2,
    added: 14,
    removed: 3,
    ahead: 2,
  })
})

test('a branch name keeps its slashes and spaces', () => {
  expect(repoOf('# branch.head feature/a b\n', ok(''), ok('0')).branch).toBe('feature/a b')
})

test('a detached head is the commit’s short id', () => {
  expect(repoOf('# branch.oid 1234567890\n# branch.head (detached)\n', ok(''), ok('0')).branch).toBe('1234567')
})

test('a detached head with no commit id is as git says', () => {
  expect(repoOf('# branch.head (detached)\n', ok(''), ok('0')).branch).toBe('(detached)')
})

test('a status with no branch line has no branch', () => {
  expect(repoOf('1 .M f\n', ok(''), ok('0')).branch).toBe('')
})

test('every line of the status that is no header is a file with changes, untracked ones too', () => {
  const status = ['# branch.head main', '1 .M a', '2 R. b', '? c', '', ''].join('\n')

  expect(repoOf(status, ok(''), ok('0')).dirty).toBe(3)
  expect(repoOf('# branch.head main\n', ok(''), ok('0')).dirty).toBe(0)
})

test('the lines are counted as none, not as 0, where git could not count them', () => {
  const counted = (lines: { stdout: string; exitCode: number } | undefined) => {
    const { added, removed } = repoOf(PENDING, lines, ok('0'))

    return [added, removed]
  }

  expect(counted(undefined)).toEqual([null, null])
  expect(counted({ stdout: '5\t1\tf\n', exitCode: 1 })).toEqual([null, null])
  expect(counted(ok(''))).toEqual([0, 0])
})

test('a row of lines that is no number counts as 0', () => {
  expect(repoOf(PENDING, ok('-\t-\tlogo.png\nx\ty\t\n'), ok('0'))).toMatchObject({ added: 0, removed: 0 })
})

test('the commits no remote has are 0 where git could not count them', () => {
  expect(repoOf(PENDING, ok(''), undefined).ahead).toBe(0)
  expect(repoOf(PENDING, ok(''), ok('nope')).ahead).toBe(0)
  expect(repoOf(PENDING, ok(''), ok(' 3 \n')).ahead).toBe(3)
})
