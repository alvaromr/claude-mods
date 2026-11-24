// The built-in tools that reach other people or outside services, or cannot be
// undone, at the granularity their inputs allow. Left out on purpose, because
// they stay with the person or this machine, or are undone by one call:
// - Artifact publish, pin and uploads: an artifact starts private to the person.
//   Only a forced publish, which discards the newer version, is asked.
// - ArtifactData and Projects writes, DesignSync writes: the person's own
//   private store. Only deletions are asked (DesignSync's plan is approved by
//   the person at finalize_plan).
// - SendFeedback: queued on this machine, not sent by the call.
// - SendMessage to a subagent, a teammate, `main` or a peer session on this
//   machine: it stays inside the person's sessions. A peer's name from
//   ListAgents cannot be told from a remote one by the call.
// - SendUserMessage, SendUserFile, PushNotification: they reach the person.
// - CronCreate, CronDelete, ScheduleWakeup: session-only, on this machine.
// - WebFetch, WebSearch, the reads of every tool above: they publish nothing.
// - ClaudeDesign: its operations are named by the server, so the call does not
//   say which one writes.

// The tools asked about whatever they are given.
const ALWAYS = new Set(['PublishPlugin', 'SendFile', 'SendToProject', 'ShareOnboardingGuide'])

// The tools asked about for some values of one input field: the action that
// publishes, sends, runs remotely or deletes.
const BY_FIELD = new Map<string, readonly [field: string, values: ReadonlySet<string>]>([
  ['Artifact', ['action', new Set(['delete'])]],
  ['ArtifactComments', ['action', new Set(['reply', 'resolve'])]],
  ['RemoteTrigger', ['action', new Set(['create', 'update', 'run', 'create_webhook_trigger'])]],
  ['DesignSync', ['method', new Set(['delete_files'])]],
  ['Projects', ['method', new Set(['project_delete'])]],
])

const asRecord = (input: unknown): Record<string, unknown> =>
  typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {}

/** The built-in tool's call where it reaches outside the session or cannot be undone, as it reads; undefined where it does not. */
export const builtinOutward = (tool: string, input: unknown) => {
  const args = asRecord(input)
  const byField = BY_FIELD.get(tool)
  const action = byField === undefined ? undefined : args[byField[0]]

  if (ALWAYS.has(tool)) {
    return tool
  }

  if (typeof action === 'string' && byField?.[1].has(action)) {
    return `${tool} ${action}`
  }

  // The default action publishes; forcing it discards the newer version.
  if (tool === 'Artifact' && args.force === true && (action === undefined || action === 'publish')) {
    return 'Artifact publish force'
  }

  // Automatic replies post to the people who comment.
  if (tool === 'ArtifactComments' && action === 'watch' && args.replies === true) {
    return 'ArtifactComments watch replies'
  }

  if (tool === 'ArtifactData') {
    const writes = Array.isArray(args.writes) ? (args.writes as unknown[]) : []
    const hasDelete =
      args.action === 'delete' || (args.action === 'batch' && writes.some(write => asRecord(write).op === 'delete'))

    return hasDelete ? 'ArtifactData delete' : undefined
  }

  // A bridge address is a session beyond this machine.
  if (tool === 'SendMessage' && typeof args.to === 'string' && args.to.startsWith('bridge:')) {
    return 'SendMessage bridge'
  }

  return tool === 'Agent' && args.isolation === 'remote' ? 'Agent remote' : undefined
}
