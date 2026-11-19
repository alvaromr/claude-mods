import { expect, test } from 'claude-code/testing'

import { bashOutward, gitOutward } from '../hooks/bash'

const words = (line: string) => line.split(' ')

/** What `git <line>` sends. */
const git = (line: string) => gitOutward(words(line), [])

test('a git subcommand that sends is named', () => {
  expect(git('push')).toBe('git push')
  expect(git('send-email x')).toBe('git send-email')
  expect(git('imap-send')).toBe('git imap-send')
})

test('a git subcommand that does not send, or none, sends nothing', () => {
  for (const line of ['', 'status', 'commit -m push', 'stash push -m wip', 'foo push', 'alias', '-c']) {
    expect(git(line), line).toBeUndefined()
  }
})

test('a sending verb of another subcommand is found past its options', () => {
  expect(git('subtree push --prefix=x o')).toBe('git subtree push')
  expect(git('subtree -q push o')).toBe('git subtree push')
  expect(git('lfs push o')).toBe('git lfs push')
  expect(git('svn dcommit')).toBe('git svn dcommit')
})

test('a subcommand with no verb, or one that does not send, sends nothing', () => {
  for (const line of ['subtree', 'subtree split', 'lfs', 'lfs pull', 'svn', 'svn rebase', 'subtree -q']) {
    expect(git(line), line).toBeUndefined()
  }
})

test('a dry run sends nothing', () => {
  expect(git('push -n')).toBeUndefined()
  expect(git('push --dry-run')).toBeUndefined()
  expect(git('push origin -n')).toBeUndefined()
  expect(git('subtree push --dry-run o')).toBeUndefined()
})

test('the options before the subcommand that take a word are skipped', () => {
  for (const option of ['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--super-prefix', '--config-env']) {
    expect(git(`${option} x push`), option).toBe('git push')
  }

  expect(git('--attr-source HEAD push')).toBe('git push')
  expect(git('--no-pager push')).toBe('git push')
  expect(git('--git-dir=.git push')).toBe('git push')
  expect(git('-cx=1 push')).toBe('git push')
})

test('an alias set with -c is run, in any case, with the words after it', () => {
  expect(git('-c alias.p=push p')).toBe('git push')
  expect(git('-c ALIAS.p=push p')).toBe('git push')
  expect(git('-c alias.P=push p')).toBe('git push')
  expect(git('-c alias.p=push p --force')).toBe('git push')
  expect(git('-c alias.p=push p --dry-run')).toBeUndefined()
  expect(git('-c alias.p=pull p')).toBeUndefined()
  expect(git('-c alias.p=push status')).toBeUndefined()
  expect(git('-c alias.p=push')).toBeUndefined()
})

test('an alias of several words runs them all', () => {
  expect(gitOutward(['-c', 'alias.p=push --force', 'p', 'origin'], [])).toBe('git push')
  expect(gitOutward(['-c', 'alias.p=subtree push', 'p', '--prefix=x'], [])).toBe('git subtree push')
})

test('an alias that starts with ! is a shell command, run with the words after it', () => {
  expect(gitOutward(['-c', 'alias.p=!git push', 'p'], [])).toBe('git push')
  expect(gitOutward(['-c', 'alias.p=!git push', 'p', '--force'], [])).toBe('git push')
  expect(gitOutward(['-c', 'alias.p=!git push', 'p', '--dry-run'], [])).toBeUndefined()
  expect(gitOutward(['-c', 'alias.p=!echo', 'p', 'hi'], [])).toBeUndefined()
  expect(gitOutward(['-c', 'alias.p=!chat', 'p', 'send'], [['chat', 'send']])).toBe('chat send')
})

test('an alias is set by -c alone, and only an alias', () => {
  expect(git('-cx=1 -c core.x=1 push')).toBe('git push')
  expect(gitOutward(['-C', 'alias.p=push', 'p'], [])).toBeUndefined()
  expect(gitOutward(['-c', 'core.p=push', 'p'], [])).toBeUndefined()
})

test('git submodule foreach runs its command in every submodule, past its options', () => {
  expect(git('submodule foreach git push')).toBe('git push')
  expect(git('submodule foreach --recursive git push o')).toBe('git push')
  expect(git('submodule foreach -q git push')).toBe('git push')
  expect(gitOutward(['submodule', 'foreach', 'git push'], [])).toBe('git push')
  expect(git('submodule foreach')).toBeUndefined()
  expect(git('submodule update')).toBeUndefined()
  expect(git('submodule foreach git status')).toBeUndefined()
})

