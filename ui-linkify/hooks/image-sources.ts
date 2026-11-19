import type { Span } from '../types'
import { fileUrl } from './path-links'

// A pasted image as the prompt names it: «[Image #3]».
const TOKEN = /\[Image #(\d+)\]/g

/** An image block as the sources give it: its number, and what they say of its type and bytes. */
export type Pasted = { n: number; mediaType: unknown; data: unknown }

/** The numbers of the images a text names, in order. */
export const numbersIn = (text: string) => [...text.matchAll(TOKEN)].map(([, n]) => Number(n))

/** Whether the images the prompt box names differ from those `draft` holds, the ones last looked at. */
export const isNewDraft = (numbers: readonly number[], draft: readonly number[]) => numbers.join() !== draft.join()

/** The images a prompt names whose original is known, as the links of its row. */
export const imageSpans = (text: string, originalOf: (n: number) => string | null | undefined): Span[] =>
  [...text.matchAll(TOKEN)].flatMap(({ 0: token, 1: n, index }) => {
    const original = originalOf(Number(n))

    return original == null ? [] : [{ start: index, end: index + token.length, href: fileUrl(original) }]
  })

/** A user message names its images in the order it holds their blocks: each one named, and whether it holds any. */
export const pastedImages = (content: readonly { type: string; [field: string]: unknown }[]) => {
  const text = content.flatMap(block => (block.type === 'text' ? [String(block.text)] : [])).join('\n')
  const images = content.filter(block => block.type === 'image')

  return {
    pasted: [...text.matchAll(TOKEN)].map(([, n], i): Pasted => {
      const source = images[i]?.source as { media_type?: unknown; data?: unknown } | undefined

      return { n: Number(n), mediaType: source?.media_type, data: source?.data }
    }),
    hasImages: images.length > 0,
  }
}

/** The images jq picked out of the transcript, a line each: «number type bytes»; past 4 MiB the output is cut, and with it the last image. */
export const transcriptImages = (stdout: string, isTruncated: boolean): Pasted[] => {
  const lines = stdout.split('\n')

  return (isTruncated ? lines.slice(0, -1) : lines).map(line => {
    const [n, mediaType, data] = line.split(' ')

    return { n: Number(n), mediaType, data }
  })
}

/** The folder `pwd` printed, the names `ls` listed in it, and each of them that is an original, by its number: `<n>.png`. */
export const listedOriginals = (stdout: string) => {
  const [folder = '', ...names] = stdout.split('\n')

  return {
    folder,
    names,
    originals: names.flatMap((name): [number, string][] => {
      const n = /^(\d+)\.png$/.exec(name)?.[1]

      return n === undefined ? [] : [[Number(n), `${folder}/${name}`]]
    }),
  }
}

/** The wanted images whose file is listed and that no picture holds yet. */
export const toRead = (wanted: readonly number[], names: readonly string[], isKnown: (n: number) => boolean) =>
  wanted.filter(n => !isKnown(n) && names.includes(`${n}.png`))
