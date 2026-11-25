# Mod design

How the mods in this repo look and are configured. It holds for every new mod; one that departs from it says so in
its code, and why.

## Names

- A mod's name says what it does, lowercase with hyphens, with a prefix by kind:
  - `bar-`: a row of the prompt's footer in the style of a status line: `bar-git`, `bar-path`.
  - `ui-`: a button in row 1 of the footer that opens its pane: `ui-linkify`, `ui-declutter`.
  - `guard-`: denies tool calls, or puts them to the person: `guard-pnpm`, `guard-edit`, `guard-outward`.
  - No prefix for a mod of none of these kinds, which draws nothing in the footer: `pet`, `session-title`.
- The pane's title is short, one or two words, in the UI's language: «Git», «Ruta», «Límites». Pane tabs share the
  width, and a long title pushes the others out.

## Icons

Each mod has an icon, `.claude-plugin/icon.png`: the listing icon Claude Code takes from a plugin, kept only the first
time the plugin is saved in the developer portal, and the one README.md shows. They are drawn in
[scripts/icons.mjs](scripts/icons.mjs) and made with `node scripts/icons.mjs` (macOS, for `sips`); a new mod adds its
glyph there. All of them follow the same rules, so the fifteen read as one family:

- A square of 96 units with corners of 24, filled with the colour of the mod's kind, the prefix of its name: one teal
  for `bar-`, one amber for `guard-`, one indigo for `ui-` and one green for none (`KIND_COLORS` in the script). A
  faint white rim lifts it off any background.
- One glyph that says what the mod does, flat, in a single warm white used at two strengths: full for what the mod is
  about, translucent for what frames it. No gradients, no outlines in other colours, no text.
- Shapes are solid, and lines thick (7 to 9 units, round ends), so the glyph still reads at 32 px.
- Mods of a kind share a frame where the kind has one: every `guard-` draws its sign on the same translucent shield.
- The glyph names the job, not the mechanism: a fork for `bar-git`, a `+` and a `−` for `guard-edit`, a link for
  `ui-linkify`, a spark over a window for `pet`.
- No third party's mark, so the listing does not present it as the mod's: `pet`'s icon draws a soft asterisk, not
  the Claude mark the pet itself shows.

## Where it draws

- The prompt's footer is split into rows by the slot convention: each element carries the key
  `slot:<row>.<place>:<mod>`, and every mod takes out everyone's and places them again, so the order does not depend on
  which mod draws first. Rows in use: 0 limits, 1 the `ui-` buttons (mods 1.1, companion 1.2, declutter 1.3, linkify
  1.4, colorify 1.5), 9 git, 10 path. A row without a key goes right after the engine's own and before the numbered ones.
- A mod without a row of its own that has settings puts a button with its name in row 1, which opens and closes its
  pane. If the mod can be turned off, the button starts with a dot: a green (`success`) `●` while it works, a
  gray (`inactive`) `○` when off, so the state does not rest on color alone.
- A mod with a row of its own puts a small `⚙` at the row's end that opens and closes its pane.
- If the mod cannot do its job (a tool is missing, a datum is missing, the engine draws it differently), it lets Claude
  Code draw as usual. It never leaves a gap or something half drawn.
- A call that fails and leaves the mod showing less writes its cause to the debug log, through the mod's own `orElse`:
  each mod installs alone, so it keeps its own copy instead of importing another's. A failure the person must act on
  also says so on screen.

## Settings

- Everything the mod shows can be configured in its pane: which parts show, colors, thresholds, texts.
- A change applies to the session at once. At the pane's foot, four buttons: «Guardar para este proyecto» (save for
  this project; highlighted while there are unsaved changes), «Guardar como globales» (save as global), «Olvidar los
  del proyecto» (forget the project's; only if the project has its own) and «Restablecer» (reset to the defaults,
  without saving).
- On start, the session takes the project's settings, else the global ones, else the defaults. They are saved in
  `$.store`: `settings` the global ones and `` `settings:${project root}` `` the project's.
- The pane's header says where they come from («Ajustes de este proyecto», «Ajustes globales», «Ajustes por
  defecto») and adds « · cambios sin guardar» only if the session's differ from what that origin has saved.
- Under each group, a dimmed note explains what is not obvious, in one or two sentences.

## Controls

- Never a `Select`: it can only be worked with the keyboard. Every control is pressed with one click.
- Several exclusive options: a row of buttons. The chosen one is a pill (`  text  ` bold and inverted); the others, dimmed
  buttons. A mod whose values have a color of their own (the companion's modes) paints the pill in that color;
  otherwise, white. Where the options are colors themselves (`ui-colorify`'s), each is drawn in its color and not
  dimmed: dimmed, they look alike and cannot be told apart before one is chosen.
- A value a footer row shows and can change in place (`bar-context`'s model and effort): a click on it swaps it for
  its label and the row of buttons of its options, with a `✕` that closes it; picking one closes it too.
- A yes/no: `■ text` at full intensity when on, `□ text` dimmed when off. No `[x]`, `( )` or `☑`.
- Nothing in the theme's `claude` color to mark what is chosen: some themes draw it red. White, or the color with a
  meaning of its own for the value.
- A text field: the label on the left, outside; the field with a `subtle` background in the terminal, which marks it
  as a field and hugs it (no `flexGrow`). It is validated on Enter; if it does not fit, a toast says what is expected.

## Notices

- A toast goes away by itself after a few seconds: it confirms or rejects an action, never carries something to read.
- What must stay in view goes in a fixed line (`$.ui.status`) or in a box of its own above the prompt.
- A notice box carries the color of what it warns about, a `✕` that removes it and, if there is more detail
  elsewhere, a click on it opens that.

## Texts

- In Spanish, addressing the person as «tú», short sentences. One term per concept; no internal jargon («tramo»).
- «Normal» or its equivalent means «as Claude Code draws it», and is explained that way.

## Behaviour

- A drawing hook writes no state and starts no long work: what must be read or computed is done outside the drawing
  (`$.clock.after`), and when done it draws again. A call that a newer drawing cancels is not kept as a result.
- Start-up happens in `session.start` alone, which every fresh load of a mod raises, a reload's too. A drawing
  before it draws the defaults: a start it set off, even on a timer, could write no state.
