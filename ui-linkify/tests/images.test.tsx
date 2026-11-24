import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, PromptEditInput, PromptEditResult } from 'claude-code'

import { jira } from './jira'

// A 160x90 PNG of one color.
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAKAAAABaCAIAAACwpMoFAAAAoklEQVR42u3RAQ0AAAjDsEtDGtKQhg9oMgVrqkeHiwWABViABViABViAAQuwAAuwAAuwAAMWYAEWYAEWYAEWYMACLMACLMACLMCABViABViABViAAQuwAAuwAAuwAAswYAEWYAEWYAEWYMACLMACLMACLMCAXQAswAIswAIswAIMWIAFWIAFWIAFGLAAC7AAC7AAC7AAAxZgARZgARZgAf7VAoGLZO1iB8DyAAAAAElFTkSuQmCC'
const JPEG = '/9j/4AAQSkZJRgABAQAAAQABAAD'

// The conversation as the model reads it: two prompts with pasted images, the second one a JPEG.
const conversation = (on: On) => {
  on('session.messages', () => ({
    value: [
      {
        role: 'user' as const,
        content: [
          { type: 'text', text: 'mira esto [Image #1]' },
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: PNG } },
        ],
      },
      { role: 'assistant' as const, content: [{ type: 'text', text: 'visto' }] },
      {
        role: 'user' as const,
        content: [
          { type: 'text', text: 'y esto [Image #2]' },
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: JPEG } },
        ],
      },
    ],
  }))
}

// The engine's own row, so the mod's tree can be told from it.
const engineRow = (on: On) => {
  on('ui.render', { component: 'UserMessage' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>{e.props.text}</Text>
  })
}

// A prompt's row on the main screen, unless a viewport says otherwise.
const said = (
  $: Engine,
  text: string,
  surface: 'terminal' | 'desktop' | 'vscode' | 'mobile',
  viewport?: { columns: number; rows: number; isFullscreen: boolean },
) =>
  $.ui.mount({
    plugin: 'ui-linkify',
    surface,
    component: 'UserMessage',
    props: { text, origin: { kind: 'composer' }, isExpanded: true },
    ...(viewport && { viewport }),
  })

const FULLSCREEN = { columns: 100, rows: 40, isFullscreen: true }

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

// The conversation as the model reads it, one prompt holding the pictures `[number, png]`.
const holding = (on: On, pictures: readonly (readonly [number, string])[]) => {
  on('session.messages', () => ({
    value: [
      {
        role: 'user' as const,
        content: [
          { type: 'text', text: pictures.map(([n]) => `[Image #${n}]`).join(' ') },
          ...pictures.map(([, data]) => ({ type: 'image', source: { type: 'base64', media_type: 'image/png', data } })),
        ],
      },
    ],
  }))
}

/** What `$.process.run` answers: stdout, whether it was cut, and how it exited. */
const ran = (stdout: string, exitCode = 0, isStdoutTruncated = false) => ({
  value: { exitCode, stdout, stderr: '', isStdoutTruncated, isStderrTruncated: false },
})

const BOX = {
  hasSurvey: false,
  isCollapsed: false,
  isWorking: false,
  maxRows: 12,
  bodyColumns: 100,
  scroll: { offset: 0, bodyRows: 11 },
  view: {},
} as const

// The band above the prompt with `box` typed in it, the engine's own part of it a Text; mounted as its props say.
const bandOf = ($: Engine, on: On, box: string) => {
  on('prompt.read', () => ({ value: { text: box, cursor: box.length } }))
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>band</Text>
  })

  return (props: { bodyColumns?: number; hasSurvey?: boolean } = {}) =>
    $.ui.mount({ plugin: 'ui-linkify', surface: 'terminal', component: 'AbovePrompt', props: { ...BOX, ...props } })
}

test('draws a pasted PNG under its prompt on the terminal, once it is looked up after the first drawing', async ($, on) => {
  const clock = mock.clock(on)
  conversation(on)
  engineRow(on)

  const ui = await said($, 'mira esto [Image #1]', 'terminal')

  // The row is drawn at once, waiting on no lookup.
  expect(await ui.find({ key: 'image-1' })).toBeUndefined()
  await clock.settle()
  const drawn = JSON.stringify(await ui.drawn())

  expect(await ui.find({ key: 'image-1' })).toBeDefined()
  expect(drawn).toContain('"columns":20')
  expect(drawn).toContain('"rows":6')
  expect(drawn).toContain('mira esto [Image #1]')
})

