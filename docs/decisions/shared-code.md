# Mods share no code

**Decided by:** the owner.

**What:** a helper two mods need is written in each, such as `reasonOf` in each mod's `hooks/failure.ts` or `slotted`
in each mod that draws in the footer.

**Value weighed:** the letter of DRY against changeability. Each mod installs and runs alone; a package they all
depended on would couple their releases, and a change for one mod would ship to all of them.

**Rejected:** a shared package of helpers, for that coupling.
