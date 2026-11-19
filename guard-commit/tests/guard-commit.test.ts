import { expect, test } from 'claude-code/testing'

const RAN = { stdout: '', stderr: '', interrupted: false }

const ATTRIBUTED = [
  'git commit -m "Fix" -m "Co-Authored-By: Claude <noreply@anthropic.com>"',
  `git commit -m "$(cat <<'EOF'\nFix\n\nCo-authored-by: Someone <a@b.c>\nEOF\n)"`,
  'git add . && git commit -m "Fix" --trailer "Claude-Session: abc"',
  'gh pr create --title "Fix" --body "🤖 Generated with [Claude Code](https://claude.com/claude-code)"',
  'gh pr edit 12 --body "Co-Authored-By: Claude <noreply@anthropic.com>"',
  'git merge topic -m "Merge topic" -m "Claude-Session: abc"',
  'git tag -a v1 -m "Release" -m "Co-Authored-By: Claude <noreply@anthropic.com>"',
  'git tag -F notes.txt v1 && echo "Co-Authored-By: Claude"',
  'git tag v1 --message="Release" --message "Co-Authored-By: Claude"',
  'git tag v1 --file=notes.txt && echo "Co-Authored-By: Claude"',
  // Each subcommand that writes history, and each gh command that writes a PR.
  'git rebase main --exec "echo Co-Authored-By: Claude"',
  'GIT_EDITOR="echo Claude-Session: abc >>" git cherry-pick abc',
  'GIT_EDITOR="echo Co-Authored-By: Claude >>" git revert HEAD',
  'git am 0001.patch && echo "Co-Authored-By: Claude"',
  'gh issue create --title "Fix" --body "Co-Authored-By: Claude"',
  'gh release create v1 --notes "Generated with Claude Code"',
  'gh issue comment 3 --body "Claude-Session: abc"',
  'gh pr merge 3 --body "Co-Authored-By: Claude"',
  'gh pr review 3 --body "Generated with [Claude Code]"',
  'git commit -m "Fix <noreply@anthropic.com>"',
  'git commit -m "Fix" -m "GENERATED WITH CLAUDE CODE"',
]

const SIGNED = [
  'git commit -S -m "Fix"',
  'git commit --gpg-sign=ABCD -m "Fix"',
  'git -c commit.gpgsign=true commit -m "Fix"',
  'git config --global commit.gpgsign true',
  'git config user.signingkey ~/.ssh/id_ed25519.pub',
  'git tag -s v1.0.0 -m "Release"',
  'git tag -u ABCD v1.0.0',
  'git commit -aS -m "Fix"',
  'git rebase -S main',
  'git config --global gpg.format ssh',
  'git tag -sm "Release" v1.0.0',
  'git tag -asm "Release" v1.0.0',
  'git config commit.gpgsign 1',
  'git -c commit.gpgsign=yes commit -m "Fix"',
  "git config tag.gpgsign 'true'",
  'git -C repo commit -S -m x',
  'git -c user.name=x tag -s v1',
  // Inside another shell or eval.
  'bash -c "git commit -S -m x"',
  "sh -c 'git commit -S'",
  'eval "git commit -S"',
  'eval git commit -S',
  'bash -o pipefail -c "git commit -S"',
  'sudo bash --norc -c "git tag -s v1"',
  'echo "$(git commit -S -m x)"',
  'bash -c "bash -c \\"git commit -S\\""',
  // Quoted or attached.
  'git commit "-S" -m x',
  'git -c "commit.gpgsign=true" commit',
  'git -c commit.gpgsign commit',
  'git config "commit.gpgsign" true',
  'git config --global --add commit.gpgsign TRUE',
  'git -ccommit.gpgsign=true commit',
  'git --config-env=commit.gpgsign=SIGN commit',
  'GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=commit.gpgsign GIT_CONFIG_VALUE_0=true git commit',
  'export GIT_CONFIG_KEY_0=tag.gpgsign GIT_CONFIG_VALUE_0=1; git tag v1',
  // Unique prefixes of a long option.
  'git commit --gpg -m x',
  'git commit --gpg-s -m x',
  'git tag --sig v1',
  'git tag --local-u ABCD v1',
  // Options of git that take a separate word.
  'git --work-tree x commit -S',
  'git --git-dir .git --namespace ns commit -S',
  'git \\\n commit -S',
  'git commit -m x\ngit commit -S',
  // Every subcommand that signs, and the options of git before it.
  'git merge -S topic',
  'git cherry-pick -S abc',
  'git revert -S abc',
  'git am -S 0001.patch',
  'git pull -S',
  'git commit -SABCD -m x',
  'git --super-prefix x/ commit -S',
  'git --attr-source HEAD commit -S',
  // Every setting that signs, in any case, with or without its value.
  'git -c push.gpgsign=true push',
  'git config push.gpgsign true',
  'git -c commit.gpgsign=on commit -m x',
  'git config commit.gpgsign yes',
  'git config commit.gpgsign on',
  'git -c Commit.GpgSign=True commit -m x',
  'git config COMMIT.GPGSIGN true',
  'git -c gpg.format=ssh commit -m x',
  'git -c user.signingkey=K commit -m x',
  'git --config-env commit.gpgsign=SIGN commit',
  'GIT_CONFIG_KEY_1=commit.gpgsign GIT_CONFIG_VALUE_1=true git commit',
  // Other shells, combined flags, a path and a redirection before a flag.
  'zsh -c "git commit -S"',
  'dash -c "git commit -S"',
  'ksh -c "git commit -S"',
  'ash -c "git commit -S"',
  'bash -ec "git commit -S"',
  '/usr/bin/git commit -S -m x',
  'git commit -m x 2>&1 -S',
]

