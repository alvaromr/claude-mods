# No coverage threshold, until the tool can measure it

**Status:** open. This is a gap, not a deviation: the owner wants coverage measured, and the gate holds 100 % once the
tool can measure it.

**Why there is none:** `claude plugin test` runs the tests inside the Claude Code binary and has no coverage option, so
the gate cannot measure one.

**What stands in:** mutation testing by hand. A mod's `tests/mutants.json` lists mutants, each
`{ file, from, to, why }` breaking one behaviour, and [scripts/mutate.mjs](../../scripts/mutate.mjs) fails on one the
tests let through, or one whose `from` is gone. Every mod lists one per behaviour it promises, and a new mod does too.
The mutants run side by side, a quarter of the cores by default (`MUTATE_JOBS` sets another number), and in the
background (`taskpolicy -b` on macOS, `nice` elsewhere), so the machine stays usable.

**Rejected, by the owner:**

- Measuring the engine-free modules apart, under Node: a second test runner, for part of the code only.
- Instrumenting a copy of the hooks with istanbul, as some mods do: it hangs on the engine's undocumented behaviour,
  so a Claude Code update can break it.
