import type { EngineInterface, On } from 'claude-code'

import type { Span } from '../types'
import {
  imageSpans,
  isNewDraft,
  listedOriginals,
  numbersIn,
  pastedImages,
  toRead,
  transcriptImages,
} from './image-sources'
import type { Pasted } from './image-sources'
import { altOf, bandRoom, cells, isLarger, pictureOf, resendAt, roomIn, shrunk, thumbnailSize } from './pictures'
import type { Picture } from './pictures'
import { isAfterPause, marked, staggerOf } from './resend'
import { orElse, shown } from './settings'

// Every pasted image of the session by its number, null for one that cannot be
// drawn (not a PNG, or not found yet): a row is drawn again on each resize and scroll.
const pictures = new Map<number, Picture | null>()
// Lookups run one after another, so rows drawn together read the session once.
let lookups: Promise<unknown> = Promise.resolve()

// Whether this terminal draws pictures rather than their alt; nobody says until one is drawn.
let drawsPictures: boolean | undefined
let isAsking = false

// A blit of the source an Image already holds is refused only where it draws its alt.
const ask = async ($: EngineInterface, requestId: string, key: string, png: string) => {
  const refusal = await $.ui.blit({ requestId, key, source: { png } }).then(
    ({ deny }) => deny,
    (error: unknown) => String(error),
  )

  if (refusal === undefined) {
    drawsPictures = true
  } else if (refusal.includes('placeholder images')) {
    drawsPictures = false
    $.ui.invalidate('ui.render')
  }

  isAsking = false
}

const keep = ({ n, mediaType, data }: Pasted) => {
  const picture = pictureOf(mediaType, data)

  // A picture already kept may be its thumbnail by now.
  if (picture && !pictures.get(n)) {
    pictures.set(n, picture)
  }
}

// A user message names its images in the order it holds their blocks; true when it holds any.
const keepAll = (content: readonly { type: string; [field: string]: unknown }[]) => {
  const { pasted, hasImages } = pastedImages(content)

  for (const image of pasted) {
    keep(image)
  }

  return hasImages
}

// The conversation in memory: before a compaction it holds every image pasted since.
const fromConversation = async ($: EngineInterface) => {
  for (const message of await $.session.messages({ as: 'api' })) {
    if (message.role === 'user') {
      keepAll(message.content)
    }
  }
}

// The transcript file on disk, which keeps the images a compaction took out of
// memory; too large to read here, so jq picks out the wanted ones
// (scripts/transcript.sh).
const fromTranscript = async ($: EngineInterface, wanted: number[]) => {
  const root = (await $.env.get('CLAUDE_CONFIG_DIR')) ?? `${await $.env.get('HOME')}/.claude`
  const { exitCode, stdout, isStdoutTruncated } = await $.process.run([
    'sh',
    `${$.plugin.root}/scripts/transcript.sh`,
    JSON.stringify(wanted),
    root,
    await $.session.id(),
  ])

  if (exitCode === 0) {
    for (const image of transcriptImages(stdout, isStdoutTruncated)) {
      keep(image)
    }
  }
}

// Each pasted image's file in Claude Code's temp folder, at its original size,
// by its number: what its `[Image #n]` in the prompt's row opens, which Claude
// Code's own row under the picture does not always link; null where the folder
// had none when looked at. The mod keeps no copy.
const originals = new Map<number, string | null>()