// The pictures and their originals are kept for the session, which the tests of
// this file share: this one names an image no other test does.
test('the [Image #n] of a prompt is a link to its original in the temp folder', async ($, on) => {
  const clock = mock.clock(on)
  conversation(on)
  engineRow(on)
  on('session.id', () => ({ value: 'abc' }))
  on('process.run', () => ({
    value: {
      exitCode: 0,
      stdout: '/tmp/claude-501/-p/abc/images\n7.png\nnotes.txt\n',
      stderr: '',
      isStdoutTruncated: false,
      isStderrTruncated: false,
    },
  }))
  on('fs.read', () => ({ value: { base64: PNG } }))

  const ui = await said($, 'la de antes [Image #7] y ya', 'terminal')
  await clock.settle()
  const links = await ui.findAll({ type: 'Link' })

  expect(links.map(link => [link.children, link.props.href])).toEqual([
    [['[Image #7]'], 'file:///tmp/claude-501/-p/abc/images/7.png'],
  ])
  expect(await ui.find({ type: 'Text', text: /^la de antes .*\[Image #7\] y ya$/ })).toBeDefined()
  expect(await ui.find({ key: 'image-7' })).toBeDefined()
})

test('the links of a prompt, tickets and images, are laid in the order of its text', async ($, on) => {
  const begin = jira(on)
  const clock = mock.clock(on)
  conversation(on)
  engineRow(on)
  on('session.id', () => ({ value: 'abc' }))
  on('process.run', () => ({
    value: {
      exitCode: 0,
      stdout: '/tmp/claude-501/-p/abc/images\n11.png\n',
      stderr: '',
      isStdoutTruncated: false,
      isStderrTruncated: false,
    },
  }))
  on('fs.read', () => ({ value: { base64: PNG } }))
  await begin($)

  const ui = await said($, '[Image #11] y ABC-1 sigue', 'terminal')
  await clock.settle()
  const links = await ui.findAll({ type: 'Link' })

  expect(links.map(link => [link.children, link.props.href])).toEqual([
    [['[Image #11]'], 'file:///tmp/claude-501/-p/abc/images/11.png'],
    [['ABC-1'], 'https://example.atlassian.net/browse/ABC-1'],
  ])
  // The marker, the text between the links once, and what follows the last.
  expect(await ui.find({ type: 'Text', text: '> ' })).toBeDefined()

  // Each link's text follows its address in the text of the row.
  expect(
    await ui.find({
      type: 'Text',
      text: 'file:///tmp/claude-501/-p/abc/images/11.png[Image #11] y https://example.atlassian.net/browse/ABC-1ABC-1 sigue',
    }),
  ).toBeDefined()
  await ui.unmount()
})

test('a press on the button under the picture sends it again, in other bytes each time', async ($, on) => {
  const sent: string[] = []
  const clock = mock.clock(on)
  conversation(on)
  engineRow(on)
  on('ui.blit', ($, e) => ('source' in e && 'png' in e.source && sent.push(e.source.png), { value: {} }))

  const ui = await said($, 'mira esto [Image #1]', 'terminal')
  await clock.settle()

  await ui.press({ key: 'resend-1' })
  await ui.press({ key: 'resend-1' })
  const [marked, again] = sent

  expect(sent).toHaveLength(2)

  if (marked === undefined) {
    throw new Error('the first press sent nothing')
  }

  // The same PNG with an empty `reSd` chunk before its IEND.
  expect(atob(marked)).toBe(atob(PNG).slice(0, -12) + '\x00\x00\x00\x00reSd\x75\x27\x15\x16' + atob(PNG).slice(-12))
  expect(again).toBe(PNG)
})

test('leaves the row alone without a PNG, and off the terminal', async ($, on) => {
  const clock = mock.clock(on)
  conversation(on)
  engineRow(on)

  for (const [text, surface] of [
    ['y esto [Image #2]', 'terminal'],
    ['sin imagen', 'terminal'],
    ['mira esto [Image #1]', 'desktop'],
    ['mira esto [Image #1]', 'mobile'],
  ] as const) {
    const ui = await said($, text, surface)

    await clock.settle()
    expect(JSON.stringify(await ui.drawn()), `${surface}: ${text}`).not.toContain('image-')
    await ui.unmount()
  }
})

test('reads an image a compaction took out of memory from the transcript file', async ($, on) => {
  const runs: (readonly string[])[] = []
  const clock = mock.clock(on)
  conversation(on)
  engineRow(on)
  on('session.id', () => ({ value: 'abc' }))
  on('session.info', () => ({ value: { transcriptPath: '/Users/me/.claude/projects/-repo/abc.jsonl' } }))
  on('process.run', ($, e) => {
    runs.push(e.argv)

    const stdout = `3 image/png ${PNG}\n`

    return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })

  const ui = await said($, 'antes de compactar [Image #3]', 'terminal')
  await clock.settle()

  expect(await ui.find({ key: 'image-3' })).toBeDefined()
  // The temp folder, which holds no file of it, then the transcript.
  expect(runs).toHaveLength(2)
  expect(runs[1]?.[0]).toBe('sh')
  expect(runs[1]?.[1]?.endsWith('/ui-linkify/scripts/transcript.sh')).toBe(true)
  expect(runs[1]?.slice(2)).toEqual(['[3]', '/Users/me/.claude/projects/-repo/abc.jsonl'])

  // Drawn again, as on a scroll: no second read.
  await ui.unmount()
  await said($, 'antes de compactar [Image #3]', 'terminal')
  await clock.settle()
  expect(runs).toHaveLength(2)
})

test('an image neither its files nor the transcript can give is left out, and why is in the debug log', async ($, on) => {
  const logged: { text: string; to: string }[] = []
  const clock = mock.clock(on)
  conversation(on)
  engineRow(on)
  on('session.id', () => ({ value: 'abc' }))
  on('session.info', () => ({ value: { transcriptPath: '/Users/me/.claude/projects/-repo/abc.jsonl' } }))
  on('ui.log', (_, e) => (logged.push(e), { value: undefined }))
  on('process.run', () => ({ deny: 'no shell' }))

  const ui = await said($, 'antes de compactar [Image #4]', 'terminal')
  await clock.settle()

  expect(await ui.find({ key: 'image-4' })).toBeUndefined()
  // The settings, loaded on the clock too, fail here for want of a store.
  expect(logged.filter(entry => entry.text.includes('no shell'))).toEqual([
    { text: 'reading the pasted files failed: ui-linkify: $.process.run: no shell', to: 'debug' },
    { text: 'reading the transcript failed: ui-linkify: $.process.run: no shell', to: 'debug' },
  ])
})

test('a session that keeps no transcript on this machine has none read', async ($, on) => {
  const runs: (readonly string[])[] = []
  const clock = mock.clock(on)
  conversation(on)
  engineRow(on)
  on('session.id', () => ({ value: 'abc' }))
  on('session.info', () => ({ value: { transcriptPath: '' } }))
  on('process.run', (_, e) => (runs.push(e.argv), ran('')))

  const ui = await said($, 'antes de compactar [Image #5]', 'terminal')
  await clock.settle()

  expect(await ui.find({ key: 'image-5' })).toBeUndefined()
  // Only the temp folder was looked at.
  expect(runs.filter(argv => argv.join(' ').includes('transcript.sh'))).toEqual([])
  expect(runs).toHaveLength(1)
})

test('draws a prompt drawn before its message was kept once it is', async ($, on) => {
  const clock = mock.clock(on)
  on('session.messages', () => ({ value: [] }))
  engineRow(on)

  const ui = await said($, 'recién pegada [Image #8]', 'terminal')
  await clock.settle()
  expect(await ui.find({ key: 'image-8' })).toBeUndefined()

  await $.session.append({
    door: 'prompt',
    origin: { kind: 'composer' },
    uuid: 'prompt-8',
    message: {
      type: 'user',
      role: 'user',
      content: [
        { type: 'text', text: 'recién pegada [Image #8]' },
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: PNG } },
      ],
    },
  })

  expect(await ui.find({ key: 'image-8' })).toBeDefined()
})

test('draws a large picture as a thumbnail the size of its box', async ($, on) => {
  // A 1600x900 PNG as far as its header goes: never drawn, only measured.
  const header = [137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 6, 64, 0, 0, 3, 132]
  const large = btoa(String.fromCharCode(...header))
  const runs: (readonly string[])[] = []
  const clock = mock.clock(on)
  on('session.messages', () => ({
    value: [
      {
        role: 'user' as const,
        content: [
          { type: 'text', text: 'grande [Image #9]' },
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: large } },
        ],
      },
    ],
  }))
  engineRow(on)
  on('process.run', ($, e) => {
    runs.push(e.argv)

    return {
      value: { exitCode: 0, stdout: `${PNG}\n`, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
    }
  })

  const ui = await said($, 'grande [Image #9]', 'terminal')
  await clock.settle()

  expect(JSON.stringify(await ui.drawn())).toContain(PNG)
  // Its box is 71 columns by 20 rows, 568x320 at 8 pixels a column and 16 a
  // row; scaled down further to hold 640x192 pixels at most.
  expect(runs[0]?.slice(-2)).toEqual(['263', '467'])

  await ui.unmount()
  await said($, 'grande [Image #9]', 'terminal')
  await clock.settle()
  expect(runs).toHaveLength(1)
})

test('draws an image pasted into the box above it, from its file, till it leaves the box', async ($, on) => {
  const runs: (readonly string[])[] = []
  const reads: string[] = []
  const clock = mock.clock(on)
  let box = 'mira [Image #5]'
  on('prompt.read', () => ({ value: { text: box, cursor: box.length } }))
  on('session.messages', () => ({ value: [] }))
  on('session.id', () => ({ value: 'abc' }))
  on('process.run', ($, e) => {
    runs.push(e.argv)

    return {
      value: {
        exitCode: 0,
        stdout: '/tmp/claude-501/-p/abc/images\n5.png\n',
        stderr: '',
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    }
  })
  on('fs.read', ($, e) => (reads.push(e.path), { value: { base64: PNG } }))
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>band</Text>
  })

  const band = () =>
    $.ui.mount({
      plugin: 'ui-linkify',
      surface: 'terminal',
      component: 'AbovePrompt',
      props: {
        hasSurvey: false,
        isCollapsed: false,
        isWorking: false,
        maxRows: 12,
        bodyColumns: 100,
        scroll: { offset: 0, bodyRows: 11 },
        view: {},
      },
    })

  const ui = await band()
  await clock.settle()

  expect(await ui.find({ key: 'draft-image-5' })).toBeDefined()
  expect(runs[0]).toContain('abc')
  expect(reads).toEqual(['/tmp/claude-501/-p/abc/images/5.png'])

  await ui.unmount()
  box = ''
  expect(await (await band()).find({ key: 'draft-image-5' })).toBeUndefined()
})

