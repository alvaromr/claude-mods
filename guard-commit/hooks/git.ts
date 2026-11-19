import { SIGNING_SETTING, configSigns, signsCommit, signsTag } from './signing'

// What a git subcommand writes into history, so a read such as `git log
// --grep` may still name a trailer.
const WRITES = new Set(['commit', 'merge', 'rebase', 'cherry-pick', 'revert', 'am', 'tag'])
// The subcommands whose -S and --gpg-sign sign; `tag` has its own flags.
const SIGNS = new Set(['commit', 'merge', 'rebase', 'cherry-pick', 'revert', 'am', 'pull'])
// git's own options before the subcommand that take the next word; -c and
// --config-env are read apart, as they set a value.
const GIT_OPTION_ARGS = new Set(['-C', '--git-dir', '--work-tree', '--namespace', '--super-prefix', '--attr-source'])

export interface Found {
  writes: boolean
  signs: boolean
  // Every assignment of the line, for the GIT_CONFIG_KEY_n and GIT_CONFIG_VALUE_n pairs.
  env: Map<string, string>
}

// What a git command, as the words after `git`, writes and signs.
export const scanGit = (args: readonly string[], found: Found) => {
  let at = 0

  for (let option = args[at]; option?.startsWith('-'); option = args[at]) {
    if (option === '-c' || option === '--config-env') {
      // A value read from the environment is unknown, so it counts as set.
      const setting = args[at + 1] ?? ''

      found.signs ||= SIGNING_SETTING.test(option === '-c' ? setting : `${setting.split('=')[0]}=1`)
      at += 2
    } else if (option.startsWith('-c') || option.startsWith('--config-env=')) {
      const setting = option.slice(option.startsWith('-c') ? 2 : 13)

      found.signs ||= SIGNING_SETTING.test(option.startsWith('-c') ? setting : `${setting.split('=')[0]}=1`)
      at++
    } else {
      at += GIT_OPTION_ARGS.has(option) ? 2 : 1
    }
  }

  const sub = args[at] ?? ''
  const rest = args.slice(at + 1)

  // A tag carries a trailer only in its message; without one it lists or names a tag.
  found.writes ||=
    sub === 'tag' ? rest.some(word => /^-[a-zA-Z]*[mF]|^--(?:message|file)\b/.test(word)) : WRITES.has(sub)
  found.signs ||=
    (SIGNS.has(sub) && rest.some(signsCommit)) ||
    (sub === 'tag' && rest.some(signsTag)) ||
    (sub === 'config' && configSigns(rest))
}
