import type { EngineInterface, Register, RenderNode, RenderSurface } from 'claude-code'

import type { Kind } from '../types'
import {
  columnsOf,
  drawsAlert,
  drawsAny,
  drawsHeading,
  framesPrompt,
  indentOf,
  isPaneOpen,
  isReplyDrawn,
  teachesAlerts,
} from './drawing'
import { asWritten, headingText, partsOf } from './parts'
import { ALERT_FRAMES, colorName, hasUnusedProject, KINDS, PROMPT_FRAMES, titleOf } from './preferences'
import { rule } from './rule'
import { change, changeLook, forgetProject, orElse, provenance, ready, reset, save, shown, start } from './settings'
import { slotted } from './slots'
import { TEXT } from './text'

const PANE = 'colorify'
const SECTION = 'ui-colorify:alerts'

// The panel away when it is up, back when it is not.
const togglePane = async ($: EngineInterface) => {
  if (isPaneOpen(await $.ui.panes(), PANE)) {
    await $.ui.close({ id: PANE })

    return
  }

  await $.ui.open({ id: PANE, title: TEXT.title })
}

async function copyText($: EngineInterface, text: string, surface: RenderSurface) {
  const result = await $.ui.copy({ text, surface }).catch(orElse($, 'copying a quote', undefined))

  if (result?.isCopied) {
    $.ui.toast(TEXT.copied)

    return
  }

  $.ui.toast(TEXT.notCopied(result === undefined ? 'error' : result.reason))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await start($)

    return next(e)
  })

  // The section that teaches the model the alerts, last, after the cache
  // boundary, where a terminal draws them.
  on('prompt.compose', async ($, e, next) => {
    const result = await next(e)

    if (!teachesAlerts(e.surfaces) || !(await ready($)).on) {
      return result
    }

    return { sections: [...result.sections, { id: SECTION, text: TEXT.prompt, scope: 'session' }] }
  })

  // A reply cut at its quotes and headings: each quote framed in its colour,
  // each heading in its own, the text between drawn beneath as Claude Code
  // draws it, so the other mods still link it.
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (!isReplyDrawn(e.surface, e.props.isSummary)) {
      return next(e)
    }

    const s = await shown($)
    const parts = partsOf(e.props.text)

    if (!drawsAny(parts, s)) {
      return next(e)
    }

    const { Box, Button, Text } = $.ui.resolve(e)
    const indent = indentOf(e.props.isFirstOfReply)
    const columns = columnsOf(e.viewport) - indent
    const drawn: RenderNode[] = []

    for (const [n, part] of parts.entries()) {
      const isFirst = n === 0 && e.props.isFirstOfReply

      // A heading in its colour, its code and bold marks taken off: a Text draws no markdown.
      if (drawsHeading(part, s)) {
        drawn.push(
          <Box key={`heading-${n}`} paddingLeft={indent}>
            <Text weight="semibold" color={s.headings.color}>
              {headingText(part.title)}
            </Text>
          </Box>,
        )
        continue
      }

      // What the mod does not draw goes beneath as it was written.
      if (!drawsAlert(part, s)) {
        const beneath = await next({ ...e, props: { ...e.props, text: asWritten(part), isFirstOfReply: isFirst } })

        drawn.push(
          isFirst ? (
            beneath
          ) : (
            <Box key={`text-${n}`} paddingLeft={indent}>
              {beneath}
            </Box>
          ),
        )
        continue
      }

      const look = s.looks[part.kind]
      const body =
        part.body === '' ? '' : await next({ ...e, props: { ...e.props, text: part.body, isFirstOfReply: false } })
      // The ⧉ copies the text as Claude wrote it, without the marker and the quote marks.
      const copy = (
        <Box flexShrink={0} paddingLeft={1}>
          <Button
            key={`copy-${n}`}
            label={TEXT.copy}
            plain
            dimColor
            onPress={() => void copyText($, part.body, e.surface)}
          >
            ⧉
          </Button>
        </Box>
      )
      // With a title, the ⧉ ends its row; without one, the first row of the text.
      const content =
        look.title === '' ? (
          <Box flexDirection="row">
            <Box flexDirection="column" flexGrow={1} flexShrink={1}>
              {body}
            </Box>
            {copy}
          </Box>
        ) : (
          <>
            <Box flexDirection="row" justifyContent="space-between">
              <Text weight="semibold" color={look.color}>
                {look.title}
              </Text>
              {copy}
            </Box>
            {body}
          </>
        )

      drawn.push(
        look.frame === 'box' ? (
          <Box
            key={`alert-${n}`}
            marginLeft={indent}
            flexDirection="column"
            borderStyle="round"
            borderColor={look.color}
            paddingX={1}
          >
            {content}
          </Box>
        ) : (
          <Box key={`alert-${n}`} marginLeft={indent} flexDirection="column">
            {look.frame === 'lines' && rule(columns, look.color, false)}
            {content}
            {look.frame === 'lines' && rule(columns, look.color, false)}
          </Box>
        ),
      )
    }

    return (
      <Box flexDirection="column" rowGap={1}>
        {drawn}
      </Box>
    )
  })

  // The person's own prompts, drawn beneath as before, in a box or between two lines.
  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    const s = await shown($)
    const { frame, color, dashed } = s.prompts
    const { kind } = e.props.origin

    if (!framesPrompt(s, e.surface, kind)) {
      return next(e)
    }

    const { Box } = $.ui.resolve(e)

    if (frame === 'box') {
      return (
        // `dashed` is the engine's own, undocumented: ╌ and ╎, the corners blank.
        <Box borderStyle={dashed ? 'dashed' : 'round'} borderColor={color} paddingX={1}>
          {await next(e)}
        </Box>
      )
    }

    const line = rule(columnsOf(e.viewport), color, dashed)

    // Claude Code's row is opaque to a mod (`{ type: 'engine' }`), its blank
    // row above the text included: the lines go around it as it is. A ground
    // of colour was tried and dropped: that row paints its own over the text.
    return (
      <Box flexDirection="column">
        {line}
        {await next(e)}
        {line}
      </Box>
    )
  })

  // The button, fifth in the footer's first slot row, its dot green while the
  // mod is on, gray while off. The desktop app draws no alert: no button there.
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const s = await shown($)
    const beneath = await next(e)
    const { Box, Button, Text } = $.ui.resolve(e)

    return e.surface === 'desktop'
      ? beneath
      : slotted(
          beneath,
          <Box key="slot:1.5:ui-colorify">
            <Button key="colorify" plain dimColor onPress={() => void togglePane($)}>
              <Text color={s.on ? 'success' : 'inactive'}>{s.on ? '●' : '○'}</Text> colorify
            </Button>
          </Box>,
        )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Input, Text } = $.ui.resolve(e)
    const s = await shown($)
    const o = await provenance($)
    // A row of options: the chosen one a pill, the others buttons, dimmed but
    // for a colour's, drawn in its colour (DESIGN.md, "Controls").
    const pills = <T extends string>(
      key: string,
      options: readonly T[],
      chosen: T,
      label: (option: T) => string,
      color: (option: T) => string | undefined,
      pick: (option: T) => void,
    ) => (
      <Box key={key} flexDirection="row" flexWrap="wrap" columnGap={1}>
        {options.map(option =>
          option === chosen ? (
            <Text key={`${key}-${option}`} weight="semibold" inverse color={color(option)}>
              {`  ${label(option)}  `}
            </Text>
          ) : (
            <Button
              key={`${key}-${option}`}
              plain
              dimColor={color(option) === undefined}
              onPress={() => {
                pick(option)
              }}
            >
              <Text color={color(option)}>{label(option)}</Text>
            </Button>
          ),
        )}
      </Box>
    )
    const check = (key: string, isChecked: boolean, label: string, toggle: () => void) => (
      <Button key={key} plain dimColor={!isChecked} onPress={toggle}>
        {isChecked ? '■' : '□'} {label}
      </Button>
    )
    const kind = (k: Kind) => {
      const look = s.looks[k]

      return (
        <Box key={`kind-${k}`} flexDirection="column">
          <Text weight="semibold" color={look.color}>
            {TEXT.labels[k]}
          </Text>
          {check(`on-${k}`, look.on, TEXT.draw, () => void changeLook($, k, { on: !look.on }))}
          <Box flexDirection="row" gap={1}>
            <Text>{TEXT.color}</Text>
            {pills(
              `color-${k}`,
              Object.keys(TEXT.colors),
              look.color,
              colorName,
              c => c,
              c => void changeLook($, k, { color: c }),
            )}
          </Box>
          <Box flexDirection="row" gap={1}>
            <Text>{TEXT.frame}</Text>
            {pills(
              `frame-${k}`,
              ALERT_FRAMES,
              look.frame,
              f => TEXT.frames[f],
              () => undefined,
              f => void changeLook($, k, { frame: f }),
            )}
          </Box>
          <Box flexDirection="row" gap={1}>
            <Text>{TEXT.titleField}</Text>
            <Box backgroundColor={e.surface === 'terminal' ? 'subtle' : undefined}>
              <Input
                key={`title-${k}`}
                value={look.title}
                onSubmit={text => {
                  const { title, isTooLong } = titleOf(text)

                  if (isTooLong) {
                    $.ui.toast(TEXT.titleRefusal)

                    return
                  }

                  void changeLook($, k, { title })
                }}
              />
            </Box>
          </Box>
        </Box>
      )
    }

    return (
      <Box flexDirection="column" paddingTop={1} rowGap={1}>
        <Box flexDirection="column">
          <Text>
            {TEXT.sources[o.source]}
            {o.isChanged && <Text color="warning">{TEXT.unsaved}</Text>}
          </Text>
          {hasUnusedProject(o) && <Text dimColor>{TEXT.projectHasOwn}</Text>}
          <Text dimColor>{TEXT.scope}</Text>
        </Box>
        <Box flexDirection="column">
          {check('on', s.on, TEXT.active, () => void change($, { on: !s.on }))}
          <Text dimColor>{TEXT.activeNote}</Text>
        </Box>
        <Box key="prompts" flexDirection="column">
          <Text weight="semibold">{TEXT.prompts}</Text>
          <Box flexDirection="row" gap={1}>
            <Text>{TEXT.frame}</Text>
            {pills(
              'frame-prompts',
              PROMPT_FRAMES,
              s.prompts.frame,
              f => TEXT.promptFrames[f],
              () => undefined,
              f => void change($, { prompts: { ...s.prompts, frame: f } }),
            )}
          </Box>
          {s.prompts.frame !== 'normal' &&
            check(
              'dashed-prompts',
              s.prompts.dashed,
              TEXT.dashed,
              () => void change($, { prompts: { ...s.prompts, dashed: !s.prompts.dashed } }),
            )}
          <Box flexDirection="row" gap={1}>
            <Text>{TEXT.color}</Text>
            {pills(
              'color-prompts',
              [...Object.keys(TEXT.colors), ...Object.keys(TEXT.softColors)],
              s.prompts.color,
              colorName,
              c => c,
              c => void change($, { prompts: { ...s.prompts, color: c } }),
            )}
          </Box>
          <Text dimColor>{TEXT.promptsNote}</Text>
        </Box>
        <Box key="headings" flexDirection="column">
          <Text weight="semibold" color={s.headings.color}>
            {TEXT.headings}
          </Text>
          {check(
            'on-headings',
            s.headings.on,
            TEXT.draw,
            () => void change($, { headings: { ...s.headings, on: !s.headings.on } }),
          )}
          <Box flexDirection="row" gap={1}>
            <Text>{TEXT.color}</Text>
            {pills(
              'color-headings',
              Object.keys(TEXT.colors),
              s.headings.color,
              colorName,
              c => c,
              c => void change($, { headings: { ...s.headings, color: c } }),
            )}
          </Box>
          <Text dimColor>{TEXT.headingsNote}</Text>
        </Box>
        {KINDS.map(kind)}
        <Text dimColor>{TEXT.kindsNote}</Text>
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
          <Button key="reset" variant="secondary" label={TEXT.reset} onPress={() => void reset($)} />
        </Box>
      </Box>
    )
  })
}
