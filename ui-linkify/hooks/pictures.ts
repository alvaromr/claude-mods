/** A pasted image the mod can draw: a PNG, base64, and its size in pixels. */
export type Picture = { png: string; width: number; height: number }

// Largest picture drawn in the terminal, in cells, a thumbnail, and the most
// the settings allow; a cell is about twice as tall as wide.
export const COLUMNS = 80
export const ROWS = 20
// Pixels a cell is drawn from at most, so a small picture is not blown up.
const CELL_PIXELS = 8
// Pixels a thumbnail holds at most, whatever its box: what the terminal's budget pays for each.
const THUMBNAIL_PIXELS = 640 * 192

// The PNG's size from its IHDR chunk, the first 24 bytes; undefined for any other format.
const pngSize = (png: string) => {
  const head = atob(png.slice(0, 32))
  const word = (at: number) => [0, 1, 2, 3].reduce((n, i) => n * 256 + head.charCodeAt(at + i), 0)

  return head.slice(12, 16) === 'IHDR' ? { width: word(16), height: word(20) } : undefined
}

/** The picture an image block holds: none unless it is a PNG. */
export const pictureOf = (mediaType: unknown, data: unknown): Picture | undefined => {
  const size = mediaType === 'image/png' && typeof data === 'string' ? pngSize(data) : undefined

  return size && { png: data as string, ...size }
}

/** The picture scaled by macOS's sips, out of its exit and what it printed; none where that failed. */
export const shrunk = (exitCode: number, stdout: string): Picture | undefined => {
  const png = stdout.trim()
  const size = exitCode === 0 ? pngSize(png) : undefined

  return size && { png, ...size }
}

/** The box in cells that keeps the picture's shape inside the room there is. */
export const cells = ({ width, height }: Picture, room: number, rowRoom = ROWS) => {
  let columns = Math.max(1, Math.min(COLUMNS, room, Math.ceil(width / CELL_PIXELS)))
  let rows = Math.max(1, Math.round((columns * height) / width / 2))

  if (rows > Math.min(ROWS, rowRoom)) {
    rows = Math.max(1, Math.min(ROWS, rowRoom))
    columns = Math.max(1, Math.round((rows * 2 * width) / height))
  }

  return { columns, rows }
}

/**
 * The picture's pixels at the size of its largest box, and no more than
 * THUMBNAIL_PIXELS, the terminal scaling it up to the box: it keeps every
 * picture it is sent at full size, up to a budget (Orca's, 8 million pixels)
 * past which it drops the oldest and leaves their boxes blank.
 */
export const thumbnailSize = (picture: Picture) => {
  const { width, height } = picture
  const { columns, rows } = cells(picture, COLUMNS)
  const scale = Math.min(
    1,
    (columns * CELL_PIXELS) / width,
    (rows * CELL_PIXELS * 2) / height,
    Math.sqrt(THUMBNAIL_PIXELS / (width * height)),
  )

  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

/** Whether the picture is larger than its thumbnail would be. */
export const isLarger = (picture: Picture) => thumbnailSize(picture).width < picture.width

/** The room for a prompt's pictures: the indent, the border and a cell to spare, and no more than the settings allow. */
export const roomIn = (limit: number, columns: number | undefined) => Math.min(limit, (columns ?? COLUMNS) - 6)

/**
 * The room for the pictures of the prompt box: each one's share of the width,
 * less its border and the gap; the border's rows; and no more than the settings
 * allow. Under the fullscreen layout the band is the bottom slot, which the
 * other mods' rows share: the pictures take half of it, so the band's window,
 * kept at its top, hides none of theirs.
 */
export const bandRoom = (
  limits: { columns: number; rows: number },
  band: { bodyColumns: number; maxRows: number; isFullscreen: boolean },
  count: number,
) => {
  const bandRows = band.isFullscreen ? Math.floor(band.maxRows / 2) : band.maxRows

  return {
    room: Math.min(limits.columns, Math.floor(band.bodyColumns / count) - 3),
    rowRoom: Math.min(limits.rows, bandRows - 2),
  }
}

/** Where a picture's frame has its button that sends it again: its bottom edge, the indent included, in the middle. */
export const resendAt = (box: { columns: number; rows: number }) => ({
  top: box.rows + 1,
  left: 2 + Math.floor((box.columns - 1) / 2),
})

/** A picture's alt, where the terminal draws no picture. */
export const altOf = (n: number) => `[Image #${n}]`
