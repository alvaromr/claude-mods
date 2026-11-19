import { expect, mock, test } from 'claude-code/testing'

// Alone in its file: what the start finds of jq holds for the rest of the module's life.
test('a jq check that cannot run leaves every row to the engine, saying why under the prompt', async ($, on) => {
  const clock = mock.clock(on)
  const lines: (string | undefined)[] = []
  mock.store(on)
  on('session.cwd', () => ({ value: '/repo' }))
  on('ui.status', (_, e) => (lines.push(e.text), { value: undefined }))
  on('process.run', () => ({ deny: 'no shell' }))
  on('ui.render', { component: 'SessionMode' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  const ui = await $.ui.mount({
    plugin: 'ui-declutter',
    surface: 'terminal',
    component: 'SessionMode',
    props: { modes: [] },
  })

  await clock.settle()
  expect(lines).toEqual([
    'declutter no pudo comprobar si hay jq (ui-declutter: $.process.run: no shell): Claude Code dibuja las herramientas como siempre',
  ])
  expect((await ui.find({ type: 'Text', text: '○' }))?.props.color).toBe('inactive')
})