test('draws an image pasted into the box whose file is written seconds after, as a large screenshot is', async ($, on) => {
  const clock = mock.clock(on)
  const box = 'grande [Image #10]'
  let looks = 0
  on('prompt.read', () => ({ value: { text: box, cursor: box.length } }))
  on('session.messages', () => ({ value: [] }))
  on('session.id', () => ({ value: 'abc' }))
  // The file is there from the 25th look on, 5 s after the paste.
  on('process.run', () => ({
    value: {
      exitCode: 0,
      stdout: `/tmp/claude-501/-p/abc/images\n${++looks >= 25 ? '10.png\n' : ''}`,
      stderr: '',
      isStdoutTruncated: false,
      isStderrTruncated: false,
    },
  }))
  on('fs.read', () => ({ value: { base64: PNG } }))

  const ui = await $.ui.mount({
    plugin: 'ui-linkify',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: {
      hasSurvey: false,
      isCollapsed: false,
      isWorking: false,
      maxRows: 12,
      bodyColumns: 100,
      scroll: { offset: 0, bodyRows: 11 },
      view: {},
    },
  })
  // The files are looked at every 200 ms: not found yet at 4 s, found by 5 s.
  await clock.advance(4000)
  expect(await ui.find({ key: 'draft-image-10' })).toBeUndefined()
  await clock.advance(1000)

  expect(await ui.find({ key: 'draft-image-10' })).toBeDefined()
})

