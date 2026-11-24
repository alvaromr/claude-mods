import { expect, test } from 'claude-code/testing'

const OUTWARD = [
  ['git push', 'git push'],
  ['git push --force origin main', 'git push'],
  ['cd repo && git -C . push', 'git push'],
  ['git -c core.askPass=x --no-pager push origin HEAD', 'git push'],
  ['pnpm check; git push', 'git push'],
  ['git send-email 0001.patch', 'git send-email'],
  ['gh pr create --title "Fix" --body "Fixes the parser"', 'gh pr create'],
  ['gh pr merge 12 --squash', 'gh pr merge'],
  ['gh issue comment 3 --body "Done"', 'gh issue comment'],
  ['gh release create v1.0.0', 'gh release create'],
  ['gh repo delete owner/repo --yes', 'gh repo delete'],
  ['gh api -X PATCH repos/o/r -f name=x', 'gh api -X PATCH'],
  ['gh api --method=DELETE repos/o/r', 'gh api -X DELETE'],
  ['gh api repos/o/r/issues -f title=Bug', 'gh api -X POST'],
  ["gh api graphql -f query='mutation { addStar(input: {}) { clientMutationId } }'", 'gh api graphql mutation'],
  ['sudo env FOO=1 git push', 'git push'],
  ['url=$(gh pr create --fill)', 'gh pr create'],
  ['pnpm check && x=1 out=`git push`', 'git push'],
  ['gh pr -R o/r merge 1', 'gh pr merge'],
  ['gh --repo o/r issue close 1', 'gh issue close'],
  ['gh -R o/r api repos/o/r/issues -f title=Bug', 'gh api -X POST'],
  ["bash -c 'git push'", 'git push'],
  ['bash -lc "cd x && gh pr create"', 'gh pr create'],
  ["eval 'git push'", 'git push'],
  ['timeout 60 gh pr create', 'gh pr create'],
  ['sudo -u me git push', 'git push'],
  ['nice -n 5 git push', 'git push'],
  ['! git push', 'git push'],
  ['git -C "my repo" push', 'git push'],
  ['gh api graphql -f query="$Q"', 'gh api graphql'],
  ['gh api graphql -F query=@m.gql', 'gh api graphql'],
  ['gh api graphql --input -', 'gh api graphql'],
  // An assignment whose value holds spaces.
  ['FOO="a b" git push', 'git push'],
  ['GIT_SSH_COMMAND="ssh -i k" git push', 'git push'],
  ['env FOO="a b" git push', 'git push'],
  ["X='a  b' Y=c gh pr create", 'gh pr create'],
  // Options before -c, nesting, eval without quotes, substitutions in quotes.
  ['bash -o pipefail -c "git push"', 'git push'],
  ['bash --noprofile --norc -c "gh pr merge 1"', 'gh pr merge'],
  ['eval git push', 'git push'],
  ['bash -c "bash -c \\"git push\\""', 'git push'],
  ['echo "$(git push)"', 'git push'],
  // A sending subcommand behind another word of git.
  ['git subtree push --prefix=x origin main', 'git subtree push'],
  ['git lfs push origin main', 'git lfs push'],
  ['git svn dcommit', 'git svn dcommit'],
  ["git submodule foreach 'git push'", 'git push'],
  ['git submodule foreach --recursive git push origin', 'git push'],
  ['git imap-send < patches', 'git imap-send'],
  ['git -c alias.p=push p', 'git push'],
  ["git -c alias.p='push --force' p origin", 'git push'],
  ["git -c alias.p='!git push' p", 'git push'],
  ['git \\\n push', 'git push'],
  // More wrappers; sudo -n takes no word.
  ['stdbuf -oL git push', 'git push'],
  ['stdbuf -o L git push', 'git push'],
  ['caffeinate -i git push', 'git push'],
  ['arch -arm64 git push', 'git push'],
  ['builtin eval git push', 'git push'],
  ['find . -name .git -exec git push {} \\;', 'git push'],
  ['sudo -n git push', 'git push'],
  ['watch -n 5 gh pr create', 'gh pr create'],
  // The shells whose -c runs a script, a command given by its path, a find that runs it.
  ['zsh -c "git push"', 'git push'],
  ['dash -c "git push"', 'git push'],
  ['ksh -c "git push"', 'git push'],
  ['ash -c "git push"', 'git push'],
  ['sh -c "git push"', 'git push'],
  ['bash -ec "git push"', 'git push'],
  ['/usr/bin/git push', 'git push'],
  ['/usr/bin/sudo git push', 'git push'],
  ['find . -execdir git push \\;', 'git push'],
  ['find . -ok git push \\;', 'git push'],
  ['find . -okdir git push \\;', 'git push'],
  // The value of a wrapper's option is skipped, not run.
  ['sudo --user me git push', 'git push'],
  ['env -u FOO git push', 'git push'],
  ['env -C /tmp git push', 'git push'],
  ['env --unset FOO git push', 'git push'],
  ['env --chdir /tmp git push', 'git push'],
  ['exec -a name git push', 'git push'],
  ['time -f %e git push', 'git push'],
  ['time -o out.txt git push', 'git push'],
  ['timeout -s KILL 60 git push', 'git push'],
  ['timeout --signal KILL 60 git push', 'git push'],
  ['xargs -I X git push X', 'git push'],
  ['xargs -E eof git push', 'git push'],
  ['xargs -d x git push', 'git push'],
  ['xargs -a list.txt git push', 'git push'],
  ['stdbuf -i L git push', 'git push'],
  ['stdbuf -e L git push', 'git push'],
  ['command git push', 'git push'],
  // The words that start a command in a loop or a condition.
  ['nohup git push', 'git push'],
  ['for f in a; do git push; done', 'git push'],
  ['if true; then git push; fi', 'git push'],
  ['if false; then :; else git push; fi', 'git push'],
  ['if false; then :; elif git push; then :; fi', 'git push'],
  ['if git push; then :; fi', 'git push'],
  ['while git push; do :; done', 'git push'],
  ['until git push; do :; done', 'git push'],
  // A newline, a redirection before the command and a duplicated descriptor.
  ['pnpm check\ngit push', 'git push'],
  ['>out.log git push', 'git push'],
  ['<in.txt git push', 'git push'],
  ['2>&1 git push', 'git push'],
  // The options of git before its subcommand that take a word.
  ['git --git-dir .git push', 'git push'],
  ['git --work-tree x push', 'git push'],
  ['git --namespace ns push', 'git push'],
  ['git --super-prefix x/ push', 'git push'],
  ['git --config-env core.x=ENV push', 'git push'],
  ['git --attr-source HEAD push', 'git push'],
  ['git subtree -q push origin main', 'git subtree push'],
  // An alias in any case, with the words after it.
  ['git -c ALIAS.p=push p', 'git push'],
  ['git -c alias.P=push p', 'git push'],
  ['git -c alias.p=push p --force', 'git push'],
  ["git -c alias.p='!git push' p --force", 'git push'],
  // The options of gh before its group, and the methods and fields of gh api.
  ['gh --hostname h pr create', 'gh pr create'],
  ['gh api --method PUT repos/o/r', 'gh api -X PUT'],
  ['gh api -XDELETE repos/o/r', 'gh api -X DELETE'],
  ['gh api -X delete repos/o/r', 'gh api -X DELETE'],
  ['gh api repos/o/r/issues -F title=Bug', 'gh api -X POST'],
  ['gh api repos/o/r/issues --field title=Bug', 'gh api -X POST'],
  ['gh api repos/o/r/issues --field=title=Bug', 'gh api -X POST'],
  ['gh api repos/o/r/issues --raw-field title=Bug', 'gh api -X POST'],
  ['gh api repos/o/r/issues --input body.json', 'gh api -X POST'],
  ['gh api repos/o/r/issues -ftitle=Bug', 'gh api -X POST'],
  ["gh api graphql -f query='{ viewer { login } }' --input q.json", 'gh api graphql'],
  // Whatever gh does with a verb it does not read.
  ['gh pr foo 1', 'gh pr foo'],
] as const

