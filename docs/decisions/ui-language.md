# The UI in Spanish only, for now

**Decided by:** the owner.

**What:** UI copy, and the prompts that make models write for the person (session-title, ui-companion, ui-colorify),
are in Spanish only. Code, comments, docs, manifests and commits stay in English.

**Value weighed:** changeability. A second language would mean an i18n layer in every mod before anyone needs it
(simplicity wins until a second language is planned for real).

**How a translation stays cheap:** each mod keeps its strings in one `TEXT` object in `hooks/text.ts`, and the pet in
`enum Text` in `pet/app/Text.swift`, so a translation replaces one file. Values that are also stored or matched (the
companion's mode ids, the pet's moods, events and animations) stay as ids in the code, so a translation does not
change what is saved.

**Rejected:** i18n from the start, for a language nobody has asked for yet.
