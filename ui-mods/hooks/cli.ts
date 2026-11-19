import type { Mod } from '../types'
import { SCOPES } from './mods'
import { TEXT } from './text'

/** What a failure says: its message when it is an error, else itself as text. */
export const messageOf = (failure: unknown) => (failure instanceof Error ? failure.message : String(failure))

/** What a `claude plugin` command that exited non-zero says: what it printed on stderr, else on stdout, else that it failed. */
export const failureOf = (
  args: readonly string[],
  { exitCode, stdout, stderr }: { exitCode: number; stdout: string; stderr: string },
) => stderr.trim() || stdout.trim() || TEXT.commandFailed(args[0], exitCode)

/** The arguments that switch a mod the other way, in its own scope when the CLI takes it. */
export const switchArgs = (mod: Mod) => [
  mod.isEnabled ? 'disable' : 'enable',
  mod.id,
  ...(mod.scope !== undefined && SCOPES.includes(mod.scope) ? ['--scope', mod.scope] : []),
]