// The tools an MCP server may name, and whether the name reads.
const MCP_READS = [
  'mcp__mail__search_threads',
  'mcp__jira__getJiraIssue',
  'mcp__cloud__cloud_get_project',
  'mcp__jira__getConfluenceCommentChildren',
  'mcp__firebase__firebase_deploy_status',
  'mcp__context7__resolve-library-id',
  'mcp__jira__getConfluencePageFooterComments',
  'mcp__gmail__list_labels',
  'mcp__blog__list_posts',
  'mcp__blog__get_post',
  'mcp__shop__shop_global_search',
  'mcp__shop__shop_list_comments',
  'mcp__x__fetchLabelCount',
]

const MCP_WRITES = [
  'mcp__mail__send_message',
  'mcp__jira__addCommentToJiraIssue',
  'mcp__docs__batch',
  'mcp__gh__resolve_thread',
  'mcp__gh__resolveComment',
  'mcp__x__find_and_replace',
  'mcp__x__query_and_run',
  'mcp__x__execute_search',
  'mcp__x__get_and_delete',
  'mcp__firebase__firebase_deploy',
  'mcp__blog__post_message',
  'mcp__gmail__label_message',
  'mcp__jira__comment',
  'mcp__x__whoami',
  'mcp__x__shop_api_write',
]

