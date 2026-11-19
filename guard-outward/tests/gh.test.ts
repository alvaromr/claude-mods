import { expect, test } from 'claude-code/testing'

import { ghApiOutward, ghOutward } from '../hooks/gh'

const words = (line: string) => line.split(' ')

/** What `gh <line>` sends, the line being also the command the words came from. */
const gh = (line: string) => ghOutward(words(line), `gh ${line}`)
/** What `gh api <line>` sends. */
const api = (line: string, command = `gh api ${line}`) => ghApiOutward(words(line), command)

test('a gh verb that writes is named with its group', () => {
  expect(gh('pr create')).toBe('gh pr create')
  expect(gh('pr merge 1')).toBe('gh pr merge')
  expect(gh('issue close 1')).toBe('gh issue close')
  expect(gh('pr foo')).toBe('gh pr foo')
  expect(gh('pr --web create')).toBe('gh pr create')
})

test('the options before the group or the verb that take a word are skipped', () => {
  expect(gh('-R o/r pr merge 1')).toBe('gh pr merge')
  expect(gh('--repo o/r issue close 1')).toBe('gh issue close')
  expect(gh('--hostname h pr create')).toBe('gh pr create')
  expect(gh('pr -R o/r merge 1')).toBe('gh pr merge')
  expect(gh('-R o/r api -X PATCH x')).toBe('gh api -X PATCH')
})

test('a gh call with no group or no verb sends nothing', () => {
  expect(gh('')).toBeUndefined()
  expect(gh('--version')).toBeUndefined()
  expect(gh('pr')).toBeUndefined()
  expect(gh('pr -x')).toBeUndefined()
  expect(gh('pr -R')).toBeUndefined()
  expect(gh('pr -R o/r')).toBeUndefined()
})

test('the groups that act on this machine send nothing, whatever their verb', () => {
  for (const group of ['auth', 'alias', 'browse', 'completion', 'config', 'extension', 'help', 'search', 'status']) {
    expect(gh(`${group} create x`), group).toBeUndefined()
  }
})

test('a verb that reads sends nothing', () => {
  for (const verb of [
    'list',
    'view',
    'status',
    'diff',
    'checks',
    'download',
    'watch',
    'checkout',
    'clone',
    'verify',
    'help',
  ]) {
    expect(gh(`pr ${verb} 1`), verb).toBeUndefined()
  }
})

test('a verb that reads, with a prefix of its own, sends nothing', () => {
  expect(gh('project item-list 1')).toBeUndefined()
  expect(gh('repo deploy-key-list x')).toBeUndefined()
  expect(gh('pr -x')).toBeUndefined()
})

test('a verb that only ends like one that reads writes', () => {
  expect(gh('pr relist 1')).toBe('gh pr relist')
  expect(gh('pr listing 1')).toBe('gh pr listing')
})

test('gh api reads with GET, HEAD or no method and no fields', () => {
  expect(api('repos/o/r')).toBeUndefined()
  expect(api('-X GET search -f q=1')).toBeUndefined()
  expect(api('-X HEAD x')).toBeUndefined()
  expect(api('-X get x')).toBeUndefined()
  expect(gh('api repos/o/r')).toBeUndefined()
})

test('gh api writes with a method other than GET, in any form and case', () => {
  expect(api('-X PATCH repos/o/r -f name=x')).toBe('gh api -X PATCH')
  expect(api('--method=DELETE repos/o/r')).toBe('gh api -X DELETE')
  expect(api('--method PUT repos/o/r')).toBe('gh api -X PUT')
  expect(api('-XDELETE repos/o/r')).toBe('gh api -X DELETE')
  expect(api('-X delete repos/o/r')).toBe('gh api -X DELETE')
  expect(api('-X=PUT x')).toBe('gh api -X PUT')
  expect(gh('api -X PATCH repos/o/r')).toBe('gh api -X PATCH')
})

test('gh api with a method that names nothing, takes the default', () => {
  expect(api('-X')).toBeUndefined()
  expect(api('--method')).toBeUndefined()
  expect(api('--method= x')).toBeUndefined()
})

test('gh api posts where it is given fields and no method', () => {
  for (const option of [
    '-f title=1',
    '-F title=1',
    '--field t=1',
    '--field=t=1',
    '--raw-field t=1',
    '--input b.json',
    '-ftitle=Bug',
    '-Ftitle=Bug',
    '-f',
  ]) {
    expect(api(`repos/o/r ${option}`), option).toBe('gh api -X POST')
  }

  expect(api('repos/o/r --fieldx')).toBeUndefined()
})

test('a method given wins over the fields', () => {
  expect(api('-X GET repos/o/r -f q=1')).toBeUndefined()
  expect(api('-X PUT repos/o/r -f q=1')).toBe('gh api -X PUT')
})

test('a graphql query in sight reads', () => {
  expect(api('graphql -f query={viewer{login}}')).toBeUndefined()
  expect(api("graphql -f query='{ viewer { login } }'")).toBeUndefined()
})

test('a graphql mutation asks, however it is given', () => {
  expect(api('graphql -f query="mutation { x }"')).toBe('gh api graphql mutation')
  expect(api('graphql -f query=mutation')).toBe('gh api graphql mutation')
  expect(api("graphql -f query='{ a }'", "gh api graphql -f query='{ a }' mutation")).toBe('gh api graphql mutation')
})

test('a graphql query out of sight asks, as it may be a mutation', () => {
  expect(api('graphql -f query=@m.gql')).toBe('gh api graphql')
  expect(api('graphql -F query=@m.gql')).toBe('gh api graphql')
  expect(api('graphql -f query=$Q')).toBe('gh api graphql')
  expect(api('graphql -f query="$Q"')).toBe('gh api graphql')
  expect(api('graphql --input -')).toBe('gh api graphql')
  expect(api('graphql')).toBe('gh api graphql')
  expect(api('graphql -f x=1')).toBe('gh api graphql')
})

test('a graphql query with an input file asks, though one is in sight', () => {
  expect(api("graphql -f query='{ viewer { login } }' --input q.json")).toBe('gh api graphql')
})

test('--input is an option of its own, not the start of another word', () => {
  expect(api('graphql -f query=x --inputs y')).toBeUndefined()
})

test('the endpoint is the first word that is no option', () => {
  expect(api('-f x graphql')).toBe('gh api -X POST')
})
