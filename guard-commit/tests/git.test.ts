import { expect, test } from 'claude-code/testing'

import { type Found, scanGit } from '../hooks/git'

/** What `scanGit` finds in a git command, given as the words after `git`. */
const found = (line: string) => {
  const result: Found = { writes: false, signs: false, env: new Map() }

  scanGit(line.split(' '), result)

  return { writes: result.writes, signs: result.signs }
}

const WRITES = { writes: true, signs: false }
const SIGNS = { writes: true, signs: true }
const NOTHING = { writes: false, signs: false }

test('the subcommands that write history are found', () => {
  for (const sub of ['commit', 'merge', 'rebase', 'cherry-pick', 'revert', 'am']) {
    expect(found(`${sub} x`), sub).toEqual(WRITES)
  }
})

test('the subcommands that only read write nothing', () => {
  for (const line of ['log --grep x', 'status -S', 'push -S', 'pull x', 'config x', 'tag', 'tag v1', 'tag -l', '']) {
    expect(found(line), line).toEqual(NOTHING)
  }
})

test('a tag writes only where it is given a message', () => {
  for (const line of ['tag -a v1 -m x', 'tag -am x v1', 'tag -F f v1', 'tag --message=x', 'tag --file f']) {
    expect(found(line).writes, line).toBe(true)
  }

  expect(found('tag v1 --messagex').writes).toBe(false)
  expect(found('tag -s v1').writes).toBe(false)
})

test('a signing flag signs on each subcommand that takes one', () => {
  for (const sub of ['commit', 'merge', 'rebase', 'cherry-pick', 'revert', 'am', 'pull']) {
    expect(found(`${sub} -S`).signs, sub).toBe(true)
    expect(found(`${sub} --gpg-sign=K`).signs, sub).toBe(true)
  }

  expect(found('push -S').signs).toBe(false)
  expect(found('status -S').signs).toBe(false)
  expect(found('commit -a').signs).toBe(false)
})

test('a tag is signed by its own flags, not those of a commit', () => {
  for (const line of ['tag -s v1', 'tag -u K v1', 'tag --sign v1', 'tag --local-user=K v1', 'tag -sm x v1']) {
    expect(found(line).signs, line).toBe(true)
  }

  expect(found('tag -S v1').signs).toBe(false)
  expect(found('tag -ms x').signs).toBe(false)
  expect(found('commit -s').signs).toBe(false)
})

test('git config turning signing on signs, and writes nothing', () => {
  expect(found('config commit.gpgsign true')).toEqual({ writes: false, signs: true })
  expect(found('config user.signingkey K')).toEqual({ writes: false, signs: true })
  expect(found('config commit.gpgsign false')).toEqual(NOTHING)
  expect(found('config user.signingkey --get')).toEqual(NOTHING)
})

test('-c sets a setting, apart or attached', () => {
  expect(found('-c commit.gpgsign=true commit')).toEqual(SIGNS)
  expect(found('-c commit.gpgsign commit')).toEqual(SIGNS)
  expect(found('-ccommit.gpgsign=true commit')).toEqual(SIGNS)
  expect(found('-ccommit.gpgsign commit')).toEqual(SIGNS)
  expect(found('-c commit.gpgsign=false commit')).toEqual(WRITES)
  expect(found('-c user.name=x commit')).toEqual(WRITES)
  expect(found('-c commit.gpgsign=1 -c user.name=x commit')).toEqual(SIGNS)
})

test('--config-env counts as set, as its value is read from the environment', () => {
  expect(found('--config-env commit.gpgsign=X commit')).toEqual(SIGNS)
  expect(found('--config-env=commit.gpgsign=X commit')).toEqual(SIGNS)
  expect(found('--config-env=commit.gpgsign commit')).toEqual(SIGNS)
  expect(found('--config-env user.name=X commit')).toEqual(WRITES)
  expect(found('--config-env=user.name=X commit')).toEqual(WRITES)
})

test('a -c with nothing after it sets nothing', () => {
  expect(found('-c')).toEqual(NOTHING)
})

test('the options of git that take a value skip it before the subcommand', () => {
  for (const option of ['-C', '--git-dir', '--work-tree', '--namespace', '--super-prefix', '--attr-source']) {
    expect(found(`${option} x commit`), option).toEqual(WRITES)
  }
})

test('the options of git that take none skip themselves alone', () => {
  expect(found('--git-dir=/x commit')).toEqual(WRITES)
  expect(found('--no-pager commit')).toEqual(WRITES)
  expect(found('-C /tmp commit -m x')).toEqual(WRITES)
})

test('what is found is added to what was, never taken away', () => {
  const result: Found = { writes: true, signs: true, env: new Map() }

  scanGit(['log'], result)

  expect(result).toEqual({ writes: true, signs: true, env: new Map() })
})