const ALLOWED = [
  'git commit -m "Fix the parser"',
  'git commit --no-gpg-sign -m "Fix"',
  'git log --grep="Co-Authored-By"',
  'git log -S needle',
  'git config --get commit.gpgsign',
  'git tag -a v1.0.0 -m "Release"',
  'git tag -ms v1.0.0',
  'git config user.signingkey 2>/dev/null || echo none',
  'git config --get gpg.format 2>&1',
  'git log --grep=revert -S needle',
  'git commit -m "fix -S flag"',
  'git -C repo log -S x',
  'git config commit.gpgsign false',
  'git merge -s ours topic',
  'gh pr create --title "Fix" --body "Fixes the parser"',
  'git commit -s -m "Fix"',
  'git config --unset commit.gpgsign',
  'git log --show-signature',
  // A newline ends the command; a read is not a write.
  'git commit -m x\ngit log -S foo',
  'git log --grep=revert --grep="Generated with Claude Code"',
  'git log --grep=revert --grep="Co-Authored-By"',
  // A tag with no message lists or names one: it carries no trailer.
  'git log --format=%B | grep -ci "co-authored-by"; git tag | head',
  'git tag --list "v*" && git log --grep="Co-Authored-By"',
  'git -c commit.gpgsign=false commit -m x',
  'git --work-tree x commit -m x',
  'git commit -m "-S flag"',
  'bash -c "git commit -m x"',
  "echo \\' ; git log -S x ; echo \\'",
  'git config user.signingkey > key.txt',
  'GIT_CONFIG_KEY_0=commit.gpgsign GIT_CONFIG_VALUE_0=false git commit -m x',
  'git commit --no-gpg-sign -m x',
  'git config gpg.format --null',
  'git commit -m x -- a.txt',
]

test('denies an attributed commit or PR', async ($, on) => {
  on('tool.call', { tool: 'Bash' }, () => ({ result: RAN }))

  for (const command of ATTRIBUTED) {
    const ran = await $.tool.call({ tool: 'Bash', command })

    expect(ran.deny, command).toContain('authorship')
  }
})

test('denies signing', async ($, on) => {
  on('tool.call', { tool: 'Bash' }, () => ({ result: RAN }))

  for (const command of SIGNED) {
    const ran = await $.tool.call({ tool: 'Bash', command })

    expect(ran.deny, command).toContain('never signed')
  }
})

test('denies signing in the command a Monitor runs', async ($, on) => {
  on('tool.call', { tool: 'Monitor' }, () => ({ result: { taskId: 't' } }))

  const ran = await $.tool.call({ tool: 'Monitor', command: 'git commit -S -m x', description: 'd', timeout_ms: 1 })

  expect(ran.deny).toContain('never signed')
})

test('denies attribution in the command a Monitor runs', async ($, on) => {
  on('tool.call', { tool: 'Monitor' }, () => ({ result: { taskId: 't' } }))

  const ran = await $.tool.call({
    tool: 'Monitor',
    command: 'git commit -m "Co-Authored-By: Claude"',
    description: 'd',
    timeout_ms: 1,
  })

  expect(ran.deny).toContain('authorship')
})

test('lets a Monitor with no command run', async ($, on) => {
  on('tool.call', { tool: 'Monitor' }, () => ({ result: { taskId: 't' } }))

  const ran = await $.tool.call({ tool: 'Monitor', description: 'd', timeout_ms: 1 })

  expect(ran.deny).toBeUndefined()
})

test('denies a Monitor command its own check fails on', async ($, on) => {
  on('tool.call', { tool: 'Monitor' }, () => ({ result: { taskId: 't' } }))

  const ran = await $.tool.call({ tool: 'Monitor', command: { toString: 1 } as never, description: 'd', timeout_ms: 1 })

  expect(ran.deny).toContain('its guard failed')
})

test('lets every other command run', async ($, on) => {
  on('tool.call', { tool: 'Bash' }, () => ({ result: RAN }))

  for (const command of ALLOWED) {
    const ran = await $.tool.call({ tool: 'Bash', command })

    expect(ran.deny, command).toBeUndefined()
  }
})

test('denies a command its own check fails on', async ($, on) => {
  on('tool.call', { tool: 'Bash' }, () => ({ result: RAN }))

  // Nothing here reads as text, so matching it throws.
  const ran = await $.tool.call({ tool: 'Bash', command: { toString: 1 } as never })

  expect(ran.deny).toContain('its guard failed')
})
