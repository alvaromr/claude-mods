import { TEXT } from './text'

export type Hunk = { oldStart: number; oldLines: number; newStart: number; newLines: number; lines: readonly string[] }
export type Outcome = { hunks?: Hunk[]; changes: { path: string; hunks: Hunk[] }[]; media?: string }

// The longest diff or output drawn at once, under the 100000 characters a drawing takes.
const TEXT_LENGTH = 60000

// An edit's hunks: a created file's are its lines, all added.
const hunksOf = (output: unknown): Hunk[] | undefined => {
  const { type, content, structuredPatch } = (output ?? {}) as {
    type?: unknown
    content?: unknown
    structuredPatch?: unknown
  }

  if (type === 'create' && typeof content === 'string') {
    const lines = content.replace(/\n$/, '').split('\n')

    return [{ oldStart: 0, oldLines: 0, newStart: 1, newLines: lines.length, lines: lines.map(line => `+${line}`) }]
  }

  return Array.isArray(structuredPatch) ? (structuredPatch as Hunk[]) : undefined
}

// The files a command changed, each with its hunks.
const changesOf = (output: unknown) => {
  const { bashEditDiff } = (output ?? {}) as {
    bashEditDiff?: { files?: { filePath?: unknown; hunks?: unknown }[] } | null
  }

  return (bashEditDiff?.files ?? []).flatMap(file =>
    typeof file.filePath === 'string' && Array.isArray(file.hunks)
      ? [{ path: file.filePath, hunks: file.hunks as Hunk[] }]
      : [],
  )
}

const kilobytes = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`

// What a read took in when it was no text: «Read image · 1080×2408 · 31 KB».
const mediaOf = (output: unknown) => {
  const { type, file } = (output ?? {}) as {
    type?: unknown
    file?: { originalSize?: unknown; dimensions?: { originalWidth?: unknown; originalHeight?: unknown } } | null
  }
  const size = typeof file?.originalSize === 'number' ? [kilobytes(file.originalSize)] : []
  const { originalWidth: width, originalHeight: height } = file?.dimensions ?? {}
  const box = typeof width === 'number' && typeof height === 'number' ? [`${width}×${height}`] : []

  return type === 'image'
    ? [TEXT.readImage, ...box, ...size].join(' · ')
    : type === 'pdf'
      ? [TEXT.readPdf, ...size].join(' · ')
      : undefined
}

/** What a call's result, as the engine or the transcript holds it, gives to draw: hunks, files a command changed, what a read took in. */
export const outcomeOf = (output: unknown): Outcome => ({
  hunks: hunksOf(output),
  changes: changesOf(output),
  media: mediaOf(output),
})

/** A command's result less its diff; none where it had none, and then the result is the engine's as it is. */
export const withoutBashEdit = (output: unknown) => {
  const { bashEditDiff, ...rest } = output as { bashEditDiff?: unknown }

  return bashEditDiff === undefined ? undefined : rest
}

const added = (hunks: readonly Hunk[]) => hunks.flatMap(hunk => hunk.lines).filter(line => line.startsWith('+')).length
const removed = (hunks: readonly Hunk[]) =>
  hunks.flatMap(hunk => hunk.lines).filter(line => line.startsWith('-')).length

/** The hunks' counts as the line draws them, ` +3` and ` −1`, the second marked with ` ?` where the hunks are not all known; and their length together. */
export const countsOf = (hunks: readonly Hunk[], isKnown: boolean) => {
  const plus = ` +${added(hunks)}`
  const minus = ` −${removed(hunks)}${isKnown ? '' : ' ?'}`

  return { plus, minus, length: plus.length + minus.length }
}

/** The hunks as a unified diff, the ones that fit; one too long for the rest is cut at a line, its header counting the lines kept. */
export const unified = (hunks: readonly Hunk[]) => {
  let diff = ''

  for (const hunk of hunks) {
    const lines: string[] = []
    // The length of the lines kept, joined.
    let joined = 0

    for (const line of hunk.lines) {
      if (diff.length + joined + line.length > TEXT_LENGTH) {
        break
      }

      joined += (lines.length === 0 ? 0 : 1) + line.length
      lines.push(line)
    }

    const old = lines.filter(line => !line.startsWith('+')).length
    const now = lines.filter(line => !line.startsWith('-')).length

    if (lines.length === 0) {
      break
    }

    diff += `@@ -${hunk.oldStart},${old} +${hunk.newStart},${now} @@\n${lines.join('\n')}\n`

    if (lines.length < hunk.lines.length) {
      break
    }
  }

  return diff
}

/** The lines that fit in a drawing. */
export const fitting = (lines: readonly string[]) => {
  let room = TEXT_LENGTH
  const kept: string[] = []

  for (const line of lines) {
    room -= line.length + 1

    if (room < 0) {
      break
    }

    kept.push(line)
  }

  return kept
}