// Claude Code's temp folder keeps each pasted image of the session from the
// paste on, images/<n>.png, written after the box shows its token, a large
// screenshot seconds after: the box's own are looked for every 200 ms, up to
// BOX_TRIES times, before one is taken as not drawable. Each look notes every
// original it lists.
const BOX_TRIES = 50
const fromFiles = async ($: EngineInterface, wanted: number[], tries: number) => {
  for (let tried = 1; ; tried++) {
    const { stdout } = await $.process.run([
      '/bin/sh',
      '-c',
      'cd "${CLAUDE_CODE_TMPDIR:-/tmp}"/claude-"$(id -u)"/*/"$1"/images && pwd && ls',
      'sh',
      await $.session.id(),
    ])
    const { folder, names, originals: listed } = listedOriginals(stdout)

    for (const [n, path] of listed) {
      originals.set(n, path)
    }

    for (const n of toRead(wanted, names, n => pictures.has(n))) {
      // Past 4 MiB the read rejects, and the transcript is looked at instead.
      const read = await $.fs
        .read(`${folder}/${n}.png`, { as: 'bytes' })
        .catch(orElse($, `reading the pasted ${n}.png`, undefined))

      keep({ n, mediaType: 'image/png', data: read?.base64 })
    }

    if (tried >= tries || wanted.every(n => pictures.has(n))) {
      return
    }

    await $.clock.sleep(200)
  }
}

// The tokens of the prompt box when last looked at: a change draws the band again.
let draft: number[] = []

const track = ($: EngineInterface, text: string) => {
  const numbers = numbersIn(text)

  if (isNewDraft(numbers, draft)) {
    draft = numbers
    $.ui.invalidate('ui.render')
  }
}

// How long a miss stands before it is looked up again: a row drawn once found
// no file, and the file may be written by now.
const MISS_MS = 5000

const lookUp = async ($: EngineInterface, numbers: number[], tries: number) => {
  const unknown = () => numbers.filter(n => !pictures.has(n))

  if (unknown().length > 0) {
    await fromConversation($).catch(orElse($, 'reading the conversation', undefined))
  }

  // Looked at even when the conversation gave every picture: it tells where each original is.
  if (numbers.some(n => !pictures.has(n) || !originals.has(n))) {
    await fromFiles($, unknown(), tries).catch(orElse($, 'reading the pasted files', undefined))
  }

  if (unknown().length > 0) {
    await fromTranscript($, unknown()).catch(orElse($, 'reading the transcript', undefined))
  }

  for (const n of unknown()) {
    pictures.set(n, null)
  }

  for (const n of numbers.filter(n => !originals.has(n))) {
    originals.set(n, null)
  }

  // A miss is kept so a drawing does not look again at once, which would draw
  // again and look again; it is forgotten after a while, so a later one does.
  $.clock.after(MISS_MS, () => {
    for (const n of numbers) {
      if (pictures.get(n) === null) {
        pictures.delete(n)
      }

      if (originals.get(n) === null) {
        originals.delete(n)
      }
    }
  })
}

// The pictures sips could not scale, drawn at full size rather than tried again.
const unshrinkable = new Set<number>()

const isLarge = (n: number) => {
  const picture = pictures.get(n)

  return picture != null && !unshrinkable.has(n) && isLarger(picture)
}

// Scaled by macOS's sips through two temporary files; the picture as it was
// where that fails, as on another system.
const shrink = async ($: EngineInterface, n: number) => {
  const picture = pictures.get(n)

  if (!picture || !isLarge(n)) {
    return
  }

  unshrinkable.add(n)
  const { width, height } = thumbnailSize(picture)
  const { exitCode, stdout } = await $.process.run(
    [
      '/bin/sh',
      '-c',
      'in=$(mktemp) && out="$in.png" && base64 -D -o "$in" && sips -z "$1" "$2" "$in" --out "$out" >/dev/null && base64 -i "$out"; status=$?; rm -f "$in" "$out"; exit $status',
      'sh',
      String(height),
      String(width),
    ],
    { stdin: picture.png },
  )
  const smaller = shrunk(exitCode, stdout)

  if (smaller) {
    pictures.set(n, smaller)
    unshrinkable.delete(n)
  }
}

