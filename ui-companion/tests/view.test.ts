import { expect, test } from 'claude-code/testing'

import type { Mode, Setup, View } from '../types'
import { MODES, SETUPS } from '../hooks/modes'
import { isCommenting, isReading, startView } from '../hooks/view'

const on = (...modes: Mode[]): Record<Mode, Setup> =>
  Object.fromEntries(MODES.map(each => [each, { ...SETUPS[each], isOn: modes.includes(each) }])) as Record<Mode, Setup>

test('the advisor reads the turns while opened or minimized and switched on', () => {
  expect(isReading('open', true)).toBe(true)
  expect(isReading('minimized', true)).toBe(true)
})

test('the advisor reads no turn while off, or switched off in the pane', () => {
  expect(isReading('off', true)).toBe(false)
  expect(isReading('open', false)).toBe(false)
  expect(isReading('minimized', false)).toBe(false)
})

test('some mode comments while the advisor reads and a mode is on', () => {
  expect(isCommenting('minimized', true, on('troll'))).toBe(true)
  expect(isCommenting('open', true, on('vigilante', 'asesor'))).toBe(true)
})

test('no mode comments while the advisor reads nothing, or no mode is on', () => {
  expect(isCommenting('off', true, on('troll'))).toBe(false)
  expect(isCommenting('open', false, on('troll'))).toBe(false)
  expect(isCommenting('open', true, on())).toBe(false)
})

// A session as it starts: the pane not up, the advisor off, interactive, set to start minimized, and the
// conversation empty unless said; `asked` counts how many times the conversation was looked at.
const started = async (
  given: { isUp?: boolean; now?: View; isInteractive?: boolean; startsOpen?: boolean; isEmpty?: boolean } = {},
) => {
  const asked = { times: 0 }
  const view = await startView(
    {
      isUp: given.isUp ?? false,
      now: given.now ?? 'off',
      isInteractive: given.isInteractive ?? true,
      startsOpen: given.startsOpen ?? true,
    },
    () => {
      asked.times++

      return Promise.resolve(given.isEmpty ?? true)
    },
  )

  return { view, asked: asked.times }
}

test('a pane that stayed up while the state started over is the advisor on', async () => {
  expect(await started({ isUp: true })).toEqual({ view: 'open', asked: 0 })
  expect(await started({ isUp: true, startsOpen: false, isInteractive: false })).toEqual({ view: 'open', asked: 0 })
})

test('an interactive new session set to start minimized starts so while its conversation is empty', async () => {
  expect(await started()).toEqual({ view: 'minimized', asked: 1 })
})

test('a session that is not interactive does not start minimized', async () => {
  expect(await started({ isInteractive: false })).toEqual({ view: undefined, asked: 0 })
})

test('a session not set to start minimized keeps its view', async () => {
  expect(await started({ startsOpen: false })).toEqual({ view: undefined, asked: 0 })
})

test('a session with a conversation already does not start minimized', async () => {
  expect(await started({ isEmpty: false })).toEqual({ view: undefined, asked: 1 })
})

test('a session whose advisor is already open or minimized keeps its view', async () => {
  expect(await started({ now: 'open' })).toEqual({ view: undefined, asked: 0 })
  expect(await started({ now: 'minimized' })).toEqual({ view: undefined, asked: 0 })
  expect(await started({ now: 'open', isUp: true })).toEqual({ view: undefined, asked: 0 })
})
