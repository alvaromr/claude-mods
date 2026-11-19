import { expect, test } from 'claude-code/testing'

import { refusal } from '../hooks/refusal'

const WHY = (name: string) =>
  `\`${name}\` is not allowed here, use pnpm (\`pnpm dlx\` or \`pnpm exec\` in place of npx).`

test('npm, npx and yarn are refused, named in the reason', () => {
  expect(refusal('npm install')).toBe(WHY('npm'))
  expect(refusal('npx tsc')).toBe(WHY('npx'))
  expect(refusal('yarn build')).toBe(WHY('yarn'))
})

test('a command is named by what follows its last slash', () => {
  expect(refusal('/usr/local/bin/npm install')).toBe(WHY('npm'))
  expect(refusal('"./node_modules/.bin/yarn" build')).toBe(WHY('yarn'))
})

test('the first command of a line that runs one is the one named', () => {
  expect(refusal('npx a; npm b')).toBe(WHY('npx'))
  expect(refusal('ls && yarn')).toBe(WHY('yarn'))
})

test('a command that only names them runs nothing', () => {
  expect(refusal('pnpm install')).toBeUndefined()
  expect(refusal('echo npm')).toBeUndefined()
  expect(refusal('npm-check-updates --help')).toBeUndefined()
  expect(refusal('')).toBeUndefined()
})

test('a wrapper, a quote, an escape or an assignment does not hide them', () => {
  expect(refusal('sudo -u me npm i')).toBe(WHY('npm'))
  expect(refusal('CI=1 yarn build')).toBe(WHY('yarn'))
  expect(refusal('n""pm i')).toBe(WHY('npm'))
  expect(refusal('\\npm i')).toBe(WHY('npm'))
})

test('a query of a wrapper is not a run', () => {
  expect(refusal('command -v npm')).toBeUndefined()
  expect(refusal('sudo -l npm')).toBeUndefined()
})

test('a substitution in double quotes is looked into', () => {
  expect(refusal('echo "$(npm root)"')).toBe(WHY('npm'))
  expect(refusal('echo "`npx tsc`"')).toBe(WHY('npx'))
  expect(refusal('echo "$(echo "$(yarn)")"')).toBe(WHY('yarn'))
  expect(refusal('echo "$(echo hi)"')).toBeUndefined()
})

test('the script of a shell -c is looked into, behind its options', () => {
  for (const shell of ['sh', 'bash', 'zsh', 'dash', 'ksh', 'ash']) {
    expect(refusal(`${shell} -c "npm i"`), shell).toBe(WHY('npm'))
  }

  expect(refusal('bash -o pipefail -c "npm i"')).toBe(WHY('npm'))
  expect(refusal('bash --noprofile --norc -ec "yarn"')).toBe(WHY('yarn'))
  expect(refusal('sh -lc "cd app && npx tsc"')).toBe(WHY('npx'))
  expect(refusal('bash -c "bash -c \\"npm i\\""')).toBe(WHY('npm'))
})

test('a shell without -c, or one that is none, runs no script', () => {
  expect(refusal('bash script.sh npm')).toBeUndefined()
  expect(refusal('bash -c')).toBeUndefined()
  expect(refusal('bash -c "echo npm"')).toBeUndefined()
  expect(refusal('fish -c "npm i"')).toBeUndefined()
  expect(refusal('bash -x "npm i"')).toBeUndefined()
})

test('what eval runs is looked into', () => {
  expect(refusal('eval npm i')).toBe(WHY('npm'))
  expect(refusal("eval 'npm i'")).toBe(WHY('npm'))
  expect(refusal('eval "$(npm bin)"')).toBe(WHY('npm'))
  expect(refusal('eval echo npm')).toBeUndefined()
})

test('a command word with spaces is a script', () => {
  expect(refusal("env -S 'npm i'")).toBe(WHY('npm'))
  expect(refusal("env -S 'echo npm'")).toBeUndefined()
})

test('the commands a wrapper runs, and find runs, are looked into', () => {
  expect(refusal('find . -name package.json -exec npm i {} \\;')).toBe(WHY('npm'))
  expect(refusal('nvm exec 18 npm i')).toBe(WHY('npm'))
  expect(refusal('find . -name npm -print')).toBeUndefined()
  expect(refusal('nvm use npm')).toBeUndefined()
})

test('a heredoc fed to another command is data, to a shell it is a script', () => {
  expect(refusal("git commit -F - <<'EOF'\nUse pnpm\n\nnpm install no longer runs\nEOF")).toBeUndefined()
  expect(refusal('cat <<EOF | grep npm\nnpm i\nEOF')).toBeUndefined()
  expect(refusal('bash <<EOF\nnpm test\nEOF')).toBe(WHY('npm'))
  expect(refusal('cat <<EOF | bash\nnpm i\nEOF')).toBe(WHY('npm'))
  expect(refusal('cat <<< hi\nnpm i')).toBe(WHY('npm'))
})

test('a redirection or a joined line does not hide them', () => {
  expect(refusal('>out.log npm i')).toBe(WHY('npm'))
  expect(refusal('2>&1 npm i')).toBe(WHY('npm'))
  expect(refusal('np\\\nm i')).toBe(WHY('npm'))
  expect(refusal('echo hi > npm')).toBeUndefined()
})
