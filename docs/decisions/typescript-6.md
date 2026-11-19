# TypeScript stays on 6

**What:** `typescript` is pinned to the last 6.0 release while 7 is out.

**Why:** the typed lint runs on typescript-eslint, whose peer range is `typescript >=4.8.4 <6.1.0` in its latest
release (8.73.0). TypeScript 7 would leave the lint unsupported, and the lint is part of the gate.

**When to revisit:** once a typescript-eslint release, past the release-age wait, supports TypeScript 7; `pnpm outdated`
shows both.
