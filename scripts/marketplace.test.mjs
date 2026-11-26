import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

// An install takes each mod from the tag of its release, so it gets what that release holds, never the default
// branch's code under the release's version; `pnpm release` moves the tag in the commit it makes. The URL is the full
// HTTPS one: Claude Code installs a git-subdir source given as `owner/repo` over SSH, which fails for anyone with no
// SSH key on GitHub or no github.com in known_hosts.
test('the marketplace installs each mod from the tag of the version its plugin.json holds', () => {
  const { plugins } = JSON.parse(readFileSync('.claude-plugin/marketplace.json', 'utf8'))

  for (const { name, source } of plugins) {
    const { version } = JSON.parse(readFileSync(`${name}/.claude-plugin/plugin.json`, 'utf8'))
    const tag = `${name}--v${version}`

    assert.deepEqual(
      source,
      { source: 'git-subdir', url: 'https://github.com/alvaromr/claude-mods.git', path: name, ref: tag },
      `${name} must install from its folder at ${tag}`,
    )
  }
})