test('leaves the row alone where the terminal draws no pictures', async ($, on) => {
  const clock = mock.clock(on)
  conversation(on)
  engineRow(on)
  on('ui.blit', () => ({ deny: 'the Image draws its alt here: the terminal draws no placeholder images (test)' }))

  const ui = await said($, 'mira esto [Image #1]', 'terminal')
  await clock.settle()
  expect(await ui.find({ key: 'image-1' })).toBeDefined()

  await clock.advance(200)
  expect(await ui.find({ key: 'image-1' })).toBeUndefined()
})

test('under the fullscreen layout a message draws its pictures under its row, in the flow', async ($, on) => {
  const clock = mock.clock(on)
  conversation(on)
  engineRow(on)

  const ui = await said($, 'mira esto [Image #1]', 'terminal', FULLSCREEN)
  await clock.settle()
  const drawn = JSON.stringify(await ui.drawn())

  expect(await ui.find({ key: 'image-1' })).toBeDefined()
  expect(drawn).not.toContain('"position":"absolute","top":0')
  expect(drawn).not.toContain('"display":"none"')
})

test('under the fullscreen layout the box draws its pictures beside the band, in half its rows', async ($, on) => {
  const clock = mock.clock(on)
  const box = 'mira [Image #1]'
  conversation(on)
  on('prompt.read', () => ({ value: { text: box, cursor: box.length } }))
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>band</Text>
  })

  const ui = await $.ui.mount({
    plugin: 'ui-linkify',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: {
      hasSurvey: false,
      isCollapsed: false,
      isWorking: false,
      maxRows: 12,
      bodyColumns: 100,
      scroll: { offset: 0, bodyRows: 11 },
      view: {},
    },
    viewport: FULLSCREEN,
  })
  await clock.settle()

  expect(await ui.find({ type: 'Text', text: 'band' })).toBeDefined()
  // Half the band's 12 rows less the border's 2: 4 rows, and 14 columns for its 16:9.
  expect(JSON.stringify(await ui.find({ key: 'draft-image-1' }))).toMatch(/"columns":14,"rows":4/)
})

test('the first key typed after a pause sends every picture drawn again, one at a time, as a terminal may have dropped them', async ($, on) => {
  const sent: string[] = []
  // A clock long past the pause: the first key typed is no return from one.
  const clock = mock.clock(on, { now: 1_700_000_000_000 })
  conversation(on)
  engineRow(on)
  on('ui.blit', ($, e) => ('key' in e && sent.push(e.key), { value: {} }))
  on('prompt.edit', ($, e) => ({ text: e.text + e.inputText, cursor: e.cursor + e.inputText.length }))

  // Two rows naming the same picture: two Images to send.
  await said($, 'mira esto [Image #1]', 'terminal')
  await said($, 'otra vez [Image #1]', 'terminal')
  await clock.settle()
  // The blit that asks whether the terminal draws pictures, 200 ms after the first.
  await clock.advance(200)
  sent.length = 0
  // A key typed, as the kit raises it: its typings list on `$.prompt` only the
  // calls a plugin's own `$` makes.
  const edit = () =>
    ($.prompt as unknown as { edit: (e: PromptEditInput) => Promise<PromptEditResult> }).edit({
      origin: { kind: 'composer' },
      text: '',
      cursor: 0,
      start: 0,
      end: 0,
      inputText: 'a',
    })

  await edit()
  await clock.settle()
  await clock.advance(1000)
  await edit()
  await clock.settle()
  expect(sent).toEqual([])

  await clock.advance(5000)
  await edit()
  await clock.settle()
  expect(sent).toEqual(['image-1'])

  await clock.advance(50)
  expect(sent).toEqual(['image-1', 'image-1'])
})

