import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { KIND_COLORS, asterisk, kindOf, svgOf } from './icons.mjs'

test('a mod is of the kind its prefix says, or of none', () => {
  assert.deepEqual(['bar-git', 'guard-edit', 'ui-mods', 'pet', 'session-title', 'barista'].map(kindOf), [
    'bar',
    'guard',
    'ui',
    'none',
    'none',
    'none',
  ])
})

test('every mod of the marketplace has an icon, on the tile of its kind', () => {
  const { plugins } = JSON.parse(readFileSync('.claude-plugin/marketplace.json', 'utf8'))

  for (const { name } of plugins) {
    const svg = svgOf(name)

    assert.match(svg, /^<svg [^>]*viewBox="0 0 96 96" width="1024" height="1024">/, name)
    assert.ok(svg.includes(`fill="${KIND_COLORS[kindOf(name)]}"`), name)

    // An attribute given twice is no XML, which sips refuses though a browser draws it.
    for (const element of svg.match(/<[a-z]+ [^>]*>/g) ?? []) {
      const names = [...element.matchAll(/ ([a-z-]+)="/g)].map(([, attribute]) => attribute)

      assert.equal(new Set(names).size, names.length, `${name}: ${element}`)
    }
  }
})

test('a mod with no glyph is refused, naming it', () => {
  assert.throws(() => svgOf('ui-nothing'), /^Error: icons: ui-nothing has no glyph in scripts\/icons\.mjs$/)
})

test("the pet's icon draws a soft asterisk of eight arms, not the Claude mark the app shows", () => {
  const arms = [...asterisk(50, 50, 20).matchAll(/rotate\((\d+) 50 50\)/g)].map(([, angle]) => Number(angle))

  assert.deepEqual(arms, [0, 45, 90, 135, 180, 225, 270, 315])
  assert.match(asterisk(50, 50, 20), /<rect x="47" y="30" width="6" height="20" rx="3"/)
  assert.equal((svgOf('pet').match(/rotate\(/g) ?? []).length, 16, 'the asterisk and its rim')
})
