import { expect, test } from 'claude-code/testing'

import { KEYWORDS, lex } from '../hooks/lex'

const texts = (command: string) => lex(command).map(segment => segment.words.map(word => word.text))
const all = (command: string) => lex(command).flatMap(segment => segment.words)

test('a command is cut at its separators', () => {
  expect(texts('a b; c && d || e\nf & g')).toEqual([['a', 'b'], ['c'], ['d'], ['e'], ['f'], ['g']])
  expect(texts('')).toEqual([])
  expect(texts('   ;  ')).toEqual([])
})

test('a pipe feeds the command after it', () => {
  expect(lex('a | b |& c; d').map(segment => segment.isPiped)).toEqual([false, true, true, false])
})

test('quotes and escapes are taken off a word', () => {
  expect(texts('echo "a b" \'c d\' e\\ f g"h"i')).toEqual([['echo', 'a b', 'c d', 'e f', 'ghi']])
  expect(texts('echo "a\\"b" \'a\\b\'')).toEqual([['echo', 'a"b', 'a\\b']])
  expect(texts("echo 'open")).toEqual([['echo', 'open']])
})

test('a word knows whether it was quoted and whether it starts bare', () => {
  expect(all("echo plain \"dq\" 'sq' -i''")).toEqual([
    { text: 'echo', isQuoted: false, isBare: true },
    { text: 'plain', isQuoted: false, isBare: true },
    { text: 'dq', isQuoted: true, isBare: false },
    { text: 'sq', isQuoted: true, isBare: false },
    { text: '-i', isQuoted: true, isBare: true },
  ])
})

test('the shell keywords are those that run nothing themselves', () => {
  for (const keyword of ['if', 'then', 'else', 'elif', 'while', 'until', 'do', '!', '{', '}']) {
    expect(KEYWORDS.has(keyword)).toBe(true)
  }

  expect(KEYWORDS.has('ls')).toBe(false)
})

test('a redirection that writes names its file', () => {
  const redirected = (command: string) => lex(command).flatMap(segment => segment.redirected)

  expect(redirected('echo x > a 2> b >> c >| d &> e <> f')).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
  expect(redirected('echo x >& log')).toEqual(['log'])
  expect(redirected('echo x >"quoted name"')).toEqual(['quoted name'])
})

test('a redirection that reads or duplicates writes no file', () => {
  const redirected = (command: string) => lex(command).flatMap(segment => segment.redirected)

  expect(redirected('cat < in')).toEqual([])
  expect(redirected('echo x 2>&1 >&2 >&-')).toEqual([])
  expect(redirected('echo x >')).toEqual([])
  expect(texts('echo x > a')).toEqual([['echo', 'x']])
})

test('a heredoc takes the lines after the one that opens it', () => {
  const [first, second] = lex('cat <<EOF\nhello\nworld\nEOF\nls')

  expect(first?.bodies).toEqual(['hello\nworld'])
  expect(second?.words.map(word => word.text)).toEqual(['ls'])
  expect(lex("cat <<'EOF'\n$x\nEOF").flatMap(segment => segment.bodies)).toEqual(['$x'])
  expect(lex('cat <<EOF\nnever closed').flatMap(segment => segment.bodies)).toEqual(['never closed'])
})

test('a <<- heredoc ends at a delimiter indented with tabs', () => {
  expect(lex('cat <<-EOF\n\thello\n\tEOF\nls').flatMap(segment => segment.bodies)).toEqual(['\thello'])
  expect(texts('cat <<-EOF\n\thello\n\tEOF\nls')).toEqual([['cat'], ['ls']])
  expect(lex('cat <<EOF\n\tEOF\nEOF').flatMap(segment => segment.bodies)).toEqual(['\tEOF'])
})

test('a here-string is a body of its command', () => {
  expect(lex("bash <<< 'echo x > a'").flatMap(segment => segment.bodies)).toEqual(['echo x > a'])
})

test('a substitution is a command line of the command that holds it', () => {
  const nested = (command: string) => lex(command).flatMap(segment => segment.nested)

  expect(nested('echo $(ls; pwd) `date`')).toEqual(['ls; pwd', 'date'])
  expect(all('echo $(ls; pwd)').map(word => word.text)).toEqual(['echo', '$(ls; pwd)'])
  expect(nested('echo "$(ls)" "`pwd`"')).toEqual(['ls', 'pwd'])
  expect(nested('echo $(a $(b))')).toEqual(['a $(b)'])
  expect(nested('echo $(unclosed')).toEqual(['unclosed'])
  expect(nested('echo ${HOME} ${A:-$(b)}')).toEqual([])
  expect(nested("echo '$(a)'")).toEqual([])
})

test('an escaped mark does not close a substitution, nor a nested one end it', () => {
  const nested = (command: string) => lex(command).flatMap(segment => segment.nested)

  expect(nested('echo $(echo \\) x)')).toEqual(['echo \\) x'])
  expect(nested('echo `a \\` b`')).toEqual(['a \\` b'])
})

test('an arithmetic $(( )) holds no command', () => {
  expect(lex('echo $((1 + 2))').flatMap(segment => segment.nested)).toEqual([])
})

test('a process substitution is a command line of its command', () => {
  expect(lex('diff <(ls a) >(wc)').flatMap(segment => segment.nested)).toEqual(['ls a', 'wc'])
})

test('a comment ends at the line, only where a word could start', () => {
  expect(texts('ls # c > out\nwc')).toEqual([['ls'], ['wc']])
  expect(texts('# only a comment\nls')).toEqual([['ls']])
  expect(texts('echo a#b')).toEqual([['echo', 'a#b']])
  expect(lex('ls # c > out').flatMap(segment => segment.redirected)).toEqual([])
})

test('a subshell is bracketed by scope marks', () => {
  expect(lex('(cd x; ls)').map(segment => segment.scope)).toEqual(['open', undefined, undefined, 'close'])
})

test('inside [[ ]] the operators are words', () => {
  expect(texts('[[ a > b ]] && ls')).toEqual([['[[', 'a', '>', 'b', ']]'], ['ls']])
  expect(texts('[[ a && b || (c) ]]')).toEqual([['[[', 'a', '&&', 'b', '||', '(', 'c', ')', ']]']])
  expect(lex('[[ a > b ]]').flatMap(segment => segment.redirected)).toEqual([])
  expect(texts('if [[ a > b ]]; then ls; fi')).toEqual([['if', '[[', 'a', '>', 'b', ']]'], ['then', 'ls'], ['fi']])
})

test('a [[ that is no start of a test opens none', () => {
  const [first] = lex('echo [[ a > b')

  expect(first?.words.map(word => word.text)).toEqual(['echo', '[[', 'a'])
  expect(first?.redirected).toEqual(['b'])
  expect(lex('"[[" a > b').flatMap(segment => segment.redirected)).toEqual(['b'])
})

test('a test left open ends with its line or its separator', () => {
  expect(lex('[[ a\nls > out').flatMap(segment => segment.redirected)).toEqual(['out'])
  expect(lex('[[ a; ls > out').flatMap(segment => segment.redirected)).toEqual(['out'])
  expect(lex('[[ a ]]\nls > out').flatMap(segment => segment.redirected)).toEqual(['out'])
})

test('a blank of any kind separates words', () => {
  expect(texts('a\tb\r c d')).toEqual([['a', 'b', 'c', 'd']])
})