test('a window that loses the focus and gets it back sends every picture drawn again, and the first key after a pause no longer does', async ($, on) => {
  const sent: string[] = []
  const clock = mock.clock(on, { now: 1_700_000_000_000 })
  conversation(on)
  engineRow(on)
  on('ui.blit', ($, e) => ('key' in e && sent.push(e.key), { value: {} }))
  on('prompt.edit', ($, e) => ({ text: e.text + e.inputText, cursor: e.cursor + e.inputText.length }))
  on('prompt.read', () => ({ value: { text: '', cursor: 0 } }))
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => $.ui.resolve(e).Text({ children: 'band' }))

  await said($, 'mira esto [Image #1]', 'terminal')
  await said($, 'otra vez [Image #1]', 'terminal')

  const band = await $.ui.mount({
    plugin: 'ui-linkify',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: BOX,
  })

  await clock.settle()
  await clock.advance(200)
  sent.length = 0

  const edit = () =>
    ($.prompt as unknown as { edit: (e: PromptEditInput) => Promise<PromptEditResult> }).edit({
      origin: { kind: 'composer' },
      text: '',
      cursor: 0,
      start: 0,
      end: 0,
      inputText: 'a',
    })

  // Focused to begin with: nothing is a return.
  await clock.advance(10_000)
  await clock.settle()
  expect(sent).toEqual([])

  await band.setWindowFocused(false)
  await clock.settle()
  expect(sent).toEqual([])

  await band.setWindowFocused(true)
  await clock.settle()
  expect(sent).toEqual(['image-1'])

  await clock.advance(50)
  expect(sent).toEqual(['image-1', 'image-1'])

  // The terminal has shown it reports the focus: a key after a pause says nothing.
  sent.length = 0
  await edit()
  await clock.advance(10_000)
  await edit()
  await clock.settle()
  await clock.advance(50)
  expect(sent).toEqual([])
})

test('the watcher of the window’s focus is of no size and on the terminal alone', async ($, on) => {
  const clock = mock.clock(on)
  on('prompt.read', () => ({ value: { text: '', cursor: 0 } }))
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => $.ui.resolve(e).Text({ children: 'band' }))

  const band = (surface: 'terminal' | 'desktop') =>
    $.ui.mount({ plugin: 'ui-linkify', surface, component: 'AbovePrompt', props: BOX })

  const terminal = await band('terminal')

  await clock.settle()
  expect(JSON.stringify(await terminal.drawn())).toMatch(/"key":"window-focus"[^}]*"width":0,"height":0/)
  await terminal.unmount()

  const desktop = await band('desktop')

  await clock.settle()
  expect(JSON.stringify(await desktop.drawn())).not.toContain('window-focus')
})

test('with the pictures under a prompt and the box’s both turned off, nothing watches the window', async ($, on) => {
  const clock = mock.clock(on)
  const begin = jira(on, { images: false, draft: false })
  on('prompt.read', () => ({ value: { text: '', cursor: 0 } }))
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => $.ui.resolve(e).Text({ children: 'band' }))
  await begin($)

  const ui = await $.ui.mount({ plugin: 'ui-linkify', surface: 'terminal', component: 'AbovePrompt', props: BOX })

  await clock.settle()
  expect(JSON.stringify(await ui.drawn())).not.toContain('window-focus')
})

test('a picture whose file was not there is looked up again a while later, by a row that looks once', async ($, on) => {
  const clock = mock.clock(on)
  let listing = ''
  on('session.messages', () => ({ value: [] }))
  engineRow(on)
  on('session.id', () => ({ value: 'abc' }))
  on('process.run', () => ({
    value: {
      exitCode: 0,
      stdout: `/tmp/claude-501/-p/abc/images\n${listing}`,
      stderr: '',
      isStdoutTruncated: false,
      isStderrTruncated: false,
    },
  }))
  on('fs.read', () => ({ value: { base64: PNG } }))

  const ui = await said($, 'tarde [Image #11]', 'terminal')
  await clock.settle()
  expect(await ui.find({ key: 'image-11' })).toBeUndefined()

  // Written since, but a miss stands for a while: no look at the files yet.
  listing = '11.png\n'
  await ui.unmount()
  const soon = await said($, 'tarde [Image #11]', 'terminal')
  await clock.settle()
  expect(await soon.find({ key: 'image-11' })).toBeUndefined()

  await clock.advance(5000)
  await soon.unmount()
  const again = await said($, 'tarde [Image #11]', 'terminal')
  await clock.settle()
  expect(await again.find({ key: 'image-11' })).toBeDefined()
})

