import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

// An install takes each mod from the tag of its release, so it gets what that release holds, never the default
// branch's code under the release's version; `pnpm release` moves the tag in the commit it makes.
test('the marketplace installs each mod from the tag of the version its plugin.json holds', () => {
  const { plugins } = JSON.parse(readFileSync('.claude-plugin/marketplace.json', 'utf8'))

  for (const { name, source } of plugins) {
    const { version } = JSON.parse(readFileSync(`${name}/.claude-plugin/plugin.json`, 'utf8'))
    const tag = `${name}--v${version}`

    assert.deepEqual(
      source,
      { source: 'git-subdir', url: 'alvaromr/claude-mods', path: name, ref: tag },
      `${name} must install from its folder at ${tag}`,
    )
  }
})
