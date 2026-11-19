import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, RenderSurface } from 'claude-code'

import { stage } from './stage'

// The engine's own prompt beneath: one section.
const engine = (on: On) =>
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'Eres Claude.', scope: 'shared' as const }] }))

// The system prompt composed for a request, drawn on these surfaces.
const composed = async ($: Engine, surfaces: RenderSurface[]) =>
  (
    await $.prompt.compose({
      model: 'claude-opus-5-5',
      promptModel: 'claude-opus-5-5',
      surfaces,
      tools: [],
      outputStyle: null,
      traits: [],
    })
  ).sections

test('the system prompt gains, last, the section that teaches the alerts and asks for few', async ($, on) => {
  const { start } = stage(on)
  engine(on)
  await start($)

  const sections = await composed($, ['terminal'])

  expect(sections.map(section => [section.id, section.scope])).toEqual([
    ['intro', 'shared'],
    ['ui-colorify:alerts', 'session'],
  ])
  expect(sections[1]?.text).toContain('> [!IMPORTANT]')
  expect(sections[1]?.text).toContain('como mucho una')
})

test('no section where no terminal draws the alerts', async ($, on) => {
  const { start } = stage(on)
  engine(on)
  await start($)

  expect((await composed($, ['desktop'])).map(section => section.id)).toEqual(['intro'])
})

test('no section with the mod off', async ($, on) => {
  const { start } = stage(on, { on: false })
  engine(on)
  await start($)

  expect((await composed($, ['terminal'])).map(section => section.id)).toEqual(['intro'])
})
