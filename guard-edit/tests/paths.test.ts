import { expect, test } from 'claude-code/testing'

import { resolve, SCRATCH, SCRATCH_DIR } from '../hooks/paths'

const at = (text: string) => resolve(text, '/cwd', '/home')

test('a path is taken from where the command runs', () => {
  expect(at('a/b')).toBe('/cwd/a/b')
  expect(at('/abs/a')).toBe('/abs/a')
  expect(at('~x')).toBe('/cwd/~x')
})

test('~, $HOME and $PWD stand for their folders', () => {
  expect(at('~')).toBe('/home')
  expect(at('~/a')).toBe('/home/a')
  expect(at('$HOME')).toBe('/home')
  expect(at('${HOME}/a')).toBe('/home/a')
  expect(at('$PWD/a')).toBe('/cwd/a')
  expect(at('${PWD}')).toBe('/cwd')
})

test('a path only the shell knows, or an empty one, is no path', () => {
  expect(at('$X/a')).toBeUndefined()
  expect(at('`pwd`/a')).toBeUndefined()
  expect(at('')).toBeUndefined()
})

test('a glob stands for its folder', () => {
  expect(at('src/*.ts')).toBe('/cwd/src')
  expect(at('*.ts')).toBe('/cwd')
  expect(at('dir/f?.txt')).toBe('/cwd/dir')
  expect(at('/a/b[1]/c')).toBe('/a')
})

test('. and .. are taken out', () => {
  expect(at('/tmp/../repo')).toBe('/repo')
  expect(at('./a/./b//c')).toBe('/cwd/a/b/c')
  expect(at('../a')).toBe('/a')
  expect(at('/..')).toBe('/')
})

test('writing to a scratch folder or inside .git is never an edit of a project', () => {
  for (const path of [
    '/dev/null',
    '/tmp/a',
    '/private/tmp/a',
    '/var/folders/a',
    '/private/var/folders/a',
    '/r/.git/x',
  ]) {
    expect(SCRATCH.test(path)).toBe(true)
  }

  for (const path of ['/repo/a', '/tmpx/a', '/tmp', '/r/.github/x', '/home/tmp/a']) {
    expect(SCRATCH.test(path)).toBe(false)
  }
})

test('a cd target that is scratch though only the shell knows it', () => {
  for (const target of ['$(mktemp -d)', '$( mktemp)', '`mktemp -d`', '$TMPDIR', '$TMPDIR/a', '${TMPDIR}/a']) {
    expect(SCRATCH_DIR.test(target)).toBe(true)
  }

  for (const target of ['$TMPDIRX', '$HOME', '$(pwd)', 'mktemp', '$(mktempx)']) {
    expect(SCRATCH_DIR.test(target)).toBe(false)
  }
})