test('a conversation that cannot be read is looked up once, not drawn again for ever', async ($, on) => {
  const clock = mock.clock(on)
  let reads = 0
  on('session.messages', () => (reads++, { deny: 'sin conversación' }))
  engineRow(on)
  on('process.run', () => ({ deny: 'no shell' }))

  const ui = await said($, 'sin conversación [Image #12]', 'terminal')
  await clock.settle()
  await clock.advance(1000)
  await clock.settle()

  expect(reads).toBe(1)
  expect(await ui.find({ key: 'image-12' })).toBeUndefined()
})

test('a new session, after /clear or a resume, numbers its images again: what was kept of the last is forgotten', async ($, on) => {
  const clock = mock.clock(on)
  let reads = 0
  mock.store(on)
  mock.env(on, { HOME: '/Users/me' })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.end', (_, e) => ({ sessionId: e.sessionId }))
  on('session.messages', () => {
    reads++

    return {
      value: [
        {
          role: 'user' as const,
          content: [
            { type: 'text', text: 'otra [Image #13]' },
            { type: 'image', source: { type: 'base64', media_type: 'image/png', data: PNG } },
          ],
        },
      ],
    }
  })
  engineRow(on)
  on('session.id', () => ({ value: 'abc' }))
  on('process.run', () => ({
    value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  }))

  const draw = async () => {
    const ui = await said($, 'otra [Image #13]', 'terminal')
    await clock.settle()
    await ui.unmount()
  }

  await draw()
  await draw()
  expect(reads).toBe(1)

  await $.session.end({ reason: 'clear', sessionId: 'abc', resume: { id: 'abc' } } as never)
  await draw()
  expect(reads).toBe(2)

  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await draw()
  expect(reads).toBe(3)
})

test('a file or an image that is no PNG, or one a message that is no prompt holds, is not drawn', async ($, on) => {
  const clock = mock.clock(on)
  on('session.id', () => ({ value: 'abc' }))
  on('session.messages', () => ({
    value: [
      {
        role: 'assistant' as const,
        content: [
          { type: 'text', text: '[Image #31]' },
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: PNG } },
        ],
      },
      {
        role: 'user' as const,
        content: [
          { type: 'text', text: '[Image #32]' },
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: PNG } },
        ],
      },
    ],
  }))
  on('process.run', () => ran('/tmp/claude-501/-p/abc/images\n33.png\n'))
  on('fs.read', () => ({ value: { base64: JPEG } }))
  engineRow(on)

  const ui = await said($, '[Image #31] [Image #32] [Image #33]', 'terminal')

  await clock.settle()
  expect(JSON.stringify(await ui.drawn())).not.toContain('image-')
})

test('a picture already kept is not replaced by another of its number', async ($, on) => {
  const clock = mock.clock(on)
  on('session.messages', () => ({ value: [] }))
  engineRow(on)

  const ui = await said($, 'mira [Image #34]', 'terminal')
  const append = (data: string) =>
    $.session.append({
      door: 'prompt',
      origin: { kind: 'composer' },
      uuid: `prompt-34-${data.length}`,
      message: {
        type: 'user',
        role: 'user',
        content: [
          { type: 'text', text: 'mira [Image #34]' },
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data } },
        ],
      },
    })

  await clock.settle()
  await append(PNG)
  await append(pngOf(1600, 900))
  expect(JSON.stringify(await ui.drawn())).toContain('"columns":20')
})

test('the transcript gives no image where its read fails, nor from the line it cut short', async ($, on) => {
  const clock = mock.clock(on)
  let transcript = ran('')
  on('session.messages', () => ({ value: [] }))
  engineRow(on)
  on('session.id', () => ({ value: 'abc' }))
  on('session.info', () => ({ value: { transcriptPath: '/Users/me/.claude/projects/-repo/abc.jsonl' } }))
  on('process.run', (_, e) => (e.argv.join(' ').includes('transcript.sh') ? transcript : ran('')))

  transcript = ran(`35 image/png ${PNG}\n`, 1)

  const failed = await said($, '[Image #35]', 'terminal')

  await clock.settle()
  expect(await failed.find({ key: 'image-35' })).toBeUndefined()

  // Two images, the output cut inside the second.
  transcript = ran(`36 image/png ${PNG}\n37 image/png ${PNG.slice(0, 40)}`, 0, true)

  const cut = await said($, '[Image #36] [Image #37]', 'terminal')

  await clock.settle()
  expect(await cut.find({ key: 'image-36' })).toBeDefined()
  expect(await cut.find({ key: 'image-37' })).toBeUndefined()
})

