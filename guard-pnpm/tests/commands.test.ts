import { expect, test } from 'claude-code/testing'

import { commandsOf, pastOptions } from '../hooks/commands'

const words = (line: string) => line.split(' ')

test('a command that wraps nothing is the command itself', () => {
  expect(commandsOf(words('npm i'))).toEqual([['npm', 'i']])
  expect(commandsOf(words('ls'))).toEqual([['ls']])
  expect(commandsOf([])).toEqual([])
})

test('the assignments before a command are skipped', () => {
  expect(commandsOf(words('FOO=1 BAR=2 npm i'))).toEqual([['npm', 'i']])
  expect(commandsOf(words('_a1=x npm i'))).toEqual([['npm', 'i']])
  // Nothing before the equal sign, or a digit first, is not a variable.
  expect(commandsOf(words('=x npm'))).toEqual([['=x', 'npm']])
  expect(commandsOf(words('1a=x npm'))).toEqual([['1a=x', 'npm']])
  expect(commandsOf(words('FOO=1'))).toEqual([])
})

test('a wrapper is found by its name, whatever the path to it', () => {
  expect(commandsOf(words('/usr/bin/sudo npm i'))).toEqual([['npm', 'i']])
  expect(commandsOf(words('./bin/env npm i'))).toEqual([['npm', 'i']])
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
    'corepack',
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
    expect(commandsOf([wrapper, 'npm', 'i']), wrapper).toEqual([['npm', 'i']])
  }
})

test('a wrapper stacks on another', () => {
  expect(commandsOf(words('nohup nice -n 5 npm i'))).toEqual([['npm', 'i']])
  expect(commandsOf(words('sudo env FOO=1 timeout 60 npm i'))).toEqual([['npm', 'i']])
})

test('an option that takes a value skips it', () => {
  for (const line of [
    'sudo -u me npm i',
    'sudo -g me npm i',
    'sudo -C 3 npm i',
    'sudo -h me npm i',
    'sudo -p me npm i',
    'sudo -r me npm i',
    'sudo -t me npm i',
    'sudo -D me npm i',
    'sudo -U me npm i',
    'sudo -T 3 npm i',
    'sudo --user me npm i',
    'sudo --group me npm i',
    'env -u FOO npm i',
    'env -C /tmp npm i',
    'env --unset FOO npm i',
    'env --chdir /tmp npm i',
    'exec -a name npm i',
    'time -f %e npm i',
    'time -o out.txt npm i',
    'nice -n 5 npm i',
    'timeout -s KILL 60 npm i',
    'timeout -k 5 60 npm i',
    'timeout --signal KILL 60 npm i',
    'timeout --kill-after 5 60 npm i',
    'xargs -n 1 npm i',
    'xargs -P 2 npm i',
    'xargs -I X npm i',
    'xargs -L 1 npm i',
    'xargs -E eof npm i',
    'xargs -d x npm i',
    'xargs -a list.txt npm i',
    'xargs -s 9 npm i',
    'stdbuf -i L npm i',
    'stdbuf -o L npm i',
    'stdbuf -e L npm i',
    'watch -n 5 npm i',
    'watch --interval 5 npm i',
  ]) {
    expect(commandsOf(words(line)), line).toEqual([['npm', 'i']])
  }
})

test('an option that takes no value skips itself alone', () => {
  expect(commandsOf(words('sudo -n npm i'))).toEqual([['npm', 'i']])
  expect(commandsOf(words('stdbuf -oL npm i'))).toEqual([['npm', 'i']])
  expect(commandsOf(words('arch -arm64 npm i'))).toEqual([['npm', 'i']])
  expect(commandsOf(words('sudo -- npm i'))).toEqual([['npm', 'i']])
})

test('a number after a wrapper is a duration or a priority, not the command', () => {
  expect(commandsOf(words('timeout 60 npm i'))).toEqual([['npm', 'i']])
})

