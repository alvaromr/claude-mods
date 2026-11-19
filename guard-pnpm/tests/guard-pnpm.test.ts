import { expect, test } from 'claude-code/testing'

const RAN = { stdout: '', stderr: '', interrupted: false }

const DENIED = [
  'npm install',
  'cd app && npx tsc',
  'CI=1 yarn build',
  'sudo npm i -g typescript',
  'echo $(npm root)',
  'if true; then npm test; fi',
  'ls\nnpm ci',
  'env NODE_ENV=production npm start',
  'find . -name package.json | xargs npm view',
  '`npx prettier --check .`',
  'yarn',
  'git commit -m "Replace `npm` with pnpm"',
  'echo "$(npm root)"',
  "bash -c 'npm test'",
  'sh -lc "cd app && npx tsc"',
  "eval 'npm i'",
  '/usr/local/bin/npm install',
  './node_modules/.bin/yarn build',
  'timeout 60 npm test',
  'sudo -u me npm i',
  'nice -n 5 npm ci',
  'xargs -n1 npm view',
  '! npm i',
  'bash <<EOF\nnpm test\nEOF',
  // A here-string is not a heredoc, so what follows runs.
  'cat <<< hi\nnpm i',
  // A heredoc piped to a shell is a script.
  'cat <<EOF | bash\nnpm i\nEOF',
  'cat <<EOF | sh -s\nyarn build\nEOF',
  // The command word in quotes or escaped.
  '"npm" i',
  "'npm' i",
  'n""pm i',
  '\\npm i',
  "echo \\' ; npm i ; echo \\'",
  'echo "a b" ; npm i',
  // Shell options before -c, and nesting.
  'bash -o pipefail -c "npm i"',
  'bash --norc -c "npm i"',
  'bash --noprofile --norc -ec "yarn"',
  'bash -c "bash -c \\"npm i\\""',
  'eval npm i',
  'eval "$(npm bin)"',
  "env -S 'npm i'",
  // More wrappers.
  'nvm exec 18 npm i',
  'nvm exec --silent v20.1.0 npx tsc',
  'find . -name package.json -exec npm i {} \\;',
  'watch npm ls',
  'watch -n 5 npm ls',
  'stdbuf -oL npm i',
  'stdbuf -o L npm i',
  'caffeinate npm i',
  'caffeinate -i yarn',
  'arch -arm64 npm i',
  'corepack npm i',
  'sudo -n npm i',
  'npm=1 npm i',
  'if npm test; then :; fi',
  'cd x && time -p npm test',
  // The shells whose -c runs a script.
  'zsh -c "npm i"',
  'ash -c "npm i"',
  // Every command find runs, and the node versions nvm takes.
  'find . -execdir npm i \\;',
  'find . -ok npm i \\;',
  'find . -okdir npm i \\;',
  'nvm exec node npm i',
  'nvm exec lts/iron npm i',
  'nvm run 18 npm i',
  // The value of a wrapper's option is skipped, not run.
  'sudo --user me npm i',
  'env -u FOO npm i',
  'env -C /tmp npm i',
  'env --unset FOO npm i',
  'env --chdir /tmp npm i',
  'exec -a name npm i',
  'time -f %e npm i',
  'time -o out.txt npm i',
  'timeout -s KILL 60 npm i',
  'timeout --signal KILL 60 npm i',
  'xargs -I X npm i X',
  'xargs -E eof npm i',
  'xargs -d x npm i',
  'xargs -a list.txt npm i',
  'stdbuf -i L npm i',
  'stdbuf -e L npm i',
  // The words that start a command in a loop or a condition.
  'nohup npm i',
  'builtin npm i',
  'for f in a; do npm i; done',
  'if false; then :; else npm i; fi',
  'if false; then :; elif npm test; then :; fi',
  'while npm test; do :; done',
  'until npm test; do :; done',
  '/usr/bin/sudo npm i',
  // A redirection before the command, a duplicated descriptor and a joined line.
  '>out.log npm i',
  '<in.txt npm i',
  '2>&1 npm i',
  'np\\\nm i',
  // A heredoc fed to a shell, eval or source is a script.
  'zsh <<EOF\nnpm i\nEOF',
  'eval <<EOF\nnpm i\nEOF',
  'source /dev/stdin <<EOF\nnpm i\nEOF',
]

const ALLOWED = [
  'pnpm install',
  'grep -r npm package.json',
  'cat .npmrc',
  'pnpm dlx npm-check-updates',
  'ls node_modules/npm',
  'rm yarn.lock',
  'npm-check-updates --help',
  'git commit -m "npm install no longer runs"',
  'echo yarn',
  'git commit -m "Drop (npm) support"',
  'git commit -m "Use pnpm; npm is banned"',
  'rg -n "yarn|npm" docs',
  "grep -E 'npm|yarn' README.md",
  "git commit -F - <<'EOF'\nUse pnpm\n\nnpm install no longer runs\nEOF",
  'gh pr create --title "Drop npm" --body "- (yarn) removed\n- npm too"',
  // A query, or an assignment, is not a run.
  'command -v npm',
  'command -v yarn',
  'command -pv npx',
  'sudo -l npm',
  'npm=1',
  'export npm=1; echo $npm',
  // A here-string and the heredoc of another command are data.
  'cat <<< "npm i"',
  'cat <<EOF | grep npm\nnpm i\nEOF',
  "echo ' ; npm i ; echo '",
  'bash -c "echo npm"',
  'bash -o pipefail -c "pnpm i"',
  'bash script.sh npm',
  'nvm use 18',
  'find . -name npm -print',
  'eval echo npm',
  'sudo -v npm',
  'sudo -V npm',
  'sudo --list npm',
  'sudo --validate npm',
  'sudo --version npm',
  'sudo --help npm',
  'command -V npx',
  'nvm use npm',
]

test('denies npm, npx and yarn as commands', async ($, on) => {
  on('tool.call', { tool: 'Bash' }, () => ({ result: RAN }))

  for (const command of DENIED) {
    const ran = await $.tool.call({ tool: 'Bash', command })

    expect(ran.deny, command).toContain('use pnpm')
  }
})

test('denies them in the command a Monitor runs', async ($, on) => {
  on('tool.call', { tool: 'Monitor' }, () => ({ result: { taskId: 't' } }))

  const ran = await $.tool.call({ tool: 'Monitor', command: 'npm run dev', description: 'd', timeout_ms: 1 })

  expect(ran.deny).toContain('use pnpm')
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