const LOCAL = [
  'git status',
  'git commit -m "push the parser"',
  'git stash push -m wip',
  'git push --dry-run',
  'git log --grep=push',
  'gh pr view 12',
  'gh pr list --state open',
  'gh pr -R o/r view 12',
  'FOO=bar git status',
  'gh pr checks 12',
  'gh pr checkout 12',
  'gh run watch',
  'gh project item-list 1',
  'gh auth status',
  'gh search repos claude',
  'gh api repos/o/r',
  'gh api -X GET search/issues -f q=bug',
  "gh api graphql -f query='{ viewer { login } }'",
  'echo gh pr create',
  'grep -r "git push" .',
  // Quoted or in another command's words, a separator is data.
  'echo "a; git push"',
  'git commit -m "x\ngit push"',
  'git subtree split --prefix=x',
  'git lfs pull',
  'git svn rebase',
  'git submodule update --init',
  'git -c alias.p=pull p',
  'git -c alias.p=push status',
  'command -v git',
  'sudo -l git push',
  'bash -o pipefail -c "git status"',
  'eval echo git push',
  "echo \\' ; git status ; echo \\'",
  // A dry run, with the words an alias is given.
  'git push -n',
  'git -c alias.p=push p --dry-run',
  "git -c alias.p='!git push' p --dry-run",
  // A query of sudo or command is no run.
  'sudo -v git push',
  'sudo -V git push',
  'sudo --list git push',
  'sudo --validate git push',
  'sudo --version git push',
  'sudo --help git push',
  'command -V git',
  'command -v git push',
  'command -V git push',
  // What gh does on this machine, or reads, whatever its verb.
  'gh --version',
  'gh pr',
  'gh auth login',
  'gh alias set co "pr checkout"',
  'gh browse 12',
  'gh completion -s zsh',
  'gh config set editor vim',
  'gh extension install o/r',
  'gh help pr create',
  'gh status -o org',
  'gh pr status',
  'gh pr diff 12',
  'gh run download 12',
  'gh repo clone o/r',
  'gh attestation verify x -o o',
  'gh repo help',
  'gh api -X HEAD repos/o/r',
  'gh api -X get repos/o/r',
  // A git subcommand with no verb, and a verb that is not one that sends.
  'git subtree',
  'git subtree -q split --prefix=x',
]