test('a call that queries runs nothing', () => {
  for (const line of [
    'command -v npm',
    'command -V npm',
    'command -pv npm',
    'sudo -l npm',
    'sudo -v npm',
    'sudo -V npm',
    'sudo -nl npm',
    'sudo --list npm',
    'sudo --validate npm',
    'sudo --version npm',
    'sudo --help npm',
  ]) {
    expect(commandsOf(words(line)), line).toEqual([])
  }
})

test('a wrapper without a query option runs on', () => {
  expect(commandsOf(words('command npm i'))).toEqual([['npm', 'i']])
  expect(commandsOf(words('env -l npm i'))).toEqual([['npm', 'i']])
})

test('find runs what follows each of its exec options', () => {
  for (const option of ['-exec', '-execdir', '-ok', '-okdir']) {
    expect(commandsOf(['find', '.', option, 'npm', 'i', '{}', ';']), option).toEqual([['npm', 'i', '{}', ';']])
  }

  expect(commandsOf(words('find . -name npm -print'))).toEqual([])
  expect(commandsOf(words('find . -exec a ; -exec b ;'))).toEqual([
    ['a', ';', '-exec', 'b', ';'],
    ['b', ';'],
  ])
  expect(commandsOf(words('/usr/bin/find . -exec npm i ;'))).toEqual([['npm', 'i', ';']])
})

test('nvm runs the command after exec or run, past its options and the version', () => {
  expect(commandsOf(words('nvm exec 18 npm i'))).toEqual([['npm', 'i']])
  expect(commandsOf(words('nvm run 18 npm i'))).toEqual([['npm', 'i']])
  expect(commandsOf(words('nvm exec --silent v20.1.0 npx tsc'))).toEqual([['npx', 'tsc']])
  for (const version of ['18', 'v20.1.0', 'node', 'iojs', 'stable', 'default', 'system', 'lts/iron', 'lts/*']) {
    expect(commandsOf(['nvm', 'exec', version, 'npm', 'i']), version).toEqual([['npm', 'i']])
  }
})

test('nvm without a version runs the command at once', () => {
  expect(commandsOf(words('nvm exec npm i'))).toEqual([['npm', 'i']])
})

test('a version with a letter is skipped once, after the options', () => {
  expect(commandsOf(words('nvm exec node node i'))).toEqual([['node', 'i']])
})

test('any other nvm call runs nothing', () => {
  expect(commandsOf(words('nvm use 18'))).toEqual([])
  expect(commandsOf(words('nvm use npm'))).toEqual([])
  expect(commandsOf(words('nvm'))).toEqual([])
  expect(commandsOf(words('nvm exec'))).toEqual([])
})

test('the options of a wrapper end at the first word that is none', () => {
  expect(pastOptions(words('w npm i'), 1, {})).toBe(1)
  expect(pastOptions(words('w -x npm'), 1, {})).toBe(2)
  expect(pastOptions(words('w -x -y npm'), 1, {})).toBe(3)
  expect(pastOptions(words('w'), 1, {})).toBe(1)
})

test('an option the wrapper gives a value takes the next word too', () => {
  expect(pastOptions(words('w -x v npm'), 1, { args: ['-x'] })).toBe(3)
  expect(pastOptions(words('w -y npm'), 1, { args: ['-x'] })).toBe(2)
  // The value may end the words.
  expect(pastOptions(words('w -x'), 1, { args: ['-x'] })).toBe(3)
})

test('a number or a double dash is part of the options', () => {
  expect(pastOptions(words('w 5 npm'), 1, {})).toBe(2)
  expect(pastOptions(words('w -- npm'), 1, {})).toBe(2)
})

test('an option the wrapper queries with makes it -1', () => {
  expect(pastOptions(words('w -x npm'), 1, { query: /^-x$/ })).toBe(-1)
  expect(pastOptions(words('w -y -x npm'), 1, { query: /^-x$/ })).toBe(-1)
  expect(pastOptions(words('w -y npm'), 1, { query: /^-x$/ })).toBe(2)
})

test('the options are read from where the caller says', () => {
  expect(pastOptions(words('w -x -y npm'), 2, {})).toBe(3)
  expect(pastOptions(words('w -x -y npm'), 3, {})).toBe(3)
})
