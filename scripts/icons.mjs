// The mods' icons: `node scripts/icons.mjs` draws each mod's `.claude-plugin/icon.png`, the listing icon Claude Code
// takes from a plugin, and the one README.md shows. How they are drawn, and why, is in DESIGN.md (Icons). The PNGs
// are made with `sips`, which macOS ships; a mod added to the marketplace needs its glyph here first.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

/** The tile's colour by kind of mod, the prefix of its name (DESIGN.md, Names). */
export const KIND_COLORS = { bar: '#14646b', guard: '#a0521a', ui: '#4340b0', none: '#2e6e45' }
const INK = '#fffaf0'

/** The kind of mod `name` is: its prefix, or none. */
export const kindOf = name => /^(bar|guard|ui)-/.exec(name)?.[1] ?? 'none'

// Every glyph is drawn on a 96-unit grid, in two inks: the full one for what the mod is about, a tint of it for
// what frames it.
const M = `fill="${INK}"`
const T = `fill="${INK}" fill-opacity=".42"`
const H = `fill="${INK}" fill-opacity=".7"`
const stroke = (width = 8) =>
  `fill="none" stroke="${INK}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"`
const SHIELD = `<path ${T} d="M48 16 L75 26 V47 C75 63 64 74 48 81 C32 74 21 63 21 47 V26 Z"/>`

/**
 * A soft asterisk centred on x, y, `r` from its centre to a tip: eight rounded arms on a round hub. The pet's icon
 * draws it rather than the Claude mark the app shows, so the listing presents no third party's mark as the mod's.
 */
export const asterisk = (x, y, r) => {
  const width = r * 0.3
  const arms = Array.from(
    { length: 8 },
    (_, n) =>
      `<rect x="${x - width / 2}" y="${y - r}" width="${width}" height="${r}" rx="${width / 2}" transform="rotate(${n * 45} ${x} ${y})"/>`,
  )

  return `${arms.join('')}<circle cx="${x}" cy="${y}" r="${width * 0.9}"/>`
}

