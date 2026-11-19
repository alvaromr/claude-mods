import assert from 'node:assert/strict'
import { test } from 'node:test'

import { isLater, modsOf, release } from './release.mjs'

const CHANGELOG = `# Changelog

Intro.

## [Unreleased]

### Added

- \`bar-git\`: a button.
- \`ui-mods\`: a pane that
  spans two lines.

### Fixed

- \`bar-git\`: a fix.
- \`guard-edit\`: denies more, as \`bar-git\` does.

## [ui-linkify 0.3.0] - 2026-11-12

### Added

- \`ui-linkify\`: links.
`

test('an entry is about the mods named before its colon', () => {
  for (const [entry, mods] of [
    ['- `bar-git`: a fix.', ['bar-git']],
    ['- `guard-outward` 0.1.0: asks first.', ['guard-outward']],
    ['- `bar-git` and `bar-path`: the row follows a cd.', ['bar-git', 'bar-path']],
    [
      '- `bar-context`, `bar-git`, `bar-limits` and `bar-path`: settings.',
      ['bar-context', 'bar-git', 'bar-limits', 'bar-path'],
    ],
    ['- `guard-edit`: denies more, as `bar-git` does.', ['guard-edit']],
    ['- First public release of `guard-commit`.', []],
  ]) {
    assert.deepEqual(modsOf(entry), mods, entry)
  }
})

test("a release moves the mod's own entries under its version, above the releases before it", () => {
  assert.equal(
    release(CHANGELOG, 'bar-git', '0.2.0', '2026-11-16'),
    `# Changelog

Intro.

## [Unreleased]

### Added

- \`ui-mods\`: a pane that
  spans two lines.

### Fixed

- \`guard-edit\`: denies more, as \`bar-git\` does.

## [bar-git 0.2.0] - 2026-11-16

### Added

- \`bar-git\`: a button.

### Fixed

- \`bar-git\`: a fix.

## [ui-linkify 0.3.0] - 2026-11-12

### Added

- \`ui-linkify\`: links.
`,
  )
})

test('a kind left with no entry loses its heading in Unreleased and is absent from the release', () => {
  const changed = CHANGELOG.replace('### Fixed', '### Changed\n\n- `ui-mods`: a change.\n\n### Fixed')
  const released = release(changed, 'ui-mods', '0.1.2', '2026-11-16')

  assert.match(released, /## \[Unreleased\]\n\n### Added\n\n- `bar-git`: a button\.\n\n### Fixed\n/)
  assert.match(
    released,
    /## \[ui-mods 0.1.2\] - 2026-11-16\n\n### Added\n\n- `ui-mods`: a pane that\n {2}spans two lines\.\n\n### Changed\n\n- `ui-mods`: a change\.\n\n## \[ui-linkify/,
  )
})

test('an entry shared with other mods stops the release, naming it', () => {
  const shared = CHANGELOG.replace('- `bar-git`: a fix.', '- `bar-git` and `bar-path`: a fix.')

  assert.throws(
    () => release(shared, 'bar-git', '0.2.0', '2026-11-16'),
    /split these entries by hand.*\n.*`bar-git` and `bar-path`: a fix/,
  )
  assert.throws(
    () =>
      release(
        CHANGELOG.replace('- `ui-mods`: a pane that', '- First release of `bar-git`, a pane that'),
        'bar-git',
        '0.2.0',
        'd',
      ),
    /split these entries by hand/,
  )
})

test('a mod with no entry, or a changelog with no Unreleased section, stops the release', () => {
  assert.throws(() => release(CHANGELOG, 'pet', '0.2.0', 'd'), /no entry for pet/)
  assert.throws(() => release('# Changelog\n', 'bar-git', '0.2.0', 'd'), /no "## \[Unreleased\]" section/)
})

test('a version must be a later 0.y.z', () => {
  assert.equal(isLater('0.1.1', '0.1.2'), true)
  assert.equal(isLater('0.1.1', '0.2.0'), true)
  assert.equal(isLater('0.3.0', '0.2.9'), false)
  assert.equal(isLater('0.3.0', '0.3.0'), false)
  assert.throws(() => isLater('0.3.0', '1.0.0'), /versions stay below 1\.0\.0/)
  assert.throws(() => isLater('0.3.0', 'v0.4'), /not a 0\.y\.z version/)
})
