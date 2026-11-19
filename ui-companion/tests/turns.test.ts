import { expect, test } from 'claude-code/testing'

import type { Mode } from '../types'
import type { Ask } from '../hooks/brief'
import { isCompaction, isOwnAnswer, isQueued, isSameTurn, keeping } from '../hooks/turns'

test('a turn’s end is read when it is the conversation’s own answer', () => {
  expect(isOwnAnswer(undefined, 'answer')).toBe(true)
})

test('a subagent’s turn, and one cut short, are not read', () => {
  expect(isOwnAnswer('agent-1', 'answer')).toBe(false)
  expect(isOwnAnswer(undefined, 'interrupt')).toBe(false)
  expect(isOwnAnswer('agent-1', 'interrupt')).toBe(false)
})

test('a compaction of the conversation resets what the kept texts cover', () => {
  expect(isCompaction('manual', undefined, undefined)).toBe(true)
  expect(isCompaction('auto', undefined, undefined)).toBe(true)
})

test('a precompute, a subagent’s compaction and a vetoed one are not the conversation’s', () => {
  expect(isCompaction('precompute', undefined, undefined)).toBe(false)
  expect(isCompaction('auto', 'agent-1', undefined)).toBe(false)
  expect(isCompaction('auto', undefined, 'off')).toBe(false)
})

test('a mode’s own comment is a repeat when the transcript has the length it last commented at', () => {
  expect(isSameTurn('own', 4, 4)).toBe(true)
  expect(isSameTurn('own', 3, 4)).toBe(false)
  expect(isSameTurn('own', undefined, 4)).toBe(false)
})

test('a summary, or a comment made again, is never a repeat', () => {
  expect(isSameTurn('summary', 4, 4)).toBe(false)
  expect(isSameTurn('redo', 4, 4)).toBe(false)
})

test('what is asked is queued when the same mode is already waiting for the same ask', () => {
  const waiting: { mode: Mode; ask: Ask }[] = [{ mode: 'asesor', ask: 'own' }]

  expect(isQueued(waiting, 'asesor', 'own')).toBe(true)
  expect(isQueued(waiting, 'asesor', 'redo')).toBe(false)
  expect(isQueued(waiting, 'troll', 'own')).toBe(false)
  expect(isQueued([], 'asesor', 'own')).toBe(false)
})

test('a mode that keeps a text writes it unless the reply is silent', () => {
  expect(keeping('resumen', false, 'own')).toBe('text')
  expect(keeping('pendientes', false, 'redo')).toBe('text')
  expect(keeping('resumen', true, 'own')).toBe('nothing')
})

test('a silent reply leaves a kept text as it was even when it is made again', () => {
  expect(keeping('pendientes', true, 'redo')).toBe('nothing')
})

test('a mode of notes adds a note when it has something to say', () => {
  expect(keeping('asesor', false, 'own')).toBe('note')
  expect(keeping('troll', false, 'redo')).toBe('note')
})

test('a mode of notes that is silent adds nothing, unless it was made again, when the note it replaces goes', () => {
  expect(keeping('vigilante', true, 'own')).toBe('nothing')
  expect(keeping('vigilante', true, 'summary')).toBe('nothing')
  expect(keeping('vigilante', true, 'redo')).toBe('note')
})
