import { expect, test } from 'claude-code/testing'

import { FED, feed, invocation, isOption, replacement } from '../hooks/invocation'
import { lex } from '../hooks/lex'

const words = (command: string) => lex(command).flatMap(segment => segment.words)
const run = (command: string) => {
  const { name, args } = invocation(words(command))

  return { name, args: args.map(arg => arg.text) }
}

test('an option is a bare word that starts with a dash', () => {
  const [bare, quoted, lone, plain] = words('-x "-x" - x')

  expect(bare && isOption(bare)).toBe(true)
  expect(quoted && isOption(quoted)).toBe(false)
  expect(lone && isOption(lone)).toBe(false)
  expect(plain && isOption(plain)).toBe(false)
})

test('a command and its arguments', () => {
  expect(run('ls -l x')).toEqual({ name: 'ls', args: ['-l', 'x'] })
  expect(run('/bin/ls x')).toEqual({ name: 'ls', args: ['x'] })
  expect(invocation([])).toEqual({ name: '', args: [] })
})

test('the keywords and assignments before a command are skipped', () => {
  expect(run('if ls x')).toEqual({ name: 'ls', args: ['x'] })
  expect(run('! while { ls')).toEqual({ name: 'ls', args: [] })
  expect(run('A=1 B=2 ls x')).toEqual({ name: 'ls', args: ['x'] })
  expect(run('"if" x')).toEqual({ name: 'if', args: ['x'] })
})

test('a wrapper runs the command after its options', () => {
  expect(run('command ls x')).toEqual({ name: 'ls', args: ['x'] })
  expect(run('builtin cd x')).toEqual({ name: 'cd', args: ['x'] })
  expect(run('exec -a name ls x')).toEqual({ name: 'ls', args: ['x'] })
  expect(run('nohup setsid ls x')).toEqual({ name: 'ls', args: ['x'] })
  expect(run('time -f %e -o out ls x')).toEqual({ name: 'ls', args: ['x'] })
  expect(run('nice -n 5 ionice -c 3 ls x')).toEqual({ name: 'ls', args: ['x'] })
  expect(run('stdbuf -oL -i0 ls x')).toEqual({ name: 'ls', args: ['x'] })
  expect(run('doas -u me ls x')).toEqual({ name: 'ls', args: ['x'] })
})

test('an option of a wrapper that takes a value skips it too', () => {
  expect(run('env -u A -C dir B=1 ls x')).toEqual({ name: 'ls', args: ['x'] })
  expect(run('sudo -u me -g grp -D dir ls x')).toEqual({ name: 'ls', args: ['x'] })
  expect(run('sudo --user me ls x')).toEqual({ name: 'ls', args: ['x'] })
  expect(run('env -i ls x')).toEqual({ name: 'ls', args: ['x'] })
})

test('timeout skips its duration before the command', () => {
  expect(run('timeout 5 ls x')).toEqual({ name: 'ls', args: ['x'] })
  expect(run('timeout -k 1 -s KILL 5 ls x')).toEqual({ name: 'ls', args: ['x'] })
})

test('xargs runs its command on the folder the command runs in', () => {
  expect(run('xargs rm')).toEqual({ name: 'rm', args: ['.'] })
  expect(run('xargs -n 1 -P 2 rm -f')).toEqual({ name: 'rm', args: ['-f', '.'] })
  expect(run('xargs -I X cp X dest')).toEqual({ name: 'cp', args: ['.', 'dest'] })
  expect(run('xargs -I{} cp {} dest')).toEqual({ name: 'cp', args: ['.', 'dest'] })
  expect(run('xargs -i cp {} dest')).toEqual({ name: 'cp', args: ['.', 'dest'] })
})

test('the file a command is fed stands for the folder it runs in', () => {
  expect(FED).toEqual({ text: '.', isQuoted: false, isBare: false })
})

test('files are fed to the placeholder, else last', () => {
  const [cp, from, to] = words('cp X dest')
  const files = [FED]

  expect(cp && from && to && feed([cp, from, to], files, 'X').map(word => word.text)).toEqual(['cp', '.', 'dest'])
  expect(cp && from && to && feed([cp, from, to], files, 'Y').map(word => word.text)).toEqual(['cp', 'X', 'dest', '.'])
  expect(cp && from && to && feed([cp, from, to], files).map(word => word.text)).toEqual(['cp', 'X', 'dest', '.'])
})

test('an option of xargs may name the string it replaces', () => {
  const [next] = words('STR')

  expect(replacement('-I', next)).toBe('STR')
  expect(replacement('-J', next)).toBe('STR')
  expect(replacement('-I')).toBeUndefined()
  expect(replacement('-ISTR')).toBe('STR')
  expect(replacement('-JSTR')).toBe('STR')
  expect(replacement('-iSTR')).toBe('STR')
  expect(replacement('--replace=STR')).toBe('STR')
  expect(replacement('-i')).toBe('{}')
  expect(replacement('--replace')).toBe('{}')
  expect(replacement('-n')).toBeUndefined()
})