test('the original of an image the conversation holds is linked all the same, and one not found is looked for again after a while', async ($, on) => {
  const clock = mock.clock(on)
  let listing = '41.png\n'
  holding(on, [
    [41, PNG],
    [42, PNG],
  ])
  engineRow(on)
  on('session.id', () => ({ value: 'abc' }))
  on('process.run', () => ran(`/tmp/claude-501/-p/abc/images\n${listing}`))

  const ui = await said($, '[Image #41]', 'terminal')

  await clock.settle()
  expect((await ui.findAll({ type: 'Link' })).map(link => link.props.href)).toEqual([
    'file:///tmp/claude-501/-p/abc/images/41.png',
  ])

  // The picture is known, its original is not there yet: written a moment after.
  listing = ''

  const late = await said($, '[Image #42]', 'terminal')

  await clock.settle()
  expect(await late.findAll({ type: 'Link' })).toHaveLength(0)
  listing = '42.png\n'
  await clock.advance(5000)
  await late.redraw()
  await clock.settle()
  expect((await late.findAll({ type: 'Link' })).map(link => link.props.href)).toEqual([
    'file:///tmp/claude-501/-p/abc/images/42.png',
  ])
})

test('a wide picture is scaled to what its columns hold', async ($, on) => {
  const runs: (readonly string[])[] = []
  const clock = mock.clock(on)
  holding(on, [[43, pngOf(2000, 130)]])
  engineRow(on)
  on('process.run', ($, e) => (runs.push(e.argv), ran(`${PNG}\n`)))

  await said($, '[Image #43]', 'terminal')
  await clock.settle()
  // 80 columns by 3 rows at 8 pixels a column: 640 pixels wide, 42 high.
  expect(runs[0]?.slice(-2)).toEqual(['42', '640'])
})

test('a picture under a prompt is drawn no wider than the settings allow', async ($, on) => {
  const clock = mock.clock(on)
  const begin = jira(on, { columns: 10 })
  holding(on, [[72, PNG]])
  engineRow(on)
  await begin($)

  const ui = await said($, '[Image #72]', 'terminal')

  await clock.settle()
  expect(JSON.stringify(await ui.find({ key: 'image-72' }))).toMatch(/"columns":10,"rows":3/)
})

test('a picture is drawn under a prompt on the terminal alone', async ($, on) => {
  const clock = mock.clock(on)
  holding(on, [[73, PNG]])
  engineRow(on)

  for (const surface of ['desktop', 'vscode', 'mobile'] as const) {
    const ui = await said($, '[Image #73]', surface)

    await clock.settle()
    expect(JSON.stringify(await ui.drawn()), surface).not.toContain('frame-73')
    await ui.unmount()
  }

  const ui = await said($, '[Image #73]', 'terminal')

  await clock.settle()
  expect(JSON.stringify(await ui.drawn())).toContain('frame-73')
})

test('a picture that cannot be scaled is drawn at full size', async ($, on) => {
  const large = pngOf(1600, 900)
  const clock = mock.clock(on)
  holding(on, [[44, large]])
  engineRow(on)
  // sips fails, though it printed what looks like a PNG.
  on('process.run', () => ran(`${PNG}\n`, 1))

  const ui = await said($, '[Image #44]', 'terminal')

  await clock.settle()

  const drawn = JSON.stringify(await ui.drawn())

  expect(await ui.find({ key: 'image-44' })).toBeDefined()
  expect(drawn).toContain(large)
  expect(drawn).not.toContain(PNG)
})

// What a new session forgets of the last: its originals, the ones sent marked, the box's tokens.
test('a new session forgets the originals, the marks and the box’s tokens of the last', async ($, on) => {
  const sent: string[] = []
  let invalidated = 0
  let listing = '46.png\n'
  const clock = mock.clock(on, { now: 1_700_000_000_000 })
  holding(on, [[46, PNG]])
  engineRow(on)
  on('session.id', () => ({ value: 'abc' }))
  on('session.end', (_, e) => ({ sessionId: e.sessionId }))
  on('process.run', () => ran(`/tmp/claude-501/-p/abc/images\n${listing}`))
  on('fs.read', () => ({ value: { base64: PNG } }))
  on('ui.blit', (_, e) => ('source' in e && 'png' in e.source && sent.push(e.source.png), { value: {} }))
  on('ui.invalidate', (_, e, next) => {
    invalidated++

    return next(e)
  })
  on('prompt.edit', ($, e) => ({ text: '[Image #47]', cursor: e.cursor + e.inputText.length }))

  const edit = () =>
    ($.prompt as unknown as { edit: (e: PromptEditInput) => Promise<PromptEditResult> }).edit({
      origin: { kind: 'composer' },
      text: '',
      cursor: 0,
      start: 0,
      end: 0,
      inputText: 'a',
    })
  const end = () => $.session.end({ reason: 'clear', sessionId: 'abc', resume: { id: 'abc' } } as never)

  const ui = await said($, '[Image #46]', 'terminal')

  await clock.settle()
  await clock.advance(200)
  expect(await ui.findAll({ type: 'Link' })).toHaveLength(1)

  // The box's tokens: the same ones are news again to a new session.
  await edit()
  const before = invalidated

  await edit()
  expect(invalidated).toBe(before)
  await end()
  await edit()
  expect(invalidated).toBeGreaterThan(before)

  // No original to link.
  listing = ''
  await ui.redraw()
  await clock.settle()
  expect(await ui.findAll({ type: 'Link' })).toHaveLength(0)

  // A picture sent marked, then the session ends: the button, still there, sends it marked again.
  sent.length = 0
  await ui.press({ key: 'resend-46' })
  await end()
  await ui.press({ key: 'resend-46' })
  expect(sent).toHaveLength(2)
  expect(sent[1]).toBe(sent[0])
  expect(sent[0]).not.toBe(PNG)
})

