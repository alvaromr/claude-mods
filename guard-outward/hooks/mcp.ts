// An MCP tool's name is read by its leading verb, the first word that is a verb
// (`cloud_get_project`, `getJiraIssue`): a read verb reads, unless a verb that
// writes follows. A name with no verb writes, as the engine reads a tool that
// does not declare itself read-only.
const READS = new Set(['get', 'list', 'search', 'query', 'read', 'fetch', 'lookup', 'find', 'view', 'show'])
// Verbs that write wherever they stand in the name: `find_and_replace`.
const WRITES = new Set([
  'add',
  'apply',
  'assign',
  'create',
  'delete',
  'edit',
  'grant',
  'insert',
  'publish',
  'remove',
  'replace',
  'respond',
  'revoke',
  'send',
  'set',
  'submit',
  'transition',
  'update',
  'upload',
  'write',
])
// Words as much a noun as a verb: they write only as the leading verb or after
// `and`, so `getConfluenceCommentChildren` and `list_labels` read.
const AMBIGUOUS = new Set([
  'archive',
  'close',
  'comment',
  'copy',
  'deploy',
  'execute',
  'forward',
  'invite',
  'label',
  'mark',
  'merge',
  'move',
  'post',
  'reply',
  'resolve',
  'run',
  'share',
  'trash',
])
const JOINERS = new Set(['and', 'or', 'then'])
// What a leading ambiguous verb asks for when it ends the name: `deploy_status`,
// `resolve_library_id`; `resolve_thread` and `deploy` write.
const READ_NOUNS = new Set(['status', 'info', 'id', 'ids', 'list', 'history', 'details', 'count', 'logs'])

/** The tool's name where it is not a read, undefined where it reads. */
export const mcpOutward = (tool: string) => {
  const name = tool.split('__').slice(2).join('__')
  const words = name
    .split(/[^A-Za-z0-9]+|(?<=[a-z0-9])(?=[A-Z])/)
    .map(word => word.toLowerCase())
    .filter(Boolean)
  const at = words.findIndex(word => READS.has(word) || WRITES.has(word) || AMBIGUOUS.has(word))
  const lead = words[at]
  const later = words.slice(at + 1)
  const isRead =
    lead === undefined
      ? false
      : READS.has(lead)
        ? !later.some((word, i) => WRITES.has(word) || (AMBIGUOUS.has(word) && JOINERS.has(later[i - 1] ?? '')))
        : AMBIGUOUS.has(lead) && READ_NOUNS.has(words.at(-1) ?? '')

  return isRead ? undefined : tool
}
