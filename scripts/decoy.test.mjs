import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { globSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { test } from 'node:test'

// git hands its hooks the repository being committed (GIT_DIR, GIT_INDEX_FILE
// and the rest), so a mod's shell test the pre-commit hook runs would point
// its git commands at that repository unless it clears them first.
test("a mod's shell tests leave the repository git hands its hooks as it was", () => {
  const decoy = mkdtempSync(join(tmpdir(), 'decoy-'))
  const git = (...args) =>
    execFileSync('git', ['-C', decoy, '-c', 'user.name=decoy', '-c', 'user.email=decoy@example.com', ...args], {
      encoding: 'utf8',
    })
  const state = () => [
    git('log', '--all', '--oneline'),
    git('branch', '-a'),
    readFileSync(join(decoy, '.git/config'), 'utf8'),
  ]

  try {
    git('init', '-q')
    git('commit', '-q', '--allow-empty', '-m', 'decoy')
    const before = state()
    const env = { ...process.env, GIT_DIR: join(decoy, '.git'), GIT_INDEX_FILE: join(decoy, '.git/index') }

    for (const script of globSync('*/tests/*.test.sh')) {
      execFileSync('sh', [script], { env, stdio: 'ignore' })
      assert.deepEqual(state(), before, script)
    }
  } finally {
    rmSync(decoy, { recursive: true, force: true })
  }
})