test('the box draws the band again when its tokens change, as a key is typed or the draft is changed', async ($, on) => {
  let invalidated = 0
  let box = ''
  mock.clock(on)
  on('prompt.change', (_, e) => ({ text: e.text, cursor: e.cursor }))
  on('ui.invalidate', (_, e, next) => {
    invalidated++

    return next(e)
  })
  on('prompt.edit', ($, e) => ({ text: box, cursor: e.cursor + e.inputText.length }))

  const edit = () =>
    ($.prompt as unknown as { edit: (e: PromptEditInput) => Promise<PromptEditResult> }).edit({
      origin: { kind: 'composer' },
      text: '',
      cursor: 0,
      start: 0,
      end: 0,
      inputText: 'a',
    })
  const change = (text: string) =>
    ($.prompt as unknown as { change: (e: unknown) => Promise<unknown> }).change({
      text,
      cursor: text.length,
      origin: { kind: 'composer' },
    })

  box = '[Image #48]'
  await edit()
  expect(invalidated).toBe(1)
  await edit()
  expect(invalidated).toBe(1)
  await change('[Image #48] [Image #49]')
  expect(invalidated).toBe(2)
  await change('[Image #48] [Image #49]')
  expect(invalidated).toBe(2)
})

test('the images switch in the pane turns the pictures under a prompt off', async ($, on) => {
  const clock = mock.clock(on)
  const begin = jira(on, { images: false })
  holding(on, [[50, PNG]])
  engineRow(on)
  await begin($)

  const row = await said($, '[Image #50]', 'terminal')

  await clock.settle()
  expect(await row.find({ key: 'image-50' })).toBeUndefined()
})

test('a picture is drawn no wider than the settings allow', async ($, on) => {
  const clock = mock.clock(on)
  const begin = jira(on, { columns: 10 })
  holding(on, [[51, PNG]])
  const mount = bandOf($, on, '[Image #51]')
  await begin($)

  const ui = await mount()

  await clock.settle()
  expect(JSON.stringify(await ui.find({ key: 'draft-image-51' }))).toMatch(/"columns":10,"rows":3/)
})

test('two pictures in the box share its width', async ($, on) => {
  const clock = mock.clock(on)
  holding(on, [
    [53, PNG],
    [54, PNG],
  ])

  const ui = await bandOf($, on, '[Image #53] [Image #54]')({ bodyColumns: 40 })

  await clock.settle()
  // 40 columns between two, less the border and the gap.
  expect(JSON.stringify(await ui.find({ key: 'draft-image-53' }))).toMatch(/"columns":17,"rows":5/)
  expect(JSON.stringify(await ui.find({ key: 'draft-image-54' }))).toMatch(/"columns":17,"rows":5/)
})

test('a survey up keeps the band free of the pictures', async ($, on) => {
  const clock = mock.clock(on)
  holding(on, [[55, PNG]])

  const ui = await bandOf($, on, '[Image #55]')({ hasSurvey: true })

  await clock.settle()
  expect(await ui.find({ key: 'draft-image-55' })).toBeUndefined()
})

test('the button under a picture is there while the pane says so', async ($, on) => {
  const clock = mock.clock(on)
  const begin = jira(on, { resend: false })
  holding(on, [[56, PNG]])
  engineRow(on)
  await begin($)

  const ui = await said($, '[Image #56]', 'terminal')

  await clock.settle()
  expect(await ui.find({ key: 'image-56' })).toBeDefined()
  expect(await ui.find({ key: 'resend-56' })).toBeUndefined()
})

test('the message of a subagent holds no pasted image of the person', async ($, on) => {
  const clock = mock.clock(on)
  on('session.messages', () => ({ value: [] }))
  engineRow(on)

  const ui = await said($, 'mira [Image #57]', 'terminal')

  await clock.settle()
  await $.session.append({
    door: 'prompt',
    origin: { kind: 'composer' },
    agentId: 'sub',
    uuid: 'prompt-57',
    message: {
      type: 'user',
      role: 'user',
      content: [
        { type: 'text', text: 'mira [Image #57]' },
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: PNG } },
      ],
    },
  })
  expect(await ui.find({ key: 'image-57' })).toBeUndefined()
})

test('the draft switch in the pane turns the box’s pictures off', async ($, on) => {
  const clock = mock.clock(on)
  const begin = jira(on, { draft: false })
  holding(on, [[58, PNG]])

  const mount = bandOf($, on, '[Image #58]')
  await begin($)

  const ui = await mount()

  await clock.settle()
  expect(await ui.find({ key: 'draft-image-58' })).toBeUndefined()
})
