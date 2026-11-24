# No coverage threshold

**Status:** approved by the owner. The gate measures no coverage and holds none; this is a decided deviation, not a
gap waiting to be closed.

**Practice set aside:** a 100 % coverage threshold, for the hooks modules.

**Why:** `claude plugin test` runs the tests inside the Claude Code binary and has no coverage option, so the only
ways to measure it are a second runtime or an instrumented copy of the code (both rejected, below). Correctness, the
value the threshold protects, rests on every change coming with its test (AGENTS.md, "Non-negotiables"). The mutants
a mod lists in `tests/mutants.json` can show, when run by hand with `pnpm mutate`, a behaviour no test holds; the
owner made them optional, so no hook or gate runs them.

**When to revisit:** if `claude plugin test` gains a coverage option, the gate can hold 100 % with it.

**Decided by:** the owner, who also rejected:

- Measuring the engine-free modules apart, under Node: a second test runner, for part of the code only.
- Instrumenting a copy of the hooks with istanbul, as some mods do: it hangs on the engine's undocumented behaviour,
  so a Claude Code update can break it.