const picturesOf = async ($: EngineInterface, numbers: number[], tries = 1) => {
  if (numbers.some(n => !pictures.has(n) || !originals.has(n) || isLarge(n))) {
    lookups = lookups
      .then(() => lookUp($, numbers, tries))
      .then(() => Promise.all(numbers.map(n => shrink($, n).catch(orElse($, `shrinking image ${n}`, undefined)))))
      .catch(orElse($, 'looking up the images', undefined))
    await lookups
  }

  return numbers.flatMap(n => {
    const picture = pictures.get(n)

    return picture ? [{ n, ...picture }] : []
  })
}

// Whether a lookup started from a drawing has not drawn again yet.
let isLooking = false

// The pictures of `numbers` ready to draw now: a drawing waits on no lookup,
// which made a paste slow. The rest are looked up after it, and everything is
// drawn again once they are.
const readyPictures = ($: EngineInterface, numbers: number[], tries = 1) => {
  const isReady = (n: number) => pictures.has(n) && originals.has(n) && !isLarge(n)

  if (!numbers.every(isReady) && !isLooking) {
    isLooking = true
    $.clock.after(0, () =>
      picturesOf($, numbers, tries).finally(() => {
        isLooking = false
        $.ui.invalidate('ui.render')
      }),
    )
  }

  return numbers.flatMap(n => {
    const picture = pictures.get(n)

    return picture && !isLarge(n) ? [{ n, ...picture }] : []
  })
}

/**
 * The images a prompt names whose original is known, as the links of its row
 * (register.tsx draws it): known once the row's pictures were looked up, after
 * which the row is drawn again.
 */
export const imageLinks = (text: string): Span[] => imageSpans(text, n => originals.get(n))

// The Images whose last blit sent the marked bytes, by site and key; a redraw
// draws the picture as it is again.
const isMarked = new Set<string>()

type Drawn = { requestId: string; key: string; png: string }

// Every Image drawn, by site and key, till a blit finds it gone.
const onScreen = new Map<string, Drawn>()

const drew = (requestId: string, key: string, png: string) => {
  const id = `${requestId} ${key}`

  isMarked.delete(id)
  onScreen.set(id, { requestId, key, png })
}

// Sends a picture again, in other bytes than the last: the engine sends
// nothing for a source equal to the one it drew last.
const sendAgain = async ($: EngineInterface, { requestId, key, png }: Drawn) => {
  const id = `${requestId} ${key}`
  const wasMarked = isMarked.delete(id)

  if (!wasMarked) {
    isMarked.add(id)
  }

  const { deny } = await $.ui.blit({ requestId, key, source: { png: wasMarked ? png : marked(png) } })

  if (deny !== undefined) {
    onScreen.delete(id)
    isMarked.delete(id)
  }
}

// The time of the last key typed: see isAfterPause.
let typedAt: number | undefined

const sendAllAgainAfterPause = async ($: EngineInterface) => {
  const now = await $.clock.now()
  const isBack = isAfterPause(typedAt, now)

  typedAt = now

  if (isBack) {
    ;[...onScreen.values()].forEach((drawn, i) =>
      $.clock.after(staggerOf(i), () => sendAgain($, drawn).catch(orElse($, 'sending a picture again', undefined))),
    )
  }
}

// Everything kept of the images of a session: a new one, after /clear or a
// resume, numbers its pastes again from 1, so another picture would be drawn
// for the same number. A session start forgets them too (register.tsx).
export const forgetImages = () => {
  pictures.clear()
  originals.clear()
  unshrinkable.clear()
  onScreen.clear()
  isMarked.clear()
  draft = []
}

