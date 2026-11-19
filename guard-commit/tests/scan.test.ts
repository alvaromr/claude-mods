import { expect, test } from 'claude-code/testing'

import type { Found } from '../hooks/git'
import { scan } from '../hooks/scan'

/** What `scan` finds in a script. */
const scanned = (script: string) => {
  const result: Found = { writes: false, signs: false, env: new Map() }

  scan(script, result)

  return result
}

const SIGNED = { writes: true, signs: true }
const NOTHING = { writes: false, signs: false }

test('a git command anywhere in the line is scanned', () => {
  expect(scanned('git commit')).toMatchObject({ writes: true, signs: false })
  expect(scanned('git commit -S && git commit')).toMatchObject(SIGNED)
  expect(scanned('cd x; git tag -s')).toMatchObject({ writes: false, signs: true })
  expect(scanned('ls\ngit commit -S')).toMatchObject(SIGNED)
  expect(scanned('sudo git commit -S')).toMatchObject(SIGNED)
  expect(scanned('git commit \\\n -S')).toMatchObject(SIGNED)
  expect(scanned('git commit -S > out')).toMatchObject(SIGNED)
  expect(scanned('ls -la')).toMatchObject(NOTHING)
})

test('git given by its path, or quoted, is scanned', () => {
  expect(scanned('/usr/bin/git commit -S')).toMatchObject(SIGNED)
  expect(scanned('"git" commit -S')).toMatchObject(SIGNED)
})

test('the assignments of the line are kept, whatever they hold', () => {
  expect([...scanned('FOO=1 BAR=a=b git commit').env]).toEqual([
    ['FOO', '1'],
    ['BAR', 'a=b'],
  ])
  expect([...scanned('x=1').env]).toEqual([['x', '1']])
  expect([...scanned('X=').env]).toEqual([['X', '']])
  expect([...scanned('git commit').env]).toEqual([])
})

test('a substitution in double quotes is scanned', () => {
  expect(scanned('echo "$(git commit -S)"')).toMatchObject(SIGNED)
  expect(scanned('git commit -m "$(git commit -S)"')).toMatchObject(SIGNED)
  expect(scanned('bash -c "echo $(git commit -S)"')).toMatchObject(SIGNED)
  expect(scanned("echo '$(git commit -S)'")).toMatchObject(NOTHING)
})

test('what eval runs is scanned', () => {
  expect(scanned('eval git commit -S')).toMatchObject(SIGNED)
  expect(scanned('eval "git commit -S"')).toMatchObject(SIGNED)
})

test('the script of a shell -c is scanned, behind its options', () => {
  for (const shell of ['sh', 'bash', 'zsh', 'dash', 'ksh', 'ash']) {
    expect(scanned(`${shell} -c "git commit -S"`), shell).toMatchObject(SIGNED)
  }

  expect(scanned('bash -o pipefail -c "git commit -S"')).toMatchObject(SIGNED)
  expect(scanned('bash -lc "git commit -S"')).toMatchObject(SIGNED)
})

test('a shell without -c, or one that is none, runs no script', () => {
  expect(scanned('bash -c')).toMatchObject(NOTHING)
  expect(scanned('bash script.sh')).toMatchObject(NOTHING)
  expect(scanned('fish -c "git commit -S"')).toMatchObject(NOTHING)
  expect(scanned('bash -x "git commit -S"')).toMatchObject(NOTHING)
})

test('a git inside a shell inside a shell is scanned', () => {
  expect(scanned('bash -c "bash -c \\"git commit -S\\""')).toMatchObject(SIGNED)
})
