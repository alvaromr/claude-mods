import { expect, test } from 'claude-code/testing'

import { cutAtLinks } from '../hooks/prompt-links'

test('a text with no link is not cut', () => {
  expect(cutAtLinks('nothing here', [])).toBeUndefined()
})

test('the text is cut at each link, the first with what is before it, the last with what is after', () => {
  const text = 'ver ABC-1 y [Image #2] fin'

  expect(
    cutAtLinks(text, [
      { start: 4, end: 9, href: 'a' },
      { start: 12, end: 22, href: 'b' },
    ]),
  ).toEqual({
    parts: [
      { before: 'ver ', label: 'ABC-1', href: 'a' },
      { before: ' y ', label: '[Image #2]', href: 'b' },
    ],
    after: ' fin',
  })
})

test('the links are taken in the order they appear in the text, whichever order they come in', () => {
  const links = [
    { start: 12, end: 22, href: 'b' },
    { start: 4, end: 9, href: 'a' },
  ]

  expect(cutAtLinks('ver ABC-1 y [Image #2] fin', links)?.parts.map(part => part.href)).toEqual(['a', 'b'])
  // The list given is left as it was.
  expect(links.map(link => link.href)).toEqual(['b', 'a'])
})

test('a link at the very start or end leaves no text around it', () => {
  expect(cutAtLinks('ABC-1', [{ start: 0, end: 5, href: 'a' }])).toEqual({
    parts: [{ before: '', label: 'ABC-1', href: 'a' }],
    after: '',
  })
})
