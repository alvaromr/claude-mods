import { expect, test } from 'claude-code/testing'

import { folderOf, isNameOurs, isNameOursUnlisted, metaOf, metadataFiles } from '../hooks/sessions'

test('the metadata of the live sessions is in the home folder, under .claude', () => {
  expect(folderOf('/home/me')).toBe('/home/me/.claude/sessions')
})

test('only the JSON files of the folder are metadata', () => {
  const entries = [
    { name: 'a.json' },
    { name: 'notes.txt' },
    { name: 'b.json.bak' },
    { name: 'json' },
    { name: 'c.json' },
  ]

  expect(metadataFiles(entries)).toEqual([{ name: 'a.json' }, { name: 'c.json' }])
})

test('a metadata file is read as the JSON it holds', () => {
  expect(metaOf('{"sessionId":"abc","name":"project-87","nameSource":"derived"}')).toEqual({
    sessionId: 'abc',
    name: 'project-87',
    nameSource: 'derived',
  })
  expect(metaOf('null')).toBeNull()
})

test('a file halfway through being written is no metadata', () => {
  expect([metaOf('{"sessionId":"ab'), metaOf('')]).toEqual([null, null])
})

test('a name the session was born with is ours to replace, so is the one this mod gave', () => {
  expect(isNameOurs({ nameSource: 'derived', name: 'project-87' }, null)).toBe(true)
  expect(isNameOurs({ nameSource: 'user', name: 'comparar-facturas' }, 'comparar-facturas')).toBe(true)
})

test('a name the person or another hook gave is not ours to replace', () => {
  expect(isNameOurs({ nameSource: 'user', name: 'mine' }, 'comparar-facturas')).toBe(false)
  // No title given yet: a missing name is not one the mod gave.
  expect(isNameOurs({ nameSource: 'user' }, null)).toBe(false)
  expect(isNameOurs({}, 'comparar-facturas')).toBe(false)
})

test('without metadata, a session with no name or with the one this mod gave is ours to name', () => {
  expect(isNameOursUnlisted('', null)).toBe(true)
  expect(isNameOursUnlisted('comparar-facturas', 'comparar-facturas')).toBe(true)
  expect(isNameOursUnlisted('by-the-person', 'comparar-facturas')).toBe(false)
  expect(isNameOursUnlisted('by-the-person', null)).toBe(false)
})
