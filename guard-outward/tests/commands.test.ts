import { expect, test } from 'claude-code/testing'

import { commandsOf, pastOptions } from '../hooks/commands'

const words = (line: string) => line.split(' ')

test('a command that wraps nothing is the command itself', () => {
  expect(commandsOf(words('git push'))).toEqual([['git', 'push']])
  expect(commandsOf(words('ls'))).toEqual([['ls']])
  expect(commandsOf([])).toEqual([])
})

test('the assignments before a command are skipped', () => {
  expect(commandsOf(words('FOO=1 BAR=2 git push'))).toEqual([['git', 'push']])
  expect(commandsOf(words('_a1=x git push'))).toEqual([['git', 'push']])
  // Nothing before the equal sign, or a digit first, is not a variable.
  expect(commandsOf(words('=x git'))).toEqual([['=x', 'git']])
  expect(commandsOf(words('1a=x git'))).toEqual([['1a=x', 'git']])
  expect(commandsOf(words('FOO=1'))).toEqual([])
})

test('a wrapper is found by its name, whatever the path to it', () => {
  expect(commandsOf(words('/usr/bin/sudo git push'))).toEqual([['git', 'push']])
  expect(commandsOf(words('./bin/env git push'))).toEqual([['git', 'push']])
})

test('a wrapper with nothing after it runs nothing', () => {
  expect(commandsOf(words('sudo'))).toEqual([])
  expect(commandsOf(words('sudo -u'))).toEqual([])
  expect(commandsOf(words('nice -n'))).toEqual([])
})

test('the words that start a command in a loop, a condition or a shell are passed', () => {
  for (const wrapper of [
    'nohup',
    'caffeinate',
    'arch',
    'builtin',
    'then',
    'do',
    'else',
    'elif',
    'if',
    'while',
    'until',
    '!',
    'exec',
    'time',
    'nice',
    'timeout',
    'xargs',
    'stdbuf',
    'watch',
    'env',
    'sudo',
    'command',
  ]) {
    expect(commandsOf([wrapper, 'git', 'push']), wrapper).toEqual([['git', 'push']])
  }
})

test('a wrapper stacks on another', () => {
  expect(commandsOf(words('nohup nice -n 5 git push'))).toEqual([['git', 'push']])
  expect(commandsOf(words('sudo env FOO=1 timeout 60 git push'))).toEqual([['git', 'push']])
})

test('an option that takes a value skips it', () => {
  for (const line of [
    'sudo -u me git push',
    'sudo -g me git push',
    'sudo -C 3 git push',
    'sudo -h me git push',
    'sudo -p me git push',
    'sudo -r me git push',
    'sudo -t me git push',
    'sudo -D me git push',
    'sudo -U me git push',
    'sudo -T 3 git push',
    'sudo --user me git push',
    'sudo --group me git push',
    'env -u FOO git push',
    'env -C /tmp git push',
    'env --unset FOO git push',
    'env --chdir /tmp git push',
    'exec -a name git push',
    'time -f %e git push',
    'time -o out.txt git push',
    'nice -n 5 git push',
    'timeout -s KILL 60 git push',
    'timeout -k 5 60 git push',
    'timeout --signal KILL 60 git push',
    'timeout --kill-after 5 60 git push',
    'xargs -n 1 git push',
    'xargs -P 2 git push',
    'xargs -I X git push',
    'xargs -L 1 git push',
    'xargs -E eof git push',
    'xargs -d x git push',
    'xargs -a list.txt git push',
    'xargs -s 9 git push',
    'stdbuf -i L git push',
    'stdbuf -o L git push',
    'stdbuf -e L git push',
    'watch -n 5 git push',
    'watch --interval 5 git push',
  ]) {
    expect(commandsOf(words(line)), line).toEqual([['git', 'push']])
  }
})

test('an option that takes no value skips itself alone', () => {
  expect(commandsOf(words('sudo -n git push'))).toEqual([['git', 'push']])
  expect(commandsOf(words('stdbuf -oL git push'))).toEqual([['git', 'push']])
  expect(commandsOf(words('arch -arm64 git push'))).toEqual([['git', 'push']])
  expect(commandsOf(words('sudo -- git push'))).toEqual([['git', 'push']])
})

test('a number after a wrapper is a duration or a priority, not the command', () => {
  expect(commandsOf(words('timeout 60 git push'))).toEqual([['git', 'push']])
})

test('a call that queries runs nothing', () => {
  for (const line of [
    'command -v git',
    'command -V git',
    'command -pv git',
    'sudo -l git',
    'sudo -v git',
    'sudo -V git',
    'sudo -nl git',
    'sudo --list git',
    'sudo --validate git',
    'sudo --version git',
    'sudo --help git',
  ]) {
    expect(commandsOf(words(line)), line).toEqual([])
  }
})

test('a wrapper without a query option runs on', () => {
  expect(commandsOf(words('command git push'))).toEqual([['git', 'push']])
  expect(commandsOf(words('env -l git push'))).toEqual([['git', 'push']])
})

test('find runs what follows each of its exec options', () => {
  for (const option of ['-exec', '-execdir', '-ok', '-okdir']) {
    expect(commandsOf(['find', '.', option, 'git', 'push', '{}', ';']), option).toEqual([['git', 'push', '{}', ';']])
  }

  expect(commandsOf(words('find . -name git -print'))).toEqual([])
  expect(commandsOf(words('find . -exec a ; -exec b ;'))).toEqual([
    ['a', ';', '-exec', 'b', ';'],
    ['b', ';'],
  ])
  expect(commandsOf(words('/usr/bin/find . -exec git push ;'))).toEqual([['git', 'push', ';']])
})

test('the options of a wrapper end at the first word that is none', () => {
  expect(pastOptions(words('w git push'), 1, {})).toBe(1)
  expect(pastOptions(words('w -x git'), 1, {})).toBe(2)
  expect(pastOptions(words('w -x -y git'), 1, {})).toBe(3)
  expect(pastOptions(words('w'), 1, {})).toBe(1)
})

test('an option the wrapper gives a value takes the next word too', () => {
  expect(pastOptions(words('w -x v git'), 1, { args: ['-x'] })).toBe(3)
  expect(pastOptions(words('w -y git'), 1, { args: ['-x'] })).toBe(2)
  // The value may end the words.
  expect(pastOptions(words('w -x'), 1, { args: ['-x'] })).toBe(3)
})

test('a number or a double dash is part of the options', () => {
  expect(pastOptions(words('w 5 git'), 1, {})).toBe(2)
  expect(pastOptions(words('w -- git'), 1, {})).toBe(2)
})

test('an option the wrapper queries with makes it -1', () => {
  expect(pastOptions(words('w -x git'), 1, { query: /^-x$/ })).toBe(-1)
  expect(pastOptions(words('w -y -x git'), 1, { query: /^-x$/ })).toBe(-1)
  expect(pastOptions(words('w -y git'), 1, { query: /^-x$/ })).toBe(2)
})

test('the options are read from where the caller says', () => {
  expect(pastOptions(words('w -x -y git'), 2, {})).toBe(3)
  expect(pastOptions(words('w -x -y git'), 3, {})).toBe(3)
})
