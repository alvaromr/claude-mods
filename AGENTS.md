# claude-mods

A Claude Code marketplace of mods: plugins with a hooks module that change Claude Code's own interface and behaviour.

## Commands

Run each from the repo root:

- Once after cloning: with the Node that `.node-version` pins, which the gate checks, `pnpm install`. It installs the
  tools and points git at `.githooks/`: the pre-commit hook runs the gate without the mutants, which take minutes,
  on the staged mods alone when nothing else but the root's Markdown is staged; the commit-msg hook checks the
  subject's length; the pre-push hook runs every mod's mutants and the audit.
- Gate: `pnpm check` runs [scripts/check.sh](scripts/check.sh): formatting, lint (typed and strict; ShellCheck for
  every shell script), the
  marketplace, the scripts' tests, and each mod's manifest, tests (`tests/*.test.sh` too, for its shell scripts),
  types and, where it lists them, mutants; then [scripts/smoke.sh](scripts/smoke.sh), a real Claude Code that loads
  every mod with a configuration of its own and no login, so it asks no model; on macOS, the pet's SwiftLint, strict,
  and native tests too. Then [scripts/check.test.sh](scripts/check.test.sh) proves the gate fails on each kind of breakage.
- Fix: `pnpm fix` formats, applies the linter's fixes and runs the gate.
- Audit: `pnpm audit` reports the dependencies' known vulnerabilities.
- One mod alone: `claude plugin test <mod>`, `claude plugin validate <mod>`, `pnpm exec tsc -p <mod>`,
  `node scripts/mutate.mjs <mod>`, `sh scripts/smoke.sh <mod>`.
- Engine types: a mod's `tsconfig.json` extends `<mod>/.claude-plugin/types/`, which the engine writes, for its own
  build, each time it loads the mod from a folder it watches. To write or refresh them, after cloning or updating
  Claude Code: `CLAUDE_CODE_PLUGIN_DIR_WATCH=1 claude -p --plugin-dir ./<mod> 'Reply with: ok'`.
- Icons: `node scripts/icons.mjs` draws every mod's `.claude-plugin/icon.png` from [scripts/icons.mjs](scripts/icons.mjs)
  (macOS); how they look is in DESIGN.md.
- Style: `.prettierrc.json`, `.editorconfig`, `eslint.config.mjs` and `.swiftlint.yml`.

## Architecture

- One mod per top-level folder, all listed in `.claude-plugin/marketplace.json`. Each holds
  `.claude-plugin/plugin.json`, its icon in `.claude-plugin/icon.png`, `hooks/hooks.json` naming its hooks module, the module in `hooks/`, the shell
  scripts it runs, if any, in `scripts/` (code in a string escapes the gate), its tests in `tests/` and, when it
  keeps values in `$.state`, their contract in `types/index.d.ts`.
- A hooks module reaches everything outside it through `$`; it has no DOM and no Node.
- Logic that needs no engine (no `$`, no JSX, no value imported from `claude-code`) lives in modules of its own in
  `hooks/`, each with its test named after it, which calls it directly; `register` and the files that draw only wire
  it to `$`, the state and the screen.
- `pet` is a native macOS app (`pet/app/`) that the mod only opens and closes.
- How mods look, draw, store settings and notify: [DESIGN.md](DESIGN.md). Follow it when creating or changing a mod.

## Non-negotiables

- Every change comes with its test, and the commands above pass — a red check means a broken mod in someone's session.
- English for code, comments, docs, manifests and commit messages — the shared language of any contributor.
- Commit subjects in the imperative, at most 72 characters — history is read to understand intent.
- Nothing personal or machine-specific in the repo: no secrets, paths, company data or one developer's setup — the
  repo is to be published, and history keeps whatever enters it.
- A change updates everything it affects in the same commit: code, tests, manifests, DESIGN.md, README, changelog.

## Decisions

Before changing a practice, read [docs/decisions/](docs/decisions/): one file per decision, with what it weighs, why,
who decided and what was rejected. The rules they leave for contributors:

- UI copy is in Spanish only, each mod's in one `TEXT` object in `hooks/text.ts` and the pet's in `pet/app/Text.swift`;
  stored or matched values stay as ids ([ui-language](docs/decisions/ui-language.md)).
- Each mod has its own version, below 1.0.0, set only in its `plugin.json` and released with
  `pnpm release <mod> <version>` ([versioning](docs/decisions/versioning.md)).
- Mods share no code; a helper two mods need is written in each ([shared-code](docs/decisions/shared-code.md)).
- No coverage threshold until `claude plugin test` can measure it; each mod's `tests/mutants.json` lists one mutant
  per behaviour it promises, a new mod's too ([coverage](docs/decisions/coverage.md)).
- TypeScript stays on 6 until typescript-eslint supports 7 ([typescript-6](docs/decisions/typescript-6.md)).

## Where things live

- What the repo is, install and requirements: [README.md](README.md).
- User-facing changes: [CHANGELOG.md](CHANGELOG.md).
- Licence: [LICENSE](LICENSE).
- How to report a vulnerability: [SECURITY.md](SECURITY.md).
