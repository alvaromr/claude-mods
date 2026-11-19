import type { Register } from 'claude-code'

import { listedCommands, outwardOf } from './outward'
import { TEXT } from './text'

export const register: Register = (on, options) => {
  const listed = listedCommands(String(options.commands ?? ''))

  // An ask a hook answers is the person's: the dialog or a host's callback
  // settles it, never the auto mode's classifier, and where nobody can be
  // asked it is a deny with this reason. An MCP tool's own read-only claim is
  // its server's word, so it does not skip the ask.
  on('tool.check', async ($, e, next) => {
    const what = outwardOf(e.tool, e.input, listed)
    const verdict = await next(e)

    return what === undefined || verdict.decision === 'deny'
      ? verdict
      : { decision: 'ask', reason: `${$.plugin.name}: ${TEXT.reason(`\`${what}\``)}` }
  }).catch(async ($, e, next) => {
    const verdict = await next(e)

    return verdict.decision === 'deny' ? verdict : { decision: 'ask', reason: `${$.plugin.name}: ${TEXT.failed}` }
  })
}
