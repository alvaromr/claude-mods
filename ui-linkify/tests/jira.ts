import { mock } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

export const SITE = 'https://example.atlassian.net'

/**
 * The Jira every test sets the mod up with, saved as the global settings. Its
 * answer starts the session, after the test's own hooks: a drawing reads the
 * settings once a start has loaded them.
 */
export const jira = (on: On, saved: Record<string, unknown> = { site: SITE, keys: 'ABC' }) => {
  mock.store(on, { settings: saved })
  // The paths are linked too, from the home folder.
  mock.env(on, { HOME: '/home/me' })
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  return ($: Engine) => $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
}
