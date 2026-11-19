// The code points a terminal draws in no cell (combining marks, joiners and
// variation selectors) and in two (East Asian wide characters and emoji).
const NO_CELL = [
  [0x300, 0x36f],
  [0x200b, 0x200f],
  [0x20d0, 0x20ff],
  [0xfe00, 0xfe0f],
] as const
const TWO_CELLS = [
  [0x1100, 0x115f],
  [0x2e80, 0xa4cf],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xfe30, 0xfe6f],
  [0xff00, 0xff60],
  [0xffe0, 0xffe6],
  [0x1f300, 0x1f64f],
  [0x1f680, 0x1f6ff],
  [0x1f900, 0x1f9ff],
  [0x20000, 0x3fffd],
] as const

const cellsOf = (char: string) => {
  const point = char.codePointAt(0) ?? 0
  const isIn = (ranges: readonly (readonly [number, number])[]) =>
    ranges.some(([from, to]) => point >= from && point <= to)

  return point < 0x300 ? 1 : isIn(NO_CELL) ? 0 : isIn(TWO_CELLS) ? 2 : 1
}

/** How many terminal cells a text takes: its characters' widths, not its UTF-16 length. */
export const widthOf = (text: string) => Array.from(text).reduce((sum, char) => sum + cellsOf(char), 0)

/** The text in `room` cells, cut at a character (never in the middle of one) and ended with «…». */
export const clip = (text: string, room: number) => {
  if (widthOf(text) <= room) {
    return text
  }

  let used = 0
  let kept = ''

  for (const char of text) {
    used += cellsOf(char)

    if (used > room - 1) {
      break
    }

    kept += char
  }

  return `${kept}…`
}

/** The end of a text in `room` cells, cut from the left at a character. */
export const clipStart = (text: string, room: number) => {
  let used = 0
  let kept = ''

  for (const char of Array.from(text).reverse()) {
    used += cellsOf(char)

    if (used > room) {
      break
    }

    kept = char + kept
  }

  return kept
}
