/** A lifetime the prompt cache has. */
export type Ttl = '5m' | '1h'

/** The main conversation's last request, which the cache lives one lifetime from. */
export type Warm = {
  /** When it was sent, or answered, in `$.clock.now()`'s milliseconds. */
  at: number
  /** Tokens the cache holds, the ones a request sends again once it has lapsed, when known. */
  tokens: number | null
  /** The lifetime the cache was written with. */
  ttl: Ttl
  /** The model the cache was written for, by the id the request named; absent for one resumed. */
  model?: string
}

/** The last request of the main conversation that missed the cache, and why when it can be told. */
export type Miss = {
  at: number
  /** `ttl_expired_1h`, `ttl_expired_5m` or `model_changed`; null for any other cause. */
  cause: string | null
}

/** The cache once its lifetime has passed, as the warning above the prompt draws it. */
export type Cold = {
  /** Tokens the next request writes to the cache again, when known. */
  tokens: number | null
}

/** The context window as the status line reads it: its size, and its fill once a response reported one. */
export type Fill = { percent?: number; tokens?: number; window: number }

/** Output tokens per second: the last response's, and the sums the session's average comes from. */
export type Speed = { last: number | null; tokens: number; ms: number }

/**
 * The main loop's model as its name reads (Opus 5.5), and the effort its last
 * request asked for, or the one asked for since by a click on the row.
 */
export type Model = { name: string | null; effort: string | null }

/** What a click on the row's model or effort switches. */
export type Picker = 'model' | 'effort'

/**
 * What the row and the warning show and how, every field set from the
 * settings pane and kept across sessions.
 */
export type Preferences = {
  showModel: boolean
  showEffort: boolean
  showContext: boolean
  showBar: boolean
  showPercent: boolean
  /** `(37k/200k)`, the tokens in the window over its size. */
  showTokens: boolean
  /** `⚡ 16 tok/s`, the last response's. */
  showSpeed: boolean
  /** `(ø 84)`, the session's. */
  showAverage: boolean
  /** `$0.42`, the session's cost as the engine estimates it. */
  showCost: boolean
  /** `Cache 59m`, how long the prompt cache has left, or `Cache fría`. */
  showCache: boolean
  /** `(261k)`, the tokens the next request writes again once it has lapsed. */
  showCacheTokens: boolean
  /** `⚠ miss ttl_expired_1h`, a while after a request missed it. */
  showMiss: boolean
  /** The red line above the prompt while the prompt cache has lapsed. */
  showCacheWarning: boolean
  /** `⚠ compactar 72%`, a button that compacts once the window is `compactFrom` full. */
  showCompact: boolean
  contextLabel: string
  cacheLabel: string
  compactLabel: string
  modelColor: string
  effortColor: string
  lowColor: string
  midColor: string
  highColor: string
  emptyColor: string
  speedColor: string
  cacheColor: string
  /** The cache about to lapse or lapsed, and a miss. */
  cacheWarnColor: string
  /** The block the compact button stands on. */
  compactColor: string
  mutedColor: string
  warningColor: string
  /** The share of the window from which the bar takes `midColor`, then `highColor`. */
  midFrom: number
  highFrom: number
  /** Minutes left at or below which the cache takes `cacheWarnColor`. */
  cacheSoonMinutes: number
  /** Minutes a miss stays on screen. */
  missShownMinutes: number
  /** The share of the window from which the compact button shows. */
  compactFrom: number
  /** How long the cache lives: `auto`, or `5m` or `1h` whatever the API and the rules say. */
  cacheTtl: string
}

/**
 * Where the session's settings came from (its project's saved ones, the
 * global ones or the defaults), whether the session changed them since, and
 * whether its project keeps its own.
 */
export type Provenance = { source: 'project' | 'global' | 'defaults'; isChanged: boolean; hasProject: boolean }

declare module 'claude-code' {
  interface PluginState {
    'bar-context': {
      warm: Warm | null
      miss: Miss | null
      fill: Fill | null
      speed: Speed
      /** What the session has cost in US dollars, as the engine estimates it; null where it keeps no ledger. */
      cost: number | null
      model: Model
      /** Which of the row's two clicks has its options open. */
      picker: Picker | null
      settings: Preferences
      origin: Provenance
    }
  }
}