test('asks a person before a command that reaches outside the session', async ($, on) => {
  on('tool.check', () => ({ decision: 'allow' }))

  for (const [command, what] of OUTWARD) {
    const verdict = await $.tool.check({ tool: 'Bash', input: { command } })

    expect(verdict.decision, command).toBe('ask')
    expect(verdict.reason, command).toContain(`\`${what}\``)
  }
})

test('reads the command a Monitor runs as a Bash one', async ($, on) => {
  on('tool.check', () => ({ decision: 'allow' }))

  const verdict = await $.tool.check({
    tool: 'Monitor',
    input: { command: 'git push', description: 'd', timeout_ms: 1 },
  })

  expect(verdict).toMatchObject({ decision: 'ask', reason: expect.stringContaining('`git push`') })
})

test('leaves the verdict of a command that stays here', async ($, on) => {
  on('tool.check', () => ({ decision: 'allow' }))

  for (const command of LOCAL) {
    const verdict = await $.tool.check({ tool: 'Bash', input: { command } })

    expect(verdict.decision, command).toBe('allow')
  }
})

test('asks even where a rule or the mode allows it', async ($, on) => {
  on('tool.check', () => ({ decision: 'allow', rule: 'Bash(git push:*)' }))

  const verdict = await $.tool.check({ tool: 'Bash', input: { command: 'git push' } })

  expect(verdict.decision).toBe('ask')
})

test('keeps a deny beneath', async ($, on) => {
  on('tool.check', () => ({ decision: 'deny', reason: 'no pushes here' }))

  const verdict = await $.tool.check({ tool: 'Bash', input: { command: 'git push' } })

  expect(verdict).toMatchObject({ decision: 'deny', reason: 'no pushes here' })
})

// A test plays no person, as a background subagent has none: the ask is refused
// and the command never runs.
test('refuses where nobody can be asked', async ($, on) => {
  let hasRun = false
  on('tool.check', () => ({ decision: 'allow' }))
  on('tool.call', { tool: 'Bash' }, () => {
    hasRun = true

    return { result: { stdout: '', stderr: '', interrupted: false } }
  })

  const ran = await $.tool.call({ tool: 'Bash', command: 'git push', agentId: 'a1' })

  expect(ran.isError).toBe(true)
  expect(hasRun).toBe(false)
})

test('asks for the commands the person lists', { options: { commands: 'chat send, chat react' } }, async ($, on) => {
  on('tool.check', () => ({ decision: 'allow' }))

  const sent = await $.tool.check({ tool: 'Bash', input: { command: 'chat send --to team "hi"' } })
  const reacted = await $.tool.check({ tool: 'Bash', input: { command: 'chat react 12 ok' } })
  const read = await $.tool.check({ tool: 'Bash', input: { command: 'chat read team' } })
  const named = await $.tool.check({ tool: 'Bash', input: { command: 'mail send team' } })

  expect(sent).toMatchObject({ decision: 'ask', reason: expect.stringContaining('`chat send`') })
  expect(reacted).toMatchObject({ decision: 'ask', reason: expect.stringContaining('`chat react`') })
  expect(read.decision).toBe('allow')
  expect(named.decision).toBe('allow')
})

test('asks before an MCP tool that is not a read', async ($, on) => {
  on('tool.check', () => ({ decision: 'allow' }))

  for (const tool of MCP_WRITES) {
    expect((await $.tool.check({ tool, input: {} })).decision, tool).toBe('ask')
  }

  for (const tool of MCP_READS) {
    expect((await $.tool.check({ tool, input: {} })).decision, tool).toBe('allow')
  }
})

