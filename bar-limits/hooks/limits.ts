import type { SessionRateLimit } from 'claude-code'

import type { Limit } from '../types'

/** The session's and the week's windows, from what the engine measured. */
export const windowsOf = (rateLimits: readonly SessionRateLimit[]): Limit[] =>
  (['five_hour', 'seven_day'] as const).flatMap(kind => {
    const found = rateLimits.find(limit => limit.kind === kind)

    return found === undefined ? [] : [{ kind, percentUsed: found.percentUsed, resetsAt: found.resetsAt }]
  })

type Scoped = { kind?: unknown; percent?: unknown; resets_at?: unknown; scope?: { model?: { display_name?: unknown } } }

/** Each model's weekly limit in the usage endpoint's answer. */
export const modelsOf = (body: string): Limit[] =>
  ((JSON.parse(body) as { limits?: Scoped[] }).limits ?? []).flatMap(limit => {
    const name = limit.scope?.model?.display_name

    return limit.kind === 'weekly_scoped' && typeof name === 'string' && typeof limit.percent === 'number'
      ? [
          {
            kind: 'model' as const,
            name,
            percentUsed: limit.percent,
            resetsAt: typeof limit.resets_at === 'string' && limit.resets_at !== '' ? limit.resets_at : undefined,
          },
        ]
      : []
  })
