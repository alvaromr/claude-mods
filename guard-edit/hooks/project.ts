import { SCRATCH } from './paths'
import type { Write } from './written'

/** The writes to ask git of: those outside the places where writing is never an edit of a project. */
export const askedOf = (writes: readonly Write[]) => writes.filter(write => !SCRATCH.test(write.path))

/** The words the script that asks git is given: each path, marked `?` where it counts only if already there. */
export const projectArgs = (asked: readonly Write[]) =>
  asked.map(write => (write.ifExists ? `?${write.path}` : write.path))

/** The writes the script printed the path of: those of a git project, not ignored there. */
export const caughtOf = (asked: readonly Write[], stdout: string) => {
  const found = new Set(stdout.split('\n').filter(Boolean))

  return asked.filter(write => found.has(write.path))
}

/** Why the command may not run, given the writes caught, by the plugin's name. */
export const denial = (plugin: string, caught: readonly Write[]) => {
  const files = [...new Set(caught.map(write => write.path))].join(', ')
  const hows = [...new Set(caught.map(write => write.how))].join(', ')

  return `${plugin}: this command writes ${files} from the shell (${hows}), and that is a file of a git project: change it with Edit or Write, so the change shows its diff and /rewind can undo it. Writing to temporary files (/tmp, $TMPDIR, the scratchpad) or to files git ignores is allowed.`
}
