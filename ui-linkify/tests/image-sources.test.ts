import { expect, test } from 'claude-code/testing'

import {
  imageSpans,
  isNewDraft,
  listedOriginals,
  numbersIn,
  pastedImages,
  toRead,
  transcriptImages,
} from '../hooks/image-sources'

test('the images a text names are the numbers of its tokens, in order', () => {
  expect(numbersIn('a [Image #1] b [Image #23] c [Image #4]')).toEqual([1, 23, 4])
  expect(numbersIn('[Image #x] [Image #] [image #4] [Image 5] Image #6')).toEqual([])
  expect(numbersIn('')).toEqual([])
})

test('a prompt box is new when its numbers differ from the last looked at', () => {
  expect(isNewDraft([1, 2], [1, 2])).toBe(false)
  expect(isNewDraft([], [])).toBe(false)
  expect(isNewDraft([1, 2], [1])).toBe(true)
  expect(isNewDraft([], [3])).toBe(true)
  expect(isNewDraft([2, 1], [1, 2])).toBe(true)
  expect(isNewDraft([12], [1, 2])).toBe(true)
})

test('an image whose original is known is a link to it, from its token’s start to its end', () => {
  const originals = new Map([[2, '/tmp/x y/2.png']])

  expect(imageSpans('ver [Image #2] y [Image #3]', n => originals.get(n))).toEqual([
    { start: 4, end: 14, href: 'file:///tmp/x%20y/2.png' },
  ])
})

test('an image whose original is not known, or known to be missing, is no link', () => {
  const originals = new Map<number, string | null>([[1, null]])

  expect(imageSpans('[Image #1] [Image #2]', n => originals.get(n))).toEqual([])
  expect(imageSpans('sin imágenes', () => '/x.png')).toEqual([])
})

test('a user message names its images in the order of its image blocks, and tells it holds some', () => {
  const block = (data: string) => ({ type: 'image', source: { type: 'base64', media_type: 'image/png', data } })

  expect(
    pastedImages([
      { type: 'text', text: 'mira [Image #3]' },
      block('AAA'),
      { type: 'text', text: 'y [Image #5] [Image #6]' },
      block('BBB'),
      { type: 'tool_use' },
    ]),
  ).toEqual({
    pasted: [
      { n: 3, mediaType: 'image/png', data: 'AAA' },
      { n: 5, mediaType: 'image/png', data: 'BBB' },
      { n: 6, mediaType: undefined, data: undefined },
    ],
    hasImages: true,
  })
})

test('a message with images and no token names none, and one with none holds none', () => {
  expect(pastedImages([{ type: 'text', text: 'sin tokens' }, { type: 'image' }])).toEqual({
    pasted: [],
    hasImages: true,
  })
  expect(pastedImages([{ type: 'text', text: 'hola [Image #1]' }])).toEqual({
    pasted: [{ n: 1, mediaType: undefined, data: undefined }],
    hasImages: false,
  })
  expect(pastedImages([])).toEqual({ pasted: [], hasImages: false })
})

test('the text of other blocks than text is not read for tokens, and one that is no string is read as it prints', () => {
  expect(pastedImages([{ type: 'tool_result', text: '[Image #1]' }]).pasted).toEqual([])
  expect(pastedImages([{ type: 'text', text: 7 }]).pasted).toEqual([])
})

test('the images jq picked out of the transcript are a number, a type and the bytes, a line each', () => {
  expect(transcriptImages('1 image/png AAA\n12 image/jpeg BBB', false)).toEqual([
    { n: 1, mediaType: 'image/png', data: 'AAA' },
    { n: 12, mediaType: 'image/jpeg', data: 'BBB' },
  ])
  expect(transcriptImages('', false).map(image => image.data)).toEqual([undefined])
})

test('past 4 MiB the output is cut, and with it the last image', () => {
  expect(transcriptImages('1 image/png AAA\n2 image/png BB', true)).toEqual([
    { n: 1, mediaType: 'image/png', data: 'AAA' },
  ])
  expect(transcriptImages('1 image/png AAA', true)).toEqual([])
})

test('the originals are the files named by their number in the folder, whichever other the folder lists', () => {
  const folder = '/tmp/claude-501/proj/session/images'

  expect(listedOriginals(`${folder}\n1.png\n12.png\nnotes.txt\n3.jpg\nx.png\n1.png.bak\n.png\n04.png\n`)).toEqual({
    folder,
    names: ['1.png', '12.png', 'notes.txt', '3.jpg', 'x.png', '1.png.bak', '.png', '04.png', ''],
    originals: [
      [1, `${folder}/1.png`],
      [12, `${folder}/12.png`],
      [4, `${folder}/04.png`],
    ],
  })
})

test('a folder that listed nothing has no originals', () => {
  expect(listedOriginals('')).toEqual({ folder: '', names: [], originals: [] })
  expect(listedOriginals('/tmp/images\n')).toEqual({ folder: '/tmp/images', names: [''], originals: [] })
})

test('the images to read are the wanted ones whose file is listed and that are not known yet', () => {
  expect(toRead([1, 2, 3, 4], ['1.png', '3.png', '4.png', '40.png'], n => n === 3)).toEqual([1, 4])
  expect(toRead([1, 2], [], () => false)).toEqual([])
  expect(toRead([], ['1.png'], () => false)).toEqual([])
  // A file named alike is not the number's.
  expect(toRead([4], ['14.png', '4.png.bak'], () => false)).toEqual([])
})
