import { expect, test } from 'claude-code/testing'

import {
  COLUMNS,
  ROWS,
  altOf,
  bandRoom,
  cells,
  isLarger,
  pictureOf,
  resendAt,
  roomIn,
  shrunk,
  thumbnailSize,
} from '../hooks/pictures'

// A PNG as far as its header goes, `width` by `height`: never drawn, only measured.
const pngOf = (width: number, height: number) =>
  btoa(
    String.fromCharCode(
      ...[137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82],
      ...[width >> 24, (width >> 16) & 255, (width >> 8) & 255, width & 255],
      ...[height >> 24, (height >> 16) & 255, (height >> 8) & 255, height & 255],
      // The rest of the IHDR chunk, its checksum, and an empty IEND chunk.
      ...[8, 6, 0, 0, 0, 0, 0, 0, 0],
      ...[0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130],
    ),
  )

const picture = (width: number, height: number) => ({ png: pngOf(width, height), width, height })

test('the largest picture drawn is 80 columns by 20 rows', () => {
  expect([COLUMNS, ROWS]).toEqual([80, 20])
})

test('a PNG is a picture of the size its header says', () => {
  expect(pictureOf('image/png', pngOf(160, 90))).toEqual(picture(160, 90))
  // A size that takes the four bytes of each side, the first ones too.
  expect(pictureOf('image/png', pngOf(70_000, 16_909_060))).toEqual(picture(70_000, 16_909_060))
})

test('what is no PNG is no picture: another type, no bytes, or bytes with no PNG header', () => {
  expect(pictureOf('image/jpeg', pngOf(160, 90))).toBeUndefined()
  expect(pictureOf(undefined, pngOf(160, 90))).toBeUndefined()
  expect(pictureOf('image/png', undefined)).toBeUndefined()
  expect(pictureOf('image/png', 42)).toBeUndefined()
  expect(pictureOf('image/png', btoa('x'.repeat(40)))).toBeUndefined()
})

test('the picture sips scaled is the one it printed, trimmed, when it exited well', () => {
  expect(shrunk(0, `${pngOf(80, 45)}\n`)).toEqual(picture(80, 45))
  expect(shrunk(1, `${pngOf(80, 45)}\n`)).toBeUndefined()
  expect(shrunk(0, '')).toBeUndefined()
  expect(shrunk(0, btoa('x'.repeat(40)))).toBeUndefined()
})

test('the box in cells keeps the picture’s shape, a cell being 8 pixels wide and twice as tall', () => {
  expect(cells(picture(160, 90), 80)).toEqual({ columns: 20, rows: 6 })
  expect(cells(picture(160, 90), 10)).toEqual({ columns: 10, rows: 3 })
  expect(cells(picture(8, 8), 80)).toEqual({ columns: 1, rows: 1 })
  expect(cells(picture(9, 9), 80)).toEqual({ columns: 2, rows: 1 })
})

test('the box is at least a cell, however flat or narrow the picture or little the room', () => {
  expect(cells(picture(1000, 1), 80)).toEqual({ columns: 80, rows: 1 })
  expect(cells(picture(160, 90), 0)).toEqual({ columns: 1, rows: 1 })
  expect(cells(picture(160, 90), -5)).toEqual({ columns: 1, rows: 1 })
})

test('the box is no wider than 80 columns, whatever the room', () => {
  expect(cells(picture(2000, 100), 200).columns).toBe(80)
})

test('a tall picture is held to 20 rows, or to the room in rows, and its columns follow', () => {
  expect(cells(picture(100, 1000), 80)).toEqual({ columns: 4, rows: 20 })
  expect(cells(picture(100, 1000), 80, 5)).toEqual({ columns: 1, rows: 5 })
  expect(cells(picture(100, 1000), 80, 100)).toEqual({ columns: 4, rows: 20 })
  expect(cells(picture(100, 1000), 80, 0)).toEqual({ columns: 1, rows: 1 })
  // A picture that fits its rows is not touched.
  expect(cells(picture(160, 90), 80, 6)).toEqual({ columns: 20, rows: 6 })
  expect(cells(picture(160, 90), 80, 5)).toEqual({ columns: 18, rows: 5 })
})

test('a thumbnail is the picture’s pixels at its largest box, and no more than its budget', () => {
  // Small: left as it is.
  expect(thumbnailSize(picture(160, 90))).toEqual({ width: 160, height: 90 })
  // Over the budget of 640 x 192 pixels.
  expect(thumbnailSize(picture(2000, 1000))).toEqual({ width: 496, height: 248 })
  // Over its box, which is 80 columns of 8 pixels.
  expect(thumbnailSize(picture(1000, 100))).toEqual({ width: 640, height: 64 })
})

test('a picture is larger than its thumbnail when the thumbnail would be narrower', () => {
  expect(isLarger(picture(160, 90))).toBe(false)
  expect(isLarger(picture(8, 8))).toBe(false)
  expect(isLarger(picture(2000, 1000))).toBe(true)
  expect(isLarger(picture(641, 100))).toBe(true)
})

test('a prompt’s pictures have the width less six, and no more than the settings allow, 80 where none is said', () => {
  expect(roomIn(80, 100)).toBe(80)
  expect(roomIn(40, 100)).toBe(40)
  expect(roomIn(80, 50)).toBe(44)
  expect(roomIn(80, undefined)).toBe(74)
  expect(roomIn(10, undefined)).toBe(10)
})

test('the pictures of the box share its width, less their border and the gap, and its rows less the border', () => {
  const limits = { columns: 80, rows: 20 }
  const band = { bodyColumns: 100, maxRows: 12, isFullscreen: false }

  expect(bandRoom(limits, band, 1)).toEqual({ room: 80, rowRoom: 10 })
  expect(bandRoom(limits, band, 2)).toEqual({ room: 47, rowRoom: 10 })
  expect(bandRoom(limits, band, 3)).toEqual({ room: 30, rowRoom: 10 })
})

test('under the fullscreen layout the pictures take half the rows of the band', () => {
  const limits = { columns: 80, rows: 20 }

  expect(bandRoom(limits, { bodyColumns: 100, maxRows: 12, isFullscreen: true }, 2)).toEqual({ room: 47, rowRoom: 4 })
  expect(bandRoom(limits, { bodyColumns: 100, maxRows: 13, isFullscreen: true }, 2).rowRoom).toBe(4)
})

test('the room is no more than the settings allow', () => {
  const band = { bodyColumns: 100, maxRows: 40, isFullscreen: false }

  expect(bandRoom({ columns: 30, rows: 3 }, band, 1)).toEqual({ room: 30, rowRoom: 3 })
  expect(bandRoom({ columns: 80, rows: 50 }, band, 1)).toEqual({ room: 80, rowRoom: 38 })
})

test('the button that sends a picture again is in the middle of the frame’s bottom edge, past the indent', () => {
  expect(resendAt({ columns: 20, rows: 6 })).toEqual({ top: 7, left: 11 })
  expect(resendAt({ columns: 21, rows: 6 })).toEqual({ top: 7, left: 12 })
  expect(resendAt({ columns: 1, rows: 1 })).toEqual({ top: 2, left: 2 })
})

test('a picture the terminal does not draw is named by its number', () => {
  expect(altOf(3)).toBe('[Image #3]')
})
