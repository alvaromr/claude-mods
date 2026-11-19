import { expect, test } from 'claude-code/testing'

import { simpleCommands, substitutions, unquote, withoutHeredocs } from '../hooks/shell'

test('a word has its quotes and escapes taken off', () => {
  expect(unquote('plain')).toBe('plain')
  expect(unquote("'a b'")).toBe('a b')
  expect(unquote('"a b"')).toBe('a b')
  expect(unquote('n""pm')).toBe('npm')
  expect(unquote('\\npm')).toBe('npm')
  expect(unquote('"a \\"b\\""')).toBe('a "b"')
  expect(unquote("'a\\b'")).toBe('a\\b')
})

test('the substitutions a word runs are those of its double-quoted parts', () => {
  expect(substitutions('plain')).toEqual([])
  expect(substitutions('"$(npm root)"')).toEqual(['npm root'])
  expect(substitutions('"`npx tsc`"')).toEqual(['npx tsc'])
  expect(substitutions('"a $(one) b `two`"')).toEqual(['one', 'two'])
  expect(substitutions('"$(a $(b))"')).toEqual(['a $(b)'])
})

test('a substitution in single quotes or escaped is text', () => {
  expect(substitutions("'$(npm root)'")).toEqual([])
  expect(substitutions('\\"$(npm root)\\"')).toEqual([])
  expect(substitutions('$(npm root)')).toEqual([])
})

test('the text of a heredoc fed to another command is left out', () => {
  expect(withoutHeredocs('cat <<EOF\nnpm i\nEOF')).toBe('cat <<EOF')
  expect(withoutHeredocs("git commit -F - <<'EOF'\nUse pnpm\nnpm i\nEOF")).toBe('git commit -F - <<EOF')
  expect(withoutHeredocs('cat <<-EOF\n\tnpm i\n\tEOF')).toBe('cat <<EOF')
})

test('what follows a heredoc on its line stays, as does what comes after it', () => {
  expect(withoutHeredocs('cat <<EOF | grep npm\nnpm i\nEOF\nls')).toBe('cat <<EOF | grep npm\nls')
})

test('the text of a heredoc with no end runs to the end of the command', () => {
  expect(withoutHeredocs('cat <<EOF\nnpm i')).toBe('cat <<EOF')
})

test('a heredoc fed to a shell, eval or source is a script and stays', () => {
  for (const command of [
    'bash <<EOF\nnpm i\nEOF',
    'zsh <<EOF\nnpm i\nEOF',
    'sh <<EOF\nnpm i\nEOF',
    'eval <<EOF\nnpm i\nEOF',
    'source /dev/stdin <<EOF\nnpm i\nEOF',
    'cat <<EOF | bash\nnpm i\nEOF',
  ]) {
    expect(withoutHeredocs(command)).toBe(command)
  }
})

test('a here-string is not a heredoc', () => {
  expect(withoutHeredocs('cat <<< hi\nnpm i')).toBe('cat <<< hi\nnpm i')
})

test('a script splits into the words of each simple command', () => {
  expect(simpleCommands('cd app && npx tsc')).toEqual([['cd', 'app'], [], ['npx', 'tsc']])
  expect(simpleCommands('a; b | c\nd')).toEqual([['a'], ['b'], ['c'], ['d']])
  expect(simpleCommands('a && b || c & d')).toEqual([['a'], [], ['b'], [], ['c'], ['d']])
  // Grouping and backticks open and close a command too.
  expect(simpleCommands('(a) `b` {c}')).toEqual([[], ['a'], [], ['b'], [], ['c'], []])
})

test('a word keeps its quotes and what they hold', () => {
  expect(simpleCommands('echo "a b" \'c ; d\' e\\ f')).toEqual([['echo', '"a b"', "'c ; d'", 'e\\ f']])
})

test('a separator inside a word, in quotes, does not split it', () => {
  expect(simpleCommands('echo "a;b"')).toEqual([['echo', '"a;b"']])
})

test('a redirection and the word it names are left out', () => {
  expect(simpleCommands('>out.log npm i')).toEqual([['npm', 'i']])
  expect(simpleCommands('<in.txt npm i')).toEqual([['npm', 'i']])
  expect(simpleCommands('npm i > out.log')).toEqual([['npm', 'i']])
  expect(simpleCommands('npm i 2>out.log x')).toEqual([['npm', 'i', 'x']])
})

test('a duplicated descriptor names no word', () => {
  expect(simpleCommands('2>&1 npm i')).toEqual([['npm', 'i']])
  expect(simpleCommands('npm i 2>&1 x')).toEqual([['npm', 'i', 'x']])
})

test('a backslash before a newline joins the lines', () => {
  expect(simpleCommands('np\\\nm i')).toEqual([['npm', 'i']])
})

test('a newline separates commands', () => {
  expect(simpleCommands('ls\nnpm ci')).toEqual([['ls'], ['npm', 'ci']])
})

test('a redirection names nothing after a separator', () => {
  expect(simpleCommands('a > f; b')).toEqual([['a'], ['b']])
  expect(simpleCommands('a >; b')).toEqual([['a'], ['b']])
})
