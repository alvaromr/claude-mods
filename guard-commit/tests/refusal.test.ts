import { expect, test } from 'claude-code/testing'

import { refusal } from '../hooks/refusal'

const ATTRIBUTION = 'commits and PRs carry only the user’s authorship, drop the attribution lines.'
const SIGNING = 'commits and tags are never signed, drop the signing flag or setting.'

test('each git subcommand that writes history is refused with an attribution', () => {
  for (const sub of ['commit', 'merge', 'rebase', 'cherry-pick', 'revert', 'am']) {
    expect(refusal(`git ${sub} -m "Co-Authored-By: Claude"`), sub).toBe(ATTRIBUTION)
  }
})

test('a tag is refused with an attribution only where it is given a message', () => {
  expect(refusal('git tag -a v1 -m "Co-Authored-By: Claude"')).toBe(ATTRIBUTION)
  expect(refusal('git tag -F notes.txt v1 && echo "Co-Authored-By: Claude"')).toBe(ATTRIBUTION)
  expect(refusal('git tag --list "v*" && git log --grep="Co-Authored-By"')).toBeUndefined()
})

test('each gh command that writes is refused with an attribution', () => {
  for (const sub of ['pr', 'issue', 'release']) {
    expect(refusal(`gh ${sub} create --body "Co-Authored-By: Claude"`), sub).toBe(ATTRIBUTION)
  }

  for (const action of ['create', 'edit', 'comment', 'merge', 'review']) {
    expect(refusal(`gh pr ${action} 3 --body "Co-Authored-By: Claude"`), action).toBe(ATTRIBUTION)
  }

  expect(refusal('gh pr view 3 --comments "Co-Authored-By: Claude"')).toBeUndefined()
  expect(refusal('gh repo create --body "Co-Authored-By: Claude"')).toBeUndefined()
})

test('each kind of attribution is found, whatever its case', () => {
  for (const line of [
    'Co-Authored-By: Claude',
    'co-authored-by: someone',
    'Claude-Session: abc',
    'Claude <noreply@anthropic.com>',
    'Generated with [Claude Code](https://claude.com/claude-code)',
    'Generated with Claude Code',
    'GENERATED WITH CLAUDE CODE',
  ]) {
    expect(refusal(`git commit -m "${line}"`), line).toBe(ATTRIBUTION)
  }
})

test('a command that writes nothing, naming a trailer, runs', () => {
  expect(refusal('git log --grep="Co-Authored-By"')).toBeUndefined()
  expect(refusal('echo "Co-Authored-By: Claude"')).toBeUndefined()
  expect(refusal('git commit -m "Fix the parser"')).toBeUndefined()
})

test('a signing flag or setting is refused', () => {
  for (const command of [
    'git commit -S -m x',
    'git tag -s v1',
    'git config commit.gpgsign true',
    'git -c commit.gpgsign=true commit',
    'bash -c "git commit -S"',
  ]) {
    expect(refusal(command), command).toBe(SIGNING)
  }
})

test('a signing setting in the environment is refused', () => {
  expect(refusal('GIT_CONFIG_KEY_0=commit.gpgsign GIT_CONFIG_VALUE_0=true git commit')).toBe(SIGNING)
  expect(refusal('export GIT_CONFIG_KEY_0=tag.gpgsign GIT_CONFIG_VALUE_0=1; git tag v1')).toBe(SIGNING)
  expect(refusal('GIT_CONFIG_KEY_0=commit.gpgsign GIT_CONFIG_VALUE_0=false git commit')).toBeUndefined()
})

test('a signed commit with an attribution is refused for the attribution first', () => {
  expect(refusal('git commit -S -m "Co-Authored-By: Claude"')).toBe(ATTRIBUTION)
})

test('a command that does neither runs', () => {
  expect(refusal('git commit --no-gpg-sign -m x')).toBeUndefined()
  expect(refusal('ls')).toBeUndefined()
  expect(refusal('')).toBeUndefined()
})
