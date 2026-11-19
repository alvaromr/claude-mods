import type { Register } from 'claude-code'

import { refusal } from './refusal'

export const register: Register = on => {
  on('tool.call', { tool: 'Bash' }, ($, e, next) => {
    const why = refusal(e.command)

    return why === undefined ? next(e) : { deny: `${$.plugin.name}: ${why}` }
  }).catch(($, e, next) => (next.called ? next(e) : { deny: `${$.plugin.name}: its guard failed.` }))

  // A Monitor runs a shell command too.
  on('tool.call', { tool: 'Monitor' }, ($, e, next) => {
    const why = refusal(e.command ?? '')

    return why === undefined ? next(e) : { deny: `${$.plugin.name}: ${why}` }
  }).catch(($, e, next) => (next.called ? next(e) : { deny: `${$.plugin.name}: its guard failed.` }))
}
