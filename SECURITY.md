# Security policy

## Supported versions

Only the latest version of each mod gets fixes. Each mod's version is in its `.claude-plugin/plugin.json`.

## Reporting a vulnerability

Report it privately through GitHub: in this repository's **Security** tab, choose **Report a vulnerability**. Do not
open a public issue for it.

Include the mod, its version, the Claude Code version, and the steps that reproduce the problem.

## Scope

Mods run inside Claude Code with your user's privileges, and some of them run shell commands, so these are in scope:

- a mod that reads, writes or runs more than its description says;
- anything a mod shows or sends that leaks data from your session or machine.

The guards (`guard-commit`, `guard-edit`, `guard-outward`, `guard-pnpm`) are workflow rules, not a sandbox: a command that gets past one
is a bug to report as an issue. Bugs in Claude Code itself or its hooks API go to Anthropic, not here.