test('asks before a built-in tool that publishes, sends or deletes', async ($, on) => {
  on('tool.check', () => ({ decision: 'allow' }))

  const calls = [
    ['Artifact', { action: 'delete', url: 'u' }, 'Artifact delete'],
    ['PublishPlugin', { path: 'p' }, 'PublishPlugin'],
    ['RemoteTrigger', { action: 'run', trigger_id: 't' }, 'RemoteTrigger run'],
    ['SendFile', { to: 'peer', files: ['a'] }, 'SendFile'],
    ['SendMessage', { to: 'bridge:s', message: 'hi' }, 'SendMessage bridge'],
  ] as const

  for (const [tool, input, what] of calls) {
    const verdict = await $.tool.check({ tool, input })

    expect(verdict.decision, tool).toBe('ask')
    expect(verdict.reason, tool).toContain(`\`${what}\``)
  }

  for (const [tool, input] of [
    ['Artifact', { action: 'publish', file_path: 'a.html' }],
    ['RemoteTrigger', { action: 'list' }],
    ['SendMessage', { to: 'worker', message: 'hi' }],
    ['SendFeedback', { type: 'bug', title: 't', details: 'd' }],
  ] as const) {
    expect((await $.tool.check({ tool, input })).decision, tool).toBe('allow')
  }
})

// Each verb the name is read by, as the leading verb or after a joiner.
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

test('reads each verb of an MCP tool name', async ($, on) => {
  on('tool.check', () => ({ decision: 'allow' }))

  const decide = async (tool: string) => (await $.tool.check({ tool, input: {} })).decision

  for (const verb of READ_VERBS) {
    expect(await decide(`mcp__x__${verb}_thing`), verb).toBe('allow')
  }

  // A read that is joined to a write is a write.
  for (const verb of WRITE_VERBS) {
    expect(await decide(`mcp__x__get_${verb}`), verb).toBe('ask')
  }

  for (const verb of AMBIGUOUS_VERBS) {
    expect(await decide(`mcp__x__${verb}_status`), verb).toBe('allow')
    expect(await decide(`mcp__x__get_and_${verb}`), verb).toBe('ask')
    expect(await decide(`mcp__x__${verb}`), verb).toBe('ask')
  }

  for (const joiner of ['and', 'or', 'then']) {
    expect(await decide(`mcp__x__get_${joiner}_run`), joiner).toBe('ask')
  }

  for (const noun of READ_NOUNS) {
    expect(await decide(`mcp__x__deploy_${noun}`), noun).toBe('allow')
  }

  // The server's name is no verb of the tool; a name with a double underscore, a camel-case one, and a trailing mark.
  expect(await decide('mcp__search__whoami')).toBe('ask')
  expect(await decide('mcp__s__get__project')).toBe('allow')
  expect(await decide('mcp__x__GetProject')).toBe('allow')
  expect(await decide('mcp__x__getV2Delete')).toBe('ask')
  expect(await decide('mcp__x__deploy_status_')).toBe('allow')
})

// Its server's word, not proof.
test('asks before an MCP tool that declares itself read-only but is not named as one', async ($, on) => {
  on('tool.check', () => ({ decision: 'allow' }))

  const verdict = await $.tool.check({ tool: 'mcp__mail__label_message', input: {}, isReadOnly: true })

  expect(verdict.decision).toBe('ask')
})

test('leaves a Bash call with no command to the verdict beneath', async ($, on) => {
  on('tool.check', () => ({ decision: 'allow' }))

  const verdict = await $.tool.check({ tool: 'Bash', input: {} })

  expect(verdict.decision).toBe('allow')
})

test('asks where its own check fails', async ($, on) => {
  on('tool.check', () => ({ decision: 'allow' }))

  // Nothing here reads as a tool name, so reading it throws.
  const verdict = await $.tool.check({ tool: undefined as never, input: {} })

  expect(verdict).toMatchObject({ decision: 'ask', reason: expect.stringContaining('comprobación') })
})

test('keeps a deny beneath where its own check fails', async ($, on) => {
  on('tool.check', () => ({ decision: 'deny', reason: 'no pushes here' }))

  const verdict = await $.tool.check({ tool: undefined as never, input: {} })

  expect(verdict).toMatchObject({ decision: 'deny', reason: 'no pushes here' })
})

test('leaves other tools alone', async ($, on) => {
  on('tool.check', () => ({ decision: 'allow' }))

  const verdict = await $.tool.check({ tool: 'Read', input: { file_path: '/tmp/x' } })

  expect(verdict.decision).toBe('allow')
})