test('a git command of a line that sends is named', () => {
  expect(bashOutward('git push', [])).toBe('git push')
  expect(bashOutward('cd x && git -C . push', [])).toBe('git push')
  expect(bashOutward('/usr/bin/git push', [])).toBe('git push')
  expect(bashOutward('FOO="a b" git push', [])).toBe('git push')
  expect(bashOutward('sudo -u me git push', [])).toBe('git push')
  expect(bashOutward('pnpm check\ngit push', [])).toBe('git push')
  expect(bashOutward('git status; git push', [])).toBe('git push')
})

test('the first command of the line that sends is the one named', () => {
  expect(bashOutward('git push; gh pr create', [])).toBe('git push')
  expect(bashOutward('gh pr create && git push', [])).toBe('gh pr create')
})

test('a gh command of a line that sends is named, with the command it came from', () => {
  expect(bashOutward('gh pr create --title x', [])).toBe('gh pr create')
  expect(bashOutward('timeout 60 gh pr merge 1', [])).toBe('gh pr merge')
  expect(bashOutward('gh api graphql -f query="mutation { x }"', [])).toBe('gh api graphql mutation')
  expect(bashOutward('gh pr view 1', [])).toBeUndefined()
})

test('a line that sends nothing, or runs nothing, is left alone', () => {
  for (const command of [
    '',
    'ls',
    'git status',
    'echo git push',
    'grep -r "git push" .',
    'echo "a; git push"',
    "echo \\' ; git status ; echo \\'",
    'command -v git',
    'sudo -l git push',
    'sudo -v git push',
    'FOO=bar git status',
    'git commit -m "x\ngit push"',
  ]) {
    expect(bashOutward(command, []), command).toBeUndefined()
  }
})

test('a substitution in double quotes is looked into', () => {
  expect(bashOutward('echo "$(git push)"', [])).toBe('git push')
  expect(bashOutward('echo "`git push`"', [])).toBe('git push')
  expect(bashOutward('url=$(gh pr create --fill)', [])).toBe('gh pr create')
  expect(bashOutward('echo "$(git status)"', [])).toBeUndefined()
  expect(bashOutward("echo '$(git push)'", [])).toBeUndefined()
})

test('the script of a shell -c is looked into, behind its options', () => {
  for (const shell of ['sh', 'bash', 'zsh', 'dash', 'ksh', 'ash']) {
    expect(bashOutward(`${shell} -c "git push"`, []), shell).toBe('git push')
  }

  expect(bashOutward('bash -o pipefail -c "git push"', [])).toBe('git push')
  expect(bashOutward('bash -ec "git push"', [])).toBe('git push')
  expect(bashOutward('bash -c "bash -c \\"git push\\""', [])).toBe('git push')
})

test('a shell without -c, or one that is none, runs no script', () => {
  expect(bashOutward('bash -c', [])).toBeUndefined()
  expect(bashOutward('bash script.sh git push', [])).toBeUndefined()
  expect(bashOutward('fish -c "git push"', [])).toBeUndefined()
  expect(bashOutward('bash -x "git push"', [])).toBeUndefined()
})

test('what eval runs is looked into', () => {
  expect(bashOutward('eval git push', [])).toBe('git push')
  expect(bashOutward("eval 'git push'", [])).toBe('git push')
  expect(bashOutward('eval echo git push', [])).toBeUndefined()
})

test('a command the person listed is named by the words listed', () => {
  const listed = [
    ['chat', 'send'],
    ['chat', 'react'],
  ]

  expect(bashOutward('chat send --to team hi', listed)).toBe('chat send')
  expect(bashOutward('chat react 12 ok', listed)).toBe('chat react')
  expect(bashOutward('sudo /usr/bin/chat send x', listed)).toBe('chat send')
  expect(bashOutward('git status; chat send x', listed)).toBe('chat send')
})

test('a command that is not the one listed, in its name or its words, sends nothing', () => {
  const listed = [['chat', 'send']]

  expect(bashOutward('chat read team', listed)).toBeUndefined()
  expect(bashOutward('mail send team', listed)).toBeUndefined()
  expect(bashOutward('chat', listed)).toBeUndefined()
  expect(bashOutward('chat x send', listed)).toBeUndefined()
})

test('a command listed by its name alone is named by it', () => {
  expect(bashOutward('deploy now', [['deploy']])).toBe('deploy')
  expect(bashOutward('deploy', [['deploy']])).toBe('deploy')
})

test('a git or gh command comes before a listed one of the same name', () => {
  expect(bashOutward('git push', [['git', 'push']])).toBe('git push')
  expect(bashOutward('git status', [['git', 'status']])).toBe('git status')
})
