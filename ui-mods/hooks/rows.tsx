import type { ClientModule } from 'claude-code'

import { checkWidth, groundOf, linesOf, pointed, roomFor, STEP } from './list'
import type { RowsProps } from './list'

type Local = { hover: string }

/**
 * The list of mods, one line to each, drawn here so the pointer lights a row
 * with no round trip: a press on the checkbox posts `{ toggle }`, anywhere
 * else on the row or its description `{ fold }`.
 */
const Rows: ClientModule<RowsProps, Local> = (props, surface) => {
  const { Box, Text } = surface.elements
  const hover = surface.state?.hover ?? ''
  const check = checkWidth(props.boxes)
  const lines = linesOf(props.groups, roomFor(surface.columns, check))

  surface.onPointer(e => {
    const { hover: id, post } = pointed(lines, check, e)

    if (id !== (surface.state?.hover ?? '')) {
      surface.setState({ hover: id })
    }

    if (post !== undefined) {
      surface.post(post)
    }
  })

  const ground = (id: string) => groundOf(id, hover, props.hoverBg)

  return (
    <Box flexDirection="column">
      {lines.map(line => {
        const { row } = line

        if (line.kind === 'gap') {
          return <Text> </Text>
        }

        if (line.kind === 'market') {
          return (
            <Box flexDirection="row" height={1} paddingX={1}>
              <Text dimColor weight="semibold">
                {line.text.toUpperCase()}
              </Text>
              <Box flexGrow={1} />
              <Text dimColor>{String(line.count)}</Text>
            </Box>
          )
        }

        if (line.kind === 'author') {
          return (
            <Box flexDirection="row" height={1} paddingLeft={1 + STEP} paddingRight={1}>
              <Text dimColor italic>
                {line.text}
              </Text>
              <Box flexGrow={1} />
              <Text dimColor>{String(line.count)}</Text>
            </Box>
          )
        }

        if (line.kind === 'text' || row === undefined) {
          return (
            <Box height={1} overflow="hidden" paddingLeft={check} backgroundColor={ground(line.id)}>
              <Text dimColor>{line.text}</Text>
            </Box>
          )
        }

        return (
          <Box
            flexDirection="row"
            height={1}
            overflow="hidden"
            paddingLeft={1 + 2 * STEP}
            paddingRight={1}
            backgroundColor={ground(line.id)}
          >
            <Text color={row.isEnabled ? 'suggestion' : 'inactive'}>{`${props.boxes[row.isEnabled ? 0 : 1]} `}</Text>
            <Text dimColor={!row.isEnabled}>{row.name}</Text>
            {row.isPending && <Text color="warning"> •</Text>}
            <Box flexGrow={1} />
            <Text dimColor>{row.isOpen ? '▾' : '▸'}</Text>
          </Box>
        )
      })}
    </Box>
  )
}

export default Rows
