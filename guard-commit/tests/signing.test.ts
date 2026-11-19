import { expect, test } from 'claude-code/testing'

import { SIGNING_SETTING, configSigns, envSigns, signsCommit, signsTag } from '../hooks/signing'

test('a setting that turns signing on signs, with or without a value', () => {
  for (const setting of [
    'commit.gpgsign',
    'tag.gpgsign',
    'push.gpgsign',
    'commit.gpgsign=true',
    'commit.gpgsign=yes',
    'commit.gpgsign=on',
    'commit.gpgsign=1',
    'push.gpgsign=10',
    'COMMIT.GPGSIGN=TRUE',
  ]) {
    expect(SIGNING_SETTING.test(setting), setting).toBe(true)
  }
})

test('a signing format or key given a value signs, whatever its case', () => {
  for (const setting of ['gpg.format=ssh', 'user.signingkey=K', 'USER.SIGNINGKEY=K']) {
    expect(SIGNING_SETTING.test(setting), setting).toBe(true)
  }
})

test('a setting that turns signing off, or another, signs nothing', () => {
  for (const setting of [
    'commit.gpgsign=false',
    'commit.gpgsign=0',
    'push.gpgsign=no',
    'gpg.format=',
    'gpg.format',
    'user.signingkey',
    'user.name=x',
    'xcommit.gpgsign',
    'commit.gpgsignx',
  ]) {
    expect(SIGNING_SETTING.test(setting), setting).toBe(false)
  }
})

test('a commit is signed by -S, alone, with a key or in a cluster', () => {
  for (const word of ['-S', '-SK', '-aS', '-sS', '--gpg-sign', '--gpg-sign=K']) {
    expect(signsCommit(word), word).toBe(true)
  }
})

test('a commit is signed by any unique prefix of --gpg-sign of three characters or more', () => {
  for (const word of ['--gpg', '--gpg-s', '--gp', '--g', '--gpg=K']) {
    expect(signsCommit(word), word).toBe(true)
  }

  for (const word of ['--', '--gpg-signx', '--no-gpg-sign', '--x']) {
    expect(signsCommit(word), word).toBe(false)
  }
})

test('other flags of a commit sign nothing', () => {
  for (const word of ['-a', '-m', '-s', 'S', 'message']) {
    expect(signsCommit(word), word).toBe(false)
  }
})

test('a tag is signed by -s or -u, alone, with a key or behind flags that take no value', () => {
  for (const word of ['-s', '-u', '-su', '-as', '-uK', '-ufoo', '-sm', '-adefilnvEs']) {
    expect(signsTag(word), word).toBe(true)
  }
})

test('a tag is not signed by -s behind a flag that takes a value', () => {
  for (const word of ['-ms', '-a', '-ln', '-E', '-x']) {
    expect(signsTag(word), word).toBe(false)
  }
})

test('a tag is signed by --sign or --local-user, or their prefixes', () => {
  for (const word of ['--sign', '--sig', '--si', '--local-user', '--local-user=K', '--local', '--loc', '--lo']) {
    expect(signsTag(word), word).toBe(true)
  }

  for (const word of ['--s', '--l', '--signx', '--message']) {
    expect(signsTag(word), word).toBe(false)
  }
})

test('git config turning signing on signs', () => {
  for (const args of [
    ['commit.gpgsign', 'true'],
    ['commit.gpgsign', 'yes'],
    ['TAG.GPGSIGN', 'On'],
    ['push.gpgsign', '1'],
    ['--global', 'commit.gpgsign', 'true'],
    ['x', 'commit.gpgsign', 'TRUE'],
  ]) {
    expect(configSigns(args), args.join(' ')).toBe(true)
  }
})

test('git config setting a signing key or format signs', () => {
  for (const args of [
    ['user.signingkey', 'K'],
    ['gpg.format', 'ssh'],
    ['USER.SIGNINGKEY', 'K'],
  ]) {
    expect(configSigns(args), args.join(' ')).toBe(true)
  }
})

test('git config turning signing off, reading a key or naming another setting signs nothing', () => {
  for (const args of [
    ['commit.gpgsign', 'false'],
    ['commit.gpgsign', '0'],
    ['commit.gpgsign'],
    ['user.signingkey'],
    ['user.signingkey', '--get'],
    ['gpg.format', '--get'],
    ['user.name', 'x'],
    [],
  ]) {
    expect(configSigns(args), args.join(' ')).toBe(false)
  }
})

const env = (variables: Record<string, string>) => new Map(Object.entries(variables))

test('the environment signs through a key paired with its own value', () => {
  expect(envSigns(env({ GIT_CONFIG_KEY_0: 'commit.gpgsign', GIT_CONFIG_VALUE_0: 'true' }))).toBe(true)
  expect(envSigns(env({ GIT_CONFIG_KEY_12: 'tag.gpgsign', GIT_CONFIG_VALUE_12: 'yes' }))).toBe(true)
  expect(envSigns(env({ GIT_CONFIG_KEY_0: 'user.signingkey', GIT_CONFIG_VALUE_0: 'K' }))).toBe(true)
})

test('the environment signs nothing where the pair is another, false or incomplete', () => {
  // The value of another number.
  expect(envSigns(env({ GIT_CONFIG_KEY_3: 'commit.gpgsign', GIT_CONFIG_VALUE_0: 'true' }))).toBe(false)
  expect(envSigns(env({ GIT_CONFIG_KEY_0: 'commit.gpgsign', GIT_CONFIG_VALUE_0: 'false' }))).toBe(false)
  expect(envSigns(env({ GIT_CONFIG_KEY_0: 'commit.gpgsign' }))).toBe(false)
  expect(envSigns(env({ GIT_CONFIG_VALUE_0: 'true' }))).toBe(false)
  expect(envSigns(env({ XGIT_CONFIG_KEY_0: 'commit.gpgsign', GIT_CONFIG_VALUE_0: 'true' }))).toBe(false)
  expect(envSigns(env({ GIT_CONFIG_KEY_0x: 'commit.gpgsign', GIT_CONFIG_VALUE_0: 'true' }))).toBe(false)
  expect(envSigns(env({}))).toBe(false)
})
