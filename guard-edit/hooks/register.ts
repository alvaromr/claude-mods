import type { EngineInterface, Register } from 'claude-code'

import { askedOf, caughtOf, denial, projectArgs } from './project'
import { writesIn } from './writes-in'
import type { Write } from './written'

const inProject = async ($: EngineInterface, writes: readonly Write[]) => {
  const asked = askedOf(writes)

  if (asked.length === 0) {
    return []
  }

  // Which of the paths are a project's and not ignored there (scripts/in-project.sh).
  const { stdout } = await $.process.run(['sh', `${$.plugin.root}/scripts/in-project.sh`, ...projectArgs(asked)])

  return caughtOf(asked, stdout)
}

/** Why `command` may not run, or undefined where it may. */
const refusal = async ($: EngineInterface, command: string) => {
  const writes = writesIn(command, await $.session.cwd(), (await $.env.get('HOME')) ?? '')
  const caught = writes.length > 0 ? await inProject($, writes) : []

  return caught.length === 0 ? undefined : denial($.plugin.name, caught)
}

// A guard that fails denies, as one that let the command through would be no guard.
const failed = ($: EngineInterface) => ({ deny: `${$.plugin.name}: its guard failed.` })

export const register: Register = on => {
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const why = await refusal($, e.command)

    return why === undefined ? next(e) : { deny: why }
  }).catch(($, e, next) => (next.called ? next(e) : failed($)))

  // A Monitor runs a shell command too.
  on('tool.call', { tool: 'Monitor' }, async ($, e, next) => {
    const why = await refusal($, e.command ?? '')

    return why === undefined ? next(e) : { deny: why }
  }).catch(($, e, next) => (next.called ? next(e) : failed($)))
}
