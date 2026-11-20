# No coverage threshold: mutants stand in

**Status:** approved by the owner. The gate measures no coverage and holds none; this is a decided deviation, not a
gap waiting to be closed.

**Practice set aside:** a 100 % coverage threshold, for the hooks modules.

**Why:** `claude plugin test` runs the tests inside the Claude Code binary and has no coverage option, so the only
ways to measure it are a second runtime or an instrumented copy of the code (both rejected, below). Correctness,
the value the threshold protects, is held instead by mutation testing: every behaviour a mod promises has a mutant
that the tests must kill, which says more than a line count about whether the tests hold that behaviour.

**What stands in:** a mod's `tests/mutants.json` lists mutants, each `{ file, from, to, why }` breaking one
behaviour, and [scripts/mutate.mjs](../../scripts/mutate.mjs) fails on one the tests let through, or one whose `from`
is gone. Every mod lists one per behaviour it promises, and a new mod does too. The mutants run side by side, a
quarter of the cores by default (`MUTATE_JOBS` sets another number), and in the background (`taskpolicy -b` on
macOS, `nice` elsewhere), so the machine stays usable. They run only for the mods whose files changed since a run
that killed them all, as `pnpm mutate` in AGENTS.md says.

**When to revisit:** if `claude plugin test` gains a coverage option, the gate can hold 100 % with it.

**Decided by:** the owner, who also rejected:

- Measuring the engine-free modules apart, under Node: a second test runner, for part of the code only.
- Instrumenting a copy of the hooks with istanbul, as some mods do: it hangs on the engine's undocumented behaviour,
  so a Claude Code update can break it.
