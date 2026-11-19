import { expect, test } from 'claude-code/testing'

import {
  columnsOf,
  drawsAlert,
  drawsAny,
  drawsHeading,
  framesPrompt,
  indentOf,
  isPaneOpen,
  isReplyDrawn,
  teachesAlerts,
} from '../hooks/drawing'
import type { Part } from '../hooks/parts'
import { DEFAULTS } from '../hooks/preferences'
import type { Preferences } from '../types'

const TEXT: Part = { text: 'Hola.' }
const HEADING: Part = { heading: 2, title: 'Título' }
const ALERT: Part = { kind: 'WARNING', body: 'Ojo.' }
const QUOTE: Part = { kind: 'QUOTE', body: 'Cita.' }

/** The defaults with the headings, or one alert's look, switched off. */
const without = (what: 'headings' | 'WARNING' | 'every alert'): Preferences => ({
  ...DEFAULTS,
  headings: { ...DEFAULTS.headings, on: what !== 'headings' },
  looks: Object.fromEntries(
    Object.entries(DEFAULTS.looks).map(([kind, look]) => [
      kind,
      { ...look, on: what === 'headings' ? look.on : what === 'WARNING' ? kind !== 'WARNING' : false },
    ]),
  ) as Preferences['looks'],
})

test('the alerts are taught only where a terminal draws them', () => {
  expect(teachesAlerts(['terminal'])).toBe(true)
  expect(teachesAlerts(['desktop', 'terminal'])).toBe(true)
  expect(teachesAlerts(['desktop'])).toBe(false)
  expect(teachesAlerts([])).toBe(false)
})

test("a terminal's reply is the mod's to draw, a summary or another surface's is not", () => {
  expect(isReplyDrawn('terminal', false)).toBe(true)
  expect(isReplyDrawn('terminal', undefined)).toBe(true)
  expect(isReplyDrawn('terminal', true)).toBe(false)
  expect(isReplyDrawn('desktop', false)).toBe(false)
})

test('a heading is drawn while the headings are on, nothing else is a heading', () => {
  expect(drawsHeading(HEADING, DEFAULTS)).toBe(true)
  expect(drawsHeading(HEADING, without('headings'))).toBe(false)
  expect([TEXT, ALERT, QUOTE].map(part => drawsHeading(part, DEFAULTS))).toEqual([false, false, false])
})

test('an alert or a quote is drawn while its look is on, nothing else is one', () => {
  expect(drawsAlert(ALERT, DEFAULTS)).toBe(true)
  expect(drawsAlert(QUOTE, DEFAULTS)).toBe(true)
  expect(drawsAlert(ALERT, without('WARNING'))).toBe(false)
  // The looks are one each: another's off leaves this one drawn.
  expect(drawsAlert(QUOTE, without('WARNING'))).toBe(true)
  expect([TEXT, HEADING].map(part => drawsAlert(part, DEFAULTS))).toEqual([false, false])
})

test('a reply is drawn when any of its parts is, and left alone when none is or the mod is off', () => {
  expect(drawsAny([TEXT, ALERT], DEFAULTS)).toBe(true)
  expect(drawsAny([TEXT, HEADING], DEFAULTS)).toBe(true)
  expect(drawsAny([TEXT], DEFAULTS)).toBe(false)
  expect(drawsAny([], DEFAULTS)).toBe(false)
  expect(drawsAny([TEXT, HEADING], without('headings'))).toBe(false)
  expect(drawsAny([HEADING, ALERT], without('every alert'))).toBe(true)
  expect(drawsAny([ALERT, QUOTE], without('every alert'))).toBe(false)
  expect(drawsAny([TEXT, ALERT, HEADING], { ...DEFAULTS, on: false })).toBe(false)
})

test("a reply's first block is drawn in past its bullet, what follows lines up there", () => {
  expect(indentOf(true)).toBe(2)
  expect(indentOf(false)).toBe(0)
})

test('a row is as wide as its viewport, eighty columns where there is none', () => {
  expect(columnsOf({ columns: 132 })).toBe(132)
  expect(columnsOf({ columns: 0 })).toBe(0)
  expect(columnsOf(undefined)).toBe(80)
})

test("the person's own prompts are framed in a terminal, when typed or sent by a bridge, unless set to normal", () => {
  expect(framesPrompt(DEFAULTS, 'terminal', 'composer')).toBe(true)
  expect(framesPrompt(DEFAULTS, 'terminal', 'bridge')).toBe(true)
  expect(framesPrompt(DEFAULTS, 'terminal', 'plugin')).toBe(false)
  expect(framesPrompt(DEFAULTS, 'desktop', 'composer')).toBe(false)
  expect(framesPrompt({ ...DEFAULTS, on: false }, 'terminal', 'composer')).toBe(false)
  expect(framesPrompt({ ...DEFAULTS, prompts: { ...DEFAULTS.prompts, frame: 'normal' } }, 'terminal', 'composer')).toBe(
    false,
  )
  expect(framesPrompt({ ...DEFAULTS, prompts: { ...DEFAULTS.prompts, frame: 'box' } }, 'terminal', 'composer')).toBe(
    true,
  )
})

test('the pane is open when the panes open include its id', () => {
  expect(isPaneOpen([{ id: 'other' }, { id: 'colorify' }], 'colorify')).toBe(true)
  expect(isPaneOpen([{ id: 'other' }], 'colorify')).toBe(false)
  expect(isPaneOpen([], 'colorify')).toBe(false)
})
