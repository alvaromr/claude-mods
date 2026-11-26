# One version per mod, below 1.0.0

**Decided by:** the owner.

**What:** each mod has its own SemVer, set only in its `plugin.json`. Versions stay below 1.0.0 while the engine's
hooks API is early access.

**Why one per mod:** each mod installs and updates alone, so one version for the whole marketplace would bump mods
that did not change and tell their users nothing.

**Why below 1.0.0:** the mods run on Claude Code's hooks API, which may change between releases without notice. A
1.x would promise that only a major breaks a mod, while an engine update can break one with no change of ours.

**How:** `pnpm release <mod> <version>` ([scripts/release.mjs](../../scripts/release.mjs)) bumps it, moves the mod's
entries in `CHANGELOG.md` from Unreleased to the version, points the mod's entry in the marketplace at the new tag,
commits through the gate and tags it with `claude plugin tag <mod>` (`<mod>--v<version>`). A mod never tagged is
released first at the version it has. An entry that names other mods too is split by hand first. The commit and its
tag are pushed together, `git push --follow-tags`: until the tag is on GitHub, the marketplace names a tag an install
cannot find.

**Rejected:** one version for the marketplace, as above; 1.0.0 now, until the hooks API is stable.
