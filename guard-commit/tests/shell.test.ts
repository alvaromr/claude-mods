import { expect, test } from 'claude-code/testing'

import { simpleCommands, substitutions, unquote } from '../hooks/shell'

test('a word has its quotes and escapes taken off', () => {
  expect(unquote('plain')).toBe('plain')
  expect(unquote("'a b'")).toBe('a b')
  expect(unquote('"a b"')).toBe('a b')
  expect(unquote('g""it')).toBe('git')
  expect(unquote('\\git')).toBe('git')
  expect(unquote('"a \\"b\\""')).toBe('a "b"')
  expect(unquote("'a\\b'")).toBe('a\\b')
})

test('the substitutions a word runs are those of its double-quoted parts', () => {
  expect(substitutions('plain')).toEqual([])
  expect(substitutions('"$(git commit)"')).toEqual(['git commit'])
  expect(substitutions('"`git tag`"')).toEqual(['git tag'])
  expect(substitutions('"a $(one) b `two`"')).toEqual(['one', 'two'])
  expect(substitutions('"$(a $(b))"')).toEqual(['a $(b)'])
})

test('a substitution in single quotes, escaped or bare is not one of the double-quoted parts', () => {
  expect(substitutions("'$(git commit)'")).toEqual([])
  expect(substitutions('\\"$(git commit)\\"')).toEqual([])
  expect(substitutions('$(git commit)')).toEqual([])
})

test('a script splits into the words of each simple command', () => {
  expect(simpleCommands('git add . && git commit')).toEqual([['git', 'add', '.'], [], ['git', 'commit']])
  expect(simpleCommands('a; b | c\nd')).toEqual([['a'], ['b'], ['c'], ['d']])
  expect(simpleCommands('a && b || c & d')).toEqual([['a'], [], ['b'], [], ['c'], ['d']])
  // Grouping and backticks open and close a command too.
  expect(simpleCommands('(a) `b` {c}')).toEqual([[], ['a'], [], ['b'], [], ['c'], []])
})

test('a word keeps its quotes and what they hold', () => {
  expect(simpleCommands('echo "a b" \'c ; d\' e\\ f')).toEqual([['echo', '"a b"', "'c ; d'", 'e\\ f']])
  expect(simpleCommands('echo "a;b"')).toEqual([['echo', '"a;b"']])
})

test('a redirection and the word it names are left out', () => {
  expect(simpleCommands('>out.log git commit')).toEqual([['git', 'commit']])
  expect(simpleCommands('<in.txt git commit')).toEqual([['git', 'commit']])
  expect(simpleCommands('git commit > out.log')).toEqual([['git', 'commit']])
  expect(simpleCommands('git commit 2>out.log x')).toEqual([['git', 'commit', 'x']])
})

test('a duplicated descriptor names no word', () => {
  expect(simpleCommands('2>&1 git commit')).toEqual([['git', 'commit']])
  expect(simpleCommands('git commit 2>&1 x')).toEqual([['git', 'commit', 'x']])
})

test('a redirection names nothing after a separator', () => {
  expect(simpleCommands('a > f; b')).toEqual([['a'], ['b']])
  expect(simpleCommands('a >; b')).toEqual([['a'], ['b']])
})

test('a backslash before a newline joins the lines', () => {
  expect(simpleCommands('git com\\\nmit')).toEqual([['git', 'commit']])
})

test('a newline separates commands', () => {
  expect(simpleCommands('ls\ngit commit')).toEqual([['ls'], ['git', 'commit']])
})
