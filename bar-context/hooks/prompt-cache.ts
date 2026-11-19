import type { Cold, Ttl, Warm } from '../types'

const TTL_MS: Record<Ttl, number> = { '5m': 300_000, '1h': 3_600_000 }

/** What a response said it read and wrote, as the API counts it. */
type Tokens = {
  input_tokens?: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
}

// The cache write a line of the transcript reports, when the line is a response
// of the main conversation; none for a line still being written, which is not JSON yet.
type Entry = {
  type?: unknown
  isSidechain?: unknown
  message?: { usage?: { cache_creation?: { ephemeral_1h_input_tokens?: number; ephemeral_5m_input_tokens?: number } } }
}

const writeOf = (line: string) => {
  try {
    const entry = JSON.parse(line) as Entry

    return entry.type === 'assistant' && entry.isSidechain !== true ? entry.message?.usage?.cache_creation : undefined
  } catch {
    return undefined
  }
}

const isOn = (value: string | undefined) => /^(?:1|true|yes|on)$/i.test(value ?? '')

export const isTtl = (value: unknown): value is Ttl => value === '5m' || value === '1h'

/**
 * The lifetime of the last cache write the API reported, which the session's
 * transcript keeps response by response; undefined where it holds no write.
 */
export const writtenTtl = (transcript: string): Ttl | undefined => {
  for (const line of transcript.split('\n').reverse()) {
    const wrote = line.includes('"cache_creation"') ? writeOf(line) : undefined

    if ((wrote?.ephemeral_1h_input_tokens ?? 0) > 0) {
      return '1h'
    }

    if ((wrote?.ephemeral_5m_input_tokens ?? 0) > 0) {
      return '5m'
    }
  }

  return undefined
}

/**
 * The lifetime Claude Code asks for by its own rules, the first that says
 * (code.claude.com/docs/en/prompt-caching#choose-the-ttl-yourself): the
 * variables and the setting in their order there; undefined where none does.
 */
export const ttlSaid = (said: {
  force5m: string | undefined
  ttlVariable: string | undefined
  setting: unknown
  force1h: string | undefined
}): Ttl | undefined =>
  [isOn(said.force5m) && '5m', said.ttlVariable, said.setting, isOn(said.force1h) && '1h'].find(isTtl)

/**
 * The lifetime the account gives when nothing says: an hour on a subscription
 * within its plan alone, the one account that reports plan windows with room
 * left.
 */
export const ttlOfPlan = (limits: { kind: string; percentUsed: number }[]): Ttl => {
  const plan = limits.filter(({ kind }) => kind === 'five_hour' || kind === 'seven_day')

  return plan.length > 0 && plan.every(({ percentUsed }) => percentUsed < 100) ? '1h' : '5m'
}

/** When the cache of a session that starts was last written, from the seconds Claude Code reports since the response. */
export const resumedAt = (now: number, secondsAgo: number | undefined, isExpired: boolean) =>
  // Claude Code's own word that it has lapsed counts before this mod's sum:
  // an hour ago is past any lifetime.
  isExpired ? now - TTL_MS['1h'] : now - (secondsAgo ?? 0) * 1000

/** Whether a session that starts takes up a conversation that went before, resumed or forked. */
export const isResume = (source: string) => source === 'resume' || source === 'fork'

/** The cache once `patch` is told of it, none where there was none. */
export const rewarmed = (left: Warm | null, patch: Partial<Warm>): Warm | null =>
  left === null ? null : { ...left, ...patch }

/** Whole seconds the cache has left, nothing or less once it has lapsed. */
export const secondsLeft = (warm: Warm, now: number) => Math.floor((warm.at + TTL_MS[warm.ttl] - now) / 1000)

const isLapsed = (warm: Warm, now: number) => warm.at + TTL_MS[warm.ttl] <= now

/** The cache as the warning above the prompt draws it, none while it lives. */
export const coldOf = (warm: Warm | null, now: number): Cold | null =>
  warm !== null && isLapsed(warm, now) ? { tokens: warm.tokens } : null

/**
 * What a miss of a request sent at `sentAt` would be down to, told before the
 * request starts the lifetime over: the cache lapsed, or written for another
 * model.
 */
export const missCause = (before: Warm | null, sentAt: number, model: string) =>
  before === null
    ? null
    : isLapsed(before, sentAt)
      ? `ttl_expired_${before.ttl}`
      : before.model !== undefined && before.model !== model
        ? 'model_changed'
        : null

/** The tokens a response left in the cache: all its input, when it read or wrote any; none otherwise. */
export const cachedTokens = ({
  input_tokens = 0,
  cache_read_input_tokens = 0,
  cache_creation_input_tokens = 0,
}: Tokens) =>
  cache_read_input_tokens + cache_creation_input_tokens > 0
    ? input_tokens + cache_read_input_tokens + cache_creation_input_tokens
    : null

/**
 * A miss: the request wrote again most of what the cache held before it,
 * reading back less than half of it.
 */
export const isMiss = (before: Warm | null, { cache_read_input_tokens = 0, cache_creation_input_tokens = 0 }: Tokens) =>
  before?.tokens != null && cache_creation_input_tokens > 0 && cache_read_input_tokens < before.tokens / 2
