import { mock } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

export const ROOT = '/repo'

/** A drawn element as plain data: Claude Code's own rows aside, which carry neither props nor children. */
export type Drawn = { type: string; props?: Record<string, unknown>; children?: unknown[] }

/**
 * The world beneath the mod: the store (the settings saved as the global ones
 * when given), a session that starts in its project's root, and the toasts,
 * copies and debug lines recorded. Its answer starts the session after the
 * test's own hooks.
 */
export const stage = (on: On, saved?: Record<string, unknown>, store: Record<string, unknown> = {}) => {
  const it = { toasts: [] as string[], copied: [] as string[], logs: [] as string[] }

  mock.store(on, saved === undefined ? store : { ...store, settings: saved })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.root', () => ({ value: ROOT }))
  on('ui.log', (_, e) => (it.logs.push(e.text), { value: undefined }))
  on('ui.toast', (_, e) => (it.toasts.push(e.text), { value: undefined }))
  on('ui.copy', (_, e) => (it.copied.push(e.text), { value: { isCopied: true } }))

  return { it, start: ($: Engine) => $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true }) }
}