/** Each mod's glyph, given its tile's colour where a glyph cuts through to it. */
export const glyphs = tile => ({
  'bar-context':
    `<rect x="16" y="36" width="64" height="24" rx="8" ${T}/>` +
    [22, 32, 42, 52].map(x => `<rect x="${x}" y="41" width="8" height="14" rx="2.5" ${M}/>`).join(''),
  'bar-git':
    `<path ${stroke()} d="M32 26 V70 M64 32 C64 52 32 46 32 66"/>` +
    [
      [32, 24],
      [32, 72],
      [64, 30],
    ]
      .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="9" ${M}/>`)
      .join(''),
  'bar-limits':
    `<circle cx="48" cy="48" r="24" fill="none" stroke="${INK}" stroke-opacity=".42" stroke-width="11"/>` +
    `<circle cx="48" cy="48" r="24" fill="none" stroke="${INK}" stroke-width="11" stroke-dasharray="112 151" stroke-linecap="round" transform="rotate(-90 48 48)"/>`,
  'bar-path': `<path ${stroke()} d="M18 54 C24 42 32 42 38 50 C44 58 52 58 56 46"/><path ${stroke()} d="M64 72 L78 24"/>`,
  'guard-commit': `${SHIELD}<path ${stroke(7)} d="M30 47 H66"/><circle cx="48" cy="47" r="10" ${M}/>`,
  'guard-edit': `${SHIELD}<path ${stroke(7)} d="M31 46 H45 M38 39 V53 M53 46 H67"/>`,
  'guard-outward': `${SHIELD}<path ${stroke(7)} d="M36 60 L60 36 M43 36 H60 V53"/>`,
  'guard-pnpm':
    `${SHIELD}<path ${M} d="M48 31 L63 39 L48 47 L33 39 Z"/>` +
    `<path ${H} d="M33 39 L48 47 V64 L33 56 Z"/><path ${M} d="M63 39 L48 47 V64 L63 56 Z"/>`,
  'ui-colorify': [
    [37, 38],
    [59, 38],
    [48, 57],
  ]
    .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="17" fill="${INK}" fill-opacity=".5"/>`)
    .join(''),
  'ui-companion':
    `<path ${T} d="M40 38 H76 A6 6 0 0 1 82 44 V64 A6 6 0 0 1 76 70 H72 V80 L62 70 H40 A6 6 0 0 1 34 64 V44 A6 6 0 0 1 40 38 Z"/>` +
    `<path ${M} d="M20 16 H56 A6 6 0 0 1 62 22 V44 A6 6 0 0 1 56 50 H32 L22 60 V50 H20 A6 6 0 0 1 14 44 V22 A6 6 0 0 1 20 16 Z"/>`,
  'ui-declutter':
    [22, 33, 44].map(y => `<rect x="18" y="${y}" width="60" height="6" rx="3" ${T}/>`).join('') +
    `<rect x="18" y="60" width="60" height="16" rx="5" ${M}/>`,
  'ui-linkify':
    `<g transform="rotate(-45 48 48)">` +
    `<rect x="40" y="37" width="40" height="22" rx="11" fill="none" stroke="${INK}" stroke-opacity=".5" stroke-width="9"/>` +
    `<rect x="16" y="37" width="40" height="22" rx="11" fill="none" stroke="${INK}" stroke-width="9"/></g>`,
  'ui-mods':
    `<rect x="16" y="22" width="64" height="22" rx="11" ${T}/><circle cx="69" cy="33" r="8" ${M}/>` +
    `<rect x="16" y="52" width="64" height="22" rx="11" fill="${INK}" fill-opacity=".22"/><circle cx="27" cy="63" r="8" ${H}/>`,
  // The pet as it is seen: a spark, small, at the corner of a window it floats over.
  pet:
    `<rect x="14" y="18" width="58" height="48" rx="7" ${T}/>` +
    `<rect x="14" y="18" width="58" height="11" rx="5" fill="${INK}" fill-opacity=".3"/>` +
    [21, 28, 35].map(x => `<circle cx="${x}" cy="23.5" r="2.2" ${M}/>`).join('') +
    `<rect x="22" y="38" width="34" height="5" rx="2.5" ${T}/><rect x="22" y="49" width="24" height="5" rx="2.5" ${T}/>` +
    // A rim of the tile's colour under the spark parts it from the window.
    `<g fill="${tile}" stroke="${tile}" stroke-width="5" stroke-linejoin="round">${asterisk(70, 67, 15)}</g>` +
    `<g ${M}>${asterisk(70, 67, 15)}</g>`,
  // A session's tab, with its name.
  'session-title':
    `<rect x="14" y="38" width="68" height="42" rx="7" ${T}/>` +
    `<path ${M} d="M14 44 V27 A7 7 0 0 1 21 20 H53 A7 7 0 0 1 60 27 V38 H21 A7 7 0 0 0 14 44 Z"/>` +
    `<rect x="22" y="26.5" width="26" height="6" rx="3" fill="${tile}"/>` +
    `<rect x="24" y="52" width="46" height="5" rx="2.5" fill="${INK}" fill-opacity=".55"/>` +
    `<rect x="24" y="63" width="30" height="5" rx="2.5" fill="${INK}" fill-opacity=".55"/>`,
})

/** The icon of the mod `name`, as an SVG of `size` pixels a side; throws for a mod with no glyph. */
export const svgOf = (name, size = 1024) => {
  const tile = KIND_COLORS[kindOf(name)]
  const glyph = glyphs(tile)[name]

  if (glyph === undefined) {
    throw new Error(`icons: ${name} has no glyph in scripts/icons.mjs`)
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="${size}" height="${size}">` +
    `<rect width="96" height="96" rx="24" fill="${tile}"/>` +
    `<rect x="1" y="1" width="94" height="94" rx="23" fill="none" stroke="#fff" stroke-opacity=".14" stroke-width="2"/>` +
    `${glyph}</svg>`
  )
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { plugins } = JSON.parse(readFileSync('.claude-plugin/marketplace.json', 'utf8'))
  const tmp = mkdtempSync(join(tmpdir(), 'icons-'))

  try {
    for (const { name, source } of plugins) {
      const svg = join(tmp, `${name}.svg`)

      writeFileSync(svg, svgOf(name))
      execFileSync('sips', ['-s', 'format', 'png', svg, '--out', join(source, '.claude-plugin', 'icon.png')], {
        stdio: 'ignore',
      })
      process.stdout.write(`icons: ${name}\n`)
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}