// The images pasted into a prompt, under its row and above the box.
export const registerImages = (on: On) => {
  // A /clear starts a new session without a session.start: the end of the old one is the sign.
  on('session.end', (_, e, next) => {
    forgetImages()

    return next(e)
  })

  // The terminal alone: the desktop app draws a pasted image itself, over its prompt.
  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    const numbers = numbersIn(e.props.text)
    const s = await shown($)

    if (numbers.length === 0 || e.surface !== 'terminal' || drawsPictures === false || !s.images) {
      return next(e)
    }

    const found = readyPictures($, numbers)

    const [first] = found

    if (first === undefined) {
      return next(e)
    }

    const drawn = await next(e)

    if (drawsPictures === undefined && !isAsking) {
      isAsking = true
      $.clock.after(200, () => ask($, e.requestId, `image-${first.n}`, first.png))
    }

    const { Box, Button, Image } = $.ui.resolve(e)
    const room = roomIn(s.columns, e.viewport?.columns)

    // In the middle of each frame's bottom edge, a button that sends its
    // picture again, for a terminal that dropped it unseen by the pause: over
    // the picture it would hide a cell of it.
    const frames = found.map(picture => {
      const box = cells(picture, room, s.rows)
      const key = `image-${picture.n}`
      drew(e.requestId, key, picture.png)

      const resend = () =>
        void sendAgain($, { requestId: e.requestId, key, png: picture.png }).catch(
          orElse($, 'sending a picture again', undefined),
        )

      return (
        <Box key={`frame-${picture.n}`} paddingLeft={2}>
          <Box borderStyle="round" borderDimColor>
            <Image key={key} source={{ png: picture.png }} {...box} alt={altOf(picture.n)} />
          </Box>
          {/* Painted over the frame drawn before it, from this Box's edge, the
              indent included: its bottom edge is the row past the picture's. */}
          {s.resend && (
            <Box position="absolute" {...resendAt(box)}>
              <Button key={`resend-${picture.n}`} plain dimColor label=" ↻ " onPress={resend} />
            </Box>
          )}
        </Box>
      )
    })

    // Under the row, in the flow: laid over what follows, as a hover would,
    // the rows drawn after it painted over the picture.
    return (
      <Box flexDirection="column">
        {drawn}
        {frames}
      </Box>
    )
  })

  // Above the prompt box, the images pasted into it, side by side, from the
  // paste until it is sent or they are taken out.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const s = await shown($)

    if (e.surface !== 'terminal' || e.props.hasSurvey || drawsPictures === false || !s.draft) {
      return next(e)
    }

    const numbers = numbersIn((await $.prompt.read()).text)
    const found = numbers.length > 0 ? readyPictures($, numbers, BOX_TRIES) : []

    if (found.length === 0) {
      return next(e)
    }

    const drawn = await next(e)
    const { Box, Image } = $.ui.resolve(e)
    const { room, rowRoom } = bandRoom(
      s,
      { bodyColumns: e.props.bodyColumns, maxRows: e.props.maxRows, isFullscreen: e.viewport?.isFullscreen === true },
      found.length,
    )

    return (
      <Box flexDirection="column">
        {drawn}
        <Box flexDirection="row" columnGap={1}>
          {found.map(picture => {
            const key = `draft-image-${picture.n}`
            drew(e.requestId, key, picture.png)

            return (
              <Box key={`draft-${picture.n}`} borderStyle="round" borderDimColor>
                <Image
                  key={key}
                  source={{ png: picture.png }}
                  {...cells(picture, room, rowRoom)}
                  alt={altOf(picture.n)}
                />
              </Box>
            )
          })}
        </Box>
      </Box>
    )
  })

  // Pasting an image puts its token in the box; sending or clearing it empties it.
  on('prompt.edit', async ($, e, next) => {
    const box = await next(e)

    track($, box.text)
    // After the key is drawn, which waits on no blit.
    $.clock.after(0, () => sendAllAgainAfterPause($))

    return box
  })

  on('prompt.change', async ($, e, next) => {
    const result = await next(e)

    track($, e.text)

    return result
  })

  // The prompt's row is drawn before its message is kept: take its images as it
  // is, and draw it again.
  on('session.append', { door: 'prompt' }, async ($, e, next) => {
    const kept = await next(e)

    if (e.agentId === undefined && keepAll(e.message.content)) {
      $.ui.invalidate('ui.render')
    }

    return kept
  })
}
