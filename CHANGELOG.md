# Changelog

All notable changes to these mods are recorded here, in the [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
format. Each mod is versioned on its own with [Semantic Versioning](https://semver.org/spec/v2.0.0.html), so every
entry names its mod.

## [Unreleased]

### Fixed

- `pet`: a session in a git worktree goes by the project the worktree was made from, not by the worktree's folder.
- `pet`: a chat Orca runs, a worker's or a bot's, goes by the title and project Orca shows for it, and pressing its
  row brings its tab forward in Orca, where it said «sin ventana que abrir».

## [session-title 0.3.0] - 2026-11-24

### Changed

- `session-title`: a title is a short phrase in Spanish, «Comparar facturas de luz», as Claude Code's own titles
  are: in sentence case, with its accents and spaces, not words joined by dashes. It is still at most 60
  characters, now cut after a whole word.
- `session-title`: Haiku is asked to start a title with its topic and to leave out ids, codes and people's names,
  and a word of its reply that reads as an id, a hash, a uuid or a long number, is dropped from the title.
- `session-title`: a long session is titled again at its 10th and 30th prompts, from its first two and its last
  five, so its title follows where it went; only those seven prompts are kept.
- `session-title`: the debug log says why a prompt is left out, as a slash command, Claude Code's or Orca's own
  text, one too short or one said before, and why a prompt that counts makes no title.

### Fixed

- `session-title`: a session given an Orca worker's brief, typed or pasted, is titled after its task, what follows
  the brief's `=== TASK ===` line, not after Orca's own instructions; Orca's notices in the prompt box, and a prompt
  said again, no longer count among the prompts a title is made from.
- `session-title`: a session with nobody at the prompt, a `claude -p` run or the Agent SDK, is no longer titled, and
  asks Haiku for nothing.

## [ui-linkify 0.5.0] - 2026-11-20

### Added

- `ui-linkify`: an icon, for the plugin listing: a chain link.
- `ui-linkify`: each proposed `! command` has a ⧉ right of its ▶ that copies it to the clipboard (macOS), to paste
  in a terminal: a ▶ run has no keyboard, so a command that asks for input, as a passphrase, ends without asking.
- `ui-linkify`: while a Jira project's key is typed in the prompt box, the autocomplete offers the tickets of the
  branch and of the recent commits.
- `ui-linkify`: the `[Image #n]` of a prompt is a link that opens the original Claude Code keeps in its temp folder,
  which Claude Code's own row under the picture does not always link.
- `ui-linkify`: each `! command` an assistant message proposes is a row with a ▶ that runs it in the session's folder
  and hands Claude what it printed, as bash mode does.
- `ui-linkify`: while the command runs, its output shows as it comes, and a ■ in place of the ▶ stops it.

### Changed

- `ui-linkify`: a ▶ command's output is cut at 30,000 characters per stream, saying how much was left out, and a
  second press on ▶ stops the run.
- `ui-linkify`: pasting an image is no longer slow: the images are looked up after the drawing, not before it. Under
  the fullscreen layout the box's pictures take at most half the band, so they hide none of the other mods' rows.
- `ui-linkify`: a terminal that drops the pictures, as Orca on a tab switch, gets every one sent again at the first
  key typed after a 5 s pause, besides the ↻ under each.
- `ui-linkify`: in the mobile app its pane shows its settings, which the app now draws as fields, in place of a line
  sending you to the terminal.
- `ui-linkify`: the footer button's dot is hollow while every part is off, so its state does not rest on color alone.
- `ui-linkify`: a read that fails leaves its cause in the debug log.

### Fixed

- `ui-linkify`: a ▶ command that asks in the terminal, as `sudo` does for a password, no longer takes the keys and
  the mouse from the prompt box, leaving stray characters in it: it runs without the terminal and ends without
  asking. It needs `perl`, which macOS ships.
- `ui-linkify`: a path not written yet no longer links its folder; paths next to “ ” ‘ ’ — … | { } [ ] = are linked;
  `~/` paths are not linked without a `HOME`.
- `ui-linkify`: only `! command`, with its space, is a proposed command, CRLF lines included; commands are drawn and
  run without control, bidi or zero-width characters; their output can no longer forge `<bash-*>` rows; a run left
  «running» by a reload shows as stopped; a command no longer fails to start when its shell already leads its group.
- `ui-linkify`: pasted images are forgotten on `/clear` and new sessions, a miss is looked up again after 5 s, and an
  unreadable conversation no longer redraws forever.
- `ui-linkify`: a large screenshot pasted into the box shows above it too: its file, which Claude Code writes seconds
  after the paste, is looked for up to 10 s, not 2.
- `ui-linkify`: another session's metadata file, half written or empty, no longer stops the session's title.
- `ui-linkify`: a resumed conversation is not titled after the ticket the previous one named.
- `ui-linkify`: a path named before its file was written is linked once the file is there.
- `ui-linkify`: a `! command` in a code fence indented under a list item gets its ▶ too.
- `ui-linkify`: a ▶ command that ends printing nothing says «hecho, sin salida» under its box.
- `ui-linkify`: a `! command` named as a code span is boxed right under its line, not after its whole paragraph, so
  each item of a list keeps its own box.
- `ui-linkify`: a ▶ command that prints escape sequences, such as colors or links, shows its output without them
  instead of failing to draw its message; Claude still gets the output as printed.

## [pet 0.3.0] - 2026-11-20

### Added

- `pet`: an Orca bot's chat goes by the bot's name, with the chat's title beside it, and pressing its row opens that
  bot in Orca.
- `pet`: an icon, for the plugin listing: the pet's spark at the corner of a window.

### Changed

- `pet`: renamed from `mascota`, so every mod has an English name. The command is now `/pet`, and `/pet salir`
  closes it; installed as `mascota`, it is installed again as `pet`, and its settings start afresh.
- `pet`: a command left running in the background that listens on a port, as a dev server, no longer keeps its
  session in «Trabajando»: the session waits for you, its row says «servidor en marcha» with the ports, and closing
  it asks first.
- `pet`: «Salir», from the pet or with `/pet salir`, keeps it closed until the next `/pet`, in place of
  the next session opening it again.
- `pet`: a read that fails, and an icon the server refuses, leave their cause in the system log, each once.

### Fixed

- `pet`: a session whose background command listens only on ports the system picks (a test or mutation run, a
  debugger) is in «Trabajando» until it ends, no longer in «Esperan» as if it had left a server running.
- `pet`: `/pet` says why when its launcher cannot run at all.
- `pet`: a command or subagent stopped with `TaskStop` no longer keeps its session in «Trabajando».
- `pet`: a session resumed with `--resume` no longer counts its earlier process's `/loop` or reminder as still
  to run; background work launched long before the last look still counts as running.
- `pet`: the launcher recompiles when the sources change, whatever their dates, and concurrent launches no longer
  compile or restart the pet over each other.
- `pet`: a session file left by a dead process whose pid was reused, or with an invalid pid, no longer shows as
  live; one unreadable for a moment no longer ends and restarts its session; a place not found is asked again.
- `pet`: «Cerrar sesión» works when Claude Code tells no process start; a hung `ps` or `orca` no longer freezes
  the pet; `/pet` still opens the pet when its registration fails.

## [ui-mods 0.3.0] - 2026-11-20

### Added

- `ui-mods`: an icon, for the plugin listing: two switches.
- `ui-mods`: the pane lists the mods built into Claude Code too, under «builtin», each with its switch but
  `cc-plugin-sec-default`, which cannot be turned off.

### Changed

- `ui-mods`: a plugin file it cannot read leaves its cause in the debug log.

### Fixed

- `ui-mods`: a switch pressed while the list is being read is no longer undone by that read.
- `ui-mods`: switches run one at a time and the list is read back once they settle, a refused one saying why; a
  list read during a switch is read again; a plugin installed in two scopes is two rows, each switched in its own
  scope; the «sin aplicar» mark is cleared before the reload runs.

## [ui-companion 0.3.0] - 2026-11-20

### Added

- `ui-companion`: an icon, for the plugin listing: two speech bubbles.

### Changed

- `ui-companion`: in the mobile app the pane shows its settings, which the app now draws as fields, in place of a
  line sending you to the terminal.
- `ui-companion`: the pane's title is in Spanish.
- `ui-companion`: the footer button's dot is hollow while no mode comments, so its state does not rest on color alone.
- `ui-companion`: a read that fails leaves its cause in the debug log.

### Fixed

- `ui-companion`: a model the engine refuses no longer stops the other modes; errors are kept per mode; redo replaces
  the note it was made from even if another was discarded meanwhile; after a compaction the kept texts read the new
  transcript whole.

## [bar-path 0.3.0] - 2026-11-20

### Added

- `bar-path`: an icon, for the plugin listing: `~/`.

### Changed

- `bar-path`: in the mobile app the pane shows its settings, which the app now draws as fields, in place of a line
  sending you to the terminal.
- `bar-path`: a read that fails leaves its cause in the debug log.

### Fixed

- `bar-path`: the row follows a `/cd` or a shell `cd` at once, and a subagent's end no longer shows its own folder.
- `bar-path`: the row keeps the folder of a shell `cd` instead of flipping back.
- `bar-path`: changes made together in the pane keep each other's, and a start that fails, or a store that cannot be
  read, is logged instead of failing the session; a save or a forget the store refuses says why in a toast and leaves
  the changes shown as unsaved.

## [bar-limits 0.3.0] - 2026-11-20

### Added

- `bar-limits`: an icon, for the plugin listing: a ring nearly full.

### Changed

- `bar-limits`: in the mobile app the pane shows its settings, which the app now draws as fields, in place of a line
  sending you to the terminal.
- `bar-limits`: a refused or failed read of the usage endpoint leaves its cause in the debug log, as other failed
  reads do.

### Fixed

- `bar-limits`: a change of the windows within a minute of the last read of the per-model limits is read once that
  minute is over.
- `bar-limits`: an empty number in the pane no longer saves 0, and `0x10` or `1e2` are refused.
- `bar-limits`: a store that cannot keep the last reading no longer stops the usage measure.
- `bar-limits`: changes made together in the pane keep each other's, and a start that fails, or a store that cannot
  be read, is logged instead of failing the session; a save or a forget the store refuses says why in a toast and
  leaves the changes shown as unsaved.

## [bar-git 0.3.0] - 2026-11-20

### Added

- `bar-git`: an icon, for the plugin listing: a branching fork.

### Changed

- `bar-git`: in the mobile app the pane shows its settings, which the app now draws as fields, in place of a line
  sending you to the terminal.
- `bar-git`: a read that fails leaves its cause in the debug log.

### Fixed

- `bar-git`: the row follows a `/cd` or a shell `cd` at once, and a subagent's end no longer shows its own
  repository.
- `bar-git`: within a long turn, the row is read again a second after the last tool that may change the repository.
- `bar-git`: a git read that fails or times out no longer hides the row, only the lines; the file count and the line
  counts cover the same files, an untracked folder counted file by file, and staged files count their lines in a
  repository with no commit yet; a slow read no longer overwrites a newer one; a button's refused prompt says so.
- `bar-git`: the row keeps the folder of a shell `cd` instead of flipping back.
- `bar-git`: changes made together in the pane keep each other's, and a start that fails, or a store that cannot be
  read, is logged instead of failing the session; a save or a forget the store refuses says why in a toast and leaves
  the changes shown as unsaved.

## [bar-context 0.3.0] - 2026-11-20

### Added

- `bar-context`: an icon, for the plugin listing: a meter of blocks.
- `bar-context`: a click on the row's model or effort offers the other models (`default`, `opus`, `sonnet`, `haiku`,
  `fable`) or levels (`low` to `max`), and switches as `/model` and `/effort` do.

### Changed

- `bar-context`: in the mobile app the pane shows its settings, which the app now draws as fields, in place of a line
  sending you to the terminal.
- `bar-context`: a read that fails leaves its cause in the debug log.

### Fixed

- `bar-context`: the row shows the model switched to with `/model`, and the one each request runs on.
- `bar-context`: an empty number in the pane no longer saves 0, and `0x10` or `1e2` are refused.
- `bar-context`: `claude-opus-4-6[1m]` reads as Opus 4.6, not Opus 4; a compaction a hook vetoed says so and leaves
  the window as it was; the expired-cache warning can no longer come back from a stale check.
- `bar-context`: changes made together in the pane keep each other's, and a start that fails, or a store that cannot
  be read, is logged instead of failing the session; a save or a forget the store refuses says why in a toast and
  leaves the changes shown as unsaved.

## [ui-colorify 0.1.0] - 2026-11-20

### Added

- `ui-colorify`: first release: in the terminal, the GitHub alerts of an assistant reply (`> [!NOTE]`, `[!TIP]`,
  `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]`) and a quote without a marker drawn in a box, between two lines or under
  a title of their colour, without the marker, each with a ⧉ that copies its text; the headings bold in a colour; your
  own prompts in a box or between two lines; and a section of the system prompt that teaches Claude to write the
  alerts, few and only where they matter. A button in the footer's first row opens a pane with every colour, frame
  and title, and a switch that turns the whole mod off.
- `ui-colorify`: an icon, for the plugin listing: three circles that blend.

## [ui-declutter 0.2.0] - 2026-11-20

### Added

- `ui-declutter`: an icon, for the plugin listing: rows folded into one.

### Changed

- `ui-declutter`: the pane's title is in Spanish.
- `ui-declutter`: the footer button's dot is hollow while it is off, so its state does not rest on color alone.
- `ui-declutter`: a read that fails leaves its cause in the debug log.

### Fixed

- `ui-declutter`: a `web-fetch` agent, which Claude Code draws as `Fetch` where a session has no `WebFetch`, joins
  its span as a web lookup, its result with it, in place of ending the span.
- `ui-declutter`: a stopped task (`Stop Task`) and the notice that a background task ended
  (`Background command … completed`) join their span, in place of each drawing on its own and ending it. So do the
  calls that look at tasks (`TaskOutput`, `TaskList`, `TaskGet`, `CronList`), `Monitor`, `ListAgents` and
  `ScheduleWakeup`.
- `ui-declutter`: a prompt that quotes a task notification is no longer taken for one; a prompt typed beside a call's
  result ends the span; a task that notifies more than once leaves its notices to Claude Code; a new notice redraws
  the rows before it.
- `ui-declutter`: ctrl+o and `--verbose` draw lone calls and their results as Claude Code does, and a span still
  draws when part of it was unfolded; interrupted calls say «stopped»; times never read «1m 60s».
- `ui-declutter`: rows are laid out in terminal cells (CJK, emoji) and fit narrow screens; results missing from the
  transcript file are read again; one read serves concurrent draws; long diffs no longer lag; a new conversation
  forgets the last one's state.
- `ui-declutter`: when its jq check cannot run, it leaves every row to Claude Code and says why under the prompt,
  instead of taking jq as installed.

## [session-title 0.2.0] - 2026-11-20

### Added

- `session-title`: an icon, for the plugin listing: a session's tab with its name.

### Changed

- `session-title`: a call that fails leaves its cause in the debug log.

### Fixed

- `session-title`: another session's metadata file, half written or empty, no longer stops the session's title.
- `session-title`: the title carried over `/clear` no longer goes through the store all sessions share, and prompts
  that start with a path or `<` are titled; only slash commands and Claude Code's own text are skipped.

## [guard-outward 0.2.0] - 2026-11-20

### Added

- `guard-outward`: an icon, for the plugin listing: an arrow going out, on a shield.
- `guard-outward`: first public release: `git push`, `gh` commands that write, the commands listed in its `commands` option and MCP
  tools that are not reads ask a person in every mode; the auto mode's classifier cannot approve them, and where
  nobody can be asked they are refused.

### Fixed

- `guard-outward`: asks before `url=$(gh pr create)`, `` x=`git push` ``, `gh pr -R owner/repo merge`, a command line
  given to `bash -c` or `eval`, wrappers with options (`timeout 60`, `sudo -u me`, `nice -n 5`),
  `git -C "my repo" push`, and a `gh api graphql` query it cannot see.
- `guard-outward`: asks for pushes behind quoted assignments, shell options, `eval`, more wrappers,
  `git subtree`, `lfs`, `svn`, `submodule foreach` and inline aliases; classifies MCP tools by their leading verb,
  and no longer trusts an MCP tool's own read-only claim.

## [guard-edit 0.2.0] - 2026-11-20

### Added

- `guard-edit`: an icon, for the plugin listing: a `+` and a `−` on a shield.

### Changed

- `guard-edit`: no change in what it denies; its command reading is simpler inside.

### Fixed

- `guard-edit`: the command a `Monitor` runs is checked as a Bash one.
- `guard-edit`: a command with a `\r` or a no-break space no longer hangs the hooks.
- `guard-edit`: catches `sed -i''`, `perl -pi'.bak'`, a command line given to `bash -c` or `eval`, `cp` into a folder
  named without a slash, `git -C dir apply` and paths through `/tmp/..`; `git apply --check` and
  `patch --dry-run` pass.
- `guard-edit`: finds writes past shell keywords and wrappers (`if`, `{ }`, `!`, `env`, `timeout`, `sudo -u`,
  `xargs`, `find -exec`), in `$(...)`, backticks, `>(...)`, heredocs and pipes into a shell, after a subshell or
  `cd -`, and with `cp`/`mv -t`; a here-string is no longer read as a heredoc, nor `>` inside `[[ ]]` as a
  redirection.
- `guard-edit`: a command its own check fails on is denied, as `guard-commit` and `guard-pnpm` do, in place of
  running unchecked.

## [guard-commit 0.2.0] - 2026-11-20

### Added

- `guard-commit`: an icon, for the plugin listing: a commit on a shield.
- `guard-commit`: first public release: denies commands that attribute a commit or PR to Claude, or sign one.

### Fixed

- `guard-commit`: denies `git tag -sm`, `git -C dir commit -S`, and `commit.gpgsign` set to `1`, `yes`, `on` or a
  quoted `true`; reading the signing settings, `git log --grep=revert -S` and `-S` in a message pass.
- `guard-commit`: refuses signing hidden in a nested shell, `eval`, quoted flags or settings, `-c` and
  `GIT_CONFIG_*` forms, option prefixes (`--gpg`, `--sig`) and behind `--work-tree`-style options; reads that
  follow a commit, or that merely name a trailer, pass.
- `guard-commit`: a `git tag` that lists or names tags, with no message, no longer counts as a write, so a line that
  also greps for a trailer runs.

## [guard-pnpm 0.2.0] - 2026-11-20

### Added

- `guard-pnpm`: an icon, for the plugin listing: a package on a shield.
- `guard-pnpm`: first public release: denies npm, npx and yarn.

### Fixed

- `guard-pnpm`: text in quotes or in a heredoc fed to another command is no longer read as a command
  (`git commit -m "Drop (npm) support"`, `rg "yarn|npm"`); catches npm, npx and yarn by a path, behind wrappers with
  options, and in a command line given to `bash -c` or `eval`.
- `guard-pnpm`: refuses npm, npx and yarn behind here-strings, heredocs piped to a shell, quoted or escaped command
  words, shell options before `-c`, nested shells, `eval` and more wrappers; `command -v npm`, `sudo -l npm` and
  `npm=1` pass.
