import type { Found } from './git'
import { scan } from './scan'
import { envSigns } from './signing'

// The gh commands that write a PR, an issue or a release.
const GH_WRITES = /\bgh\s+(?:pr|issue|release)\s+(?:create|edit|comment|merge|review)\b/
const ATTRIBUTION = /co-authored-by|claude-session|noreply@anthropic\.com|generated with \[?claude code/i

/** Why `command` may not run, or undefined where it may. */
export const refusal = (command: string) => {
  const found: Found = { writes: false, signs: false, env: new Map() }

  scan(command, found)

  if ((found.writes || GH_WRITES.test(command)) && ATTRIBUTION.test(command)) {
    return 'commits and PRs carry only the user’s authorship, drop the attribution lines.'
  }

  const isEnvSigning = envSigns(found.env)

  if (found.signs || isEnvSigning) {
    return 'commits and tags are never signed, drop the signing flag or setting.'
  }

  return undefined
}
