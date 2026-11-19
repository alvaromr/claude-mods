import type { EngineInterface, Register } from 'claude-code'

import type { Preferences } from '../types'
import { registerCommands } from './commands'
import { forgetImages, imageLinks, registerImages } from './images'
import { registerJira, ticketLinks } from './jira'
import { registerPaths } from './paths'
import { COLUMNS, ROWS } from './pictures'
import { countOf, DEFAULTS, isActive, isRefused, KEYS, SITE } from './preferences'
import { cutAtLinks } from './prompt-links'
import { change, forgetProject, provenance, save, shown, start } from './settings'
import { slotted } from './slots'
import { TEXT } from './text'

const PANE = 'linkify'

type Flag = { [K in keyof Preferences]: Preferences[K] extends boolean ? K : never }[keyof Preferences]
type Count = { [K in keyof Preferences]: Preferences[K] extends number ? K : never }[keyof Preferences]

// The panel away when it is up, back when it is not.
const togglePane = async ($: EngineInterface) => {
  if ((await $.ui.panes()).some(pane => pane.id === PANE)) {
    await $.ui.close({ id: PANE })

    return
  }

  await $.ui.open({ id: PANE, title: TEXT.title })
}

// The button, fourth in the first slot row, after the mods', the companion's
// and declutter's: in the terminal, of the prompt's footer; in the desktop app,
// whose footer is one short line, of the band above the prompt. As the
// companion's, its dot is green while some part links or draws, gray while none does.
const drawn = (
  $: EngineInterface,
  s: Preferences,
  { Box, Button, Text }: Pick<ReturnType<EngineInterface['ui']['resolve']>, 'Box' | 'Button' | 'Text'>,
) => {
  const isOn = isActive(s)

  return (
    <Box key="slot:1.4:ui-linkify">
      <Button key="linkify" plain dimColor onPress={() => void togglePane($)}>
        <Text color={isOn ? 'success' : 'inactive'}>{isOn ? '●' : '○'}</Text> linkify
      </Button>
    </Box>
  )
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    forgetImages()
    await start($)

    return next(e)
  })

  // The images first: a prompt's row is drawn with its links beneath, and its
  // images added under it. The commands before the paths and tickets: a
  // message is cut at its commands as written, and each part around them is
  // linked beneath.
  registerImages(on)
  registerCommands(on)
  registerPaths(on)
  registerJira(on)

  // A prompt is plain text, where a rewrite cannot carry a link: the row of one
  // that names a ticket or a pasted image with its original is drawn here, the
  // person's own prompts alone.
  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    const { origin, text } = e.props

    if (origin.kind !== 'composer' && origin.kind !== 'bridge') {
      return next(e)
    }

    const cut = cutAtLinks(text, [...(await ticketLinks($, text)), ...imageLinks(text)])

    if (cut === undefined) {
      return next(e)
    }

    const { Box, Link, Text } = $.ui.resolve(e)
    const drawn = cut.parts.flatMap(({ before, label, href }) => [before, <Link href={href}>{label}</Link>])

    return (
      <Box>
        <Text color="subtle">{'> '}</Text>
        <Text>
          {drawn}
          {cut.after}
        </Text>
      </Box>
    )
  })

  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const s = await shown($)
    const beneath = await next(e)

    return e.surface === 'desktop' ? beneath : slotted(beneath, drawn($, s, $.ui.resolve(e)))
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const beneath = await next(e)

    return e.surface !== 'desktop' || e.props.hasSurvey
      ? beneath
      : slotted(beneath, drawn($, await shown($), $.ui.resolve(e)))
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Input, Text } = $.ui.resolve(e)
    const s = await shown($)
    const o = await provenance($)
    // No surface draws a native checkbox. As in the companion's pane: a switch
    // on a full square, one off an empty square, dim.
    const check = (key: Flag, label: string) => (
      <Button key={key} plain dimColor={!s[key]} onPress={() => void change($, { [key]: !s[key] })}>
        {s[key] ? '■' : '□'} {label}
      </Button>
    )
    const heading = (text: string) => <Text weight="semibold">{text}</Text>
    // The terminal draws a field as bare text: a ground of its own marks it, its label beside.
    const field = (key: string, label: string, value: string, submit: (text: string) => void) => (
      <Box key={`field-${key}`} flexDirection="row" gap={1}>
        <Text>{label}</Text>
        <Box backgroundColor={e.surface === 'terminal' ? 'subtle' : undefined}>
          <Input
            key={key}
            value={value}
            onSubmit={text => {
              submit(text.trim())
            }}
          />
        </Box>
      </Box>
    )
    const words = (key: 'site' | 'keys', label: string, pattern: RegExp, refusal: string) =>
      field(key, label, s[key], text => {
        if (isRefused(text, pattern)) {
          $.ui.toast(refusal)

          return
        }

        void change($, { [key]: text })
      })
    const count = (key: Count, label: string, min: number, max: number) =>
      field(key, label, String(s[key]), text => {
        const n = countOf(text, min, max)

        if (n === undefined) {
          $.ui.toast(TEXT.badCount(min, max))

          return
        }

        void change($, { [key]: n })
      })

    return (
      <Box flexDirection="column" paddingTop={1} rowGap={1}>
        <Box flexDirection="column">
          <Text>
            {TEXT.sources[o.source]}
            {o.isChanged && <Text color="warning">{TEXT.unsaved}</Text>}
          </Text>
          {o.hasProject && o.source !== 'project' && <Text dimColor>{TEXT.projectHasOwn}</Text>}
          <Text dimColor>{TEXT.scope}</Text>
        </Box>
        <Box flexDirection="column">
          {heading(TEXT.files)}
          {check('paths', TEXT.linkPaths)}
          <Text dimColor>{TEXT.pathsNote}</Text>
        </Box>
        <Box flexDirection="column">
          {heading('Jira')}
          {check('jira', TEXT.linkTickets)}
          {words('site', TEXT.site, SITE, TEXT.siteRefusal)}
          {words('keys', TEXT.keys, KEYS, TEXT.keysRefusal)}
          {check('title', TEXT.titleSession)}
          <Text dimColor>{TEXT.jiraNote}</Text>
          <Text dimColor>{TEXT.promptNote}</Text>
        </Box>
        <Box flexDirection="column">
          {heading(TEXT.images)}
          {check('images', TEXT.imagesInMessages)}
          {check('draft', TEXT.imagesInBox)}
          {check('resend', TEXT.imagesResend)}
          {count('columns', TEXT.maxWidth, 10, COLUMNS)}
          {count('rows', TEXT.maxHeight, 3, ROWS)}
          <Text dimColor>{TEXT.imagesNote}</Text>
        </Box>
        <Box flexDirection="column">
          {heading(TEXT.commands)}
          {check('commands', TEXT.runCommands)}
          <Text dimColor>{TEXT.commandsNote}</Text>
        </Box>
        <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
          <Button
            key="save-project"
            variant={o.isChanged ? 'primary' : 'secondary'}
            label={TEXT.saveProject}
            onPress={() => void save($, 'project')}
          />
          <Button
            key="save-global"
            variant="secondary"
            label={TEXT.saveGlobal}
            onPress={() => void save($, 'global')}
          />
          {o.hasProject && (
            <Button
              key="forget-project"
              variant="secondary"
              label={TEXT.forgetProject}
              onPress={() => void forgetProject($)}
            />
          )}
          <Button key="reset" variant="secondary" label={TEXT.reset} onPress={() => void change($, DEFAULTS)} />
        </Box>
      </Box>
    )
  })
}
