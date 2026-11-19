// gh's options that can come before its group or verb and take the next word.
const GH_OPTION_ARGS = new Set(['-R', '--repo', '--hostname'])
// The gh commands that only read or act on this machine.
const GH_LOCAL = new Set(['auth', 'alias', 'browse', 'completion', 'config', 'extension', 'help', 'search', 'status'])
// A gh subcommand that reads: `gh pr view`, `gh project item-list`.
const GH_READ = /^(?:[\w-]+-)?(?:list|view|status|diff|checks|download|watch|checkout|clone|verify|help)$|^-/

// `gh api` writes with a method other than GET or, without one, with fields;
// a GraphQL call writes only through a mutation.
export const ghApiOutward = (args: readonly string[], command: string) => {
  const method = args
    .map((arg, at) => /^(?:-X|--method)=?(.*)$/.exec(arg)?.[1] || (/^(?:-X|--method)$/.test(arg) ? args[at + 1] : ''))
    .find(Boolean)
  const hasFields = args.some(arg => /^(?:-[fF]|--field|--raw-field|--input)(?:=|$)|^-[fF]./.test(arg))
  const endpoint = args.find(arg => !arg.startsWith('-'))

  // A query out of sight (a variable, a file, stdin) may be a mutation.
  if (endpoint === 'graphql') {
    const isSeen = /\bquery=(["']?)[^@$"'\s]/.test(command) && !/(?:^|\s)--input\b/.test(command)

    return /\bmutation\b/.test(command) ? 'gh api graphql mutation' : isSeen ? undefined : 'gh api graphql'
  }

  const verb = (method ?? (hasFields ? 'POST' : 'GET')).toUpperCase()

  return verb === 'GET' || verb === 'HEAD' ? undefined : `gh api -X ${verb}`
}

/** What a gh command, as the words after `gh`, sends outside the session, as it reads; undefined where it sends nothing. */
export const ghOutward = (args: readonly string[], command: string) => {
  // The group and its verb, past the options before them: `gh pr -R o/r merge`.
  const named: { arg: string; at: number }[] = []

  for (let i = 0, arg = args[0]; arg !== undefined && named.length < 2; arg = args[++i]) {
    if (GH_OPTION_ARGS.has(arg)) {
      i++
    } else if (!arg.startsWith('-')) {
      named.push({ arg, at: i })
    }
  }

  const [group, verb] = named

  if (group === undefined || GH_LOCAL.has(group.arg)) {
    return undefined
  }

  if (group.arg === 'api') {
    return ghApiOutward(args.slice(group.at + 1), command)
  }

  return verb === undefined || GH_READ.test(verb.arg) ? undefined : `gh ${group.arg} ${verb.arg}`
}
