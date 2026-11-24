// The pet's own tests: what it works out with no window on screen. Run by
// test.sh, in a home of their own (CFFIXED_USER_HOME) that these write to.
// Each of the other files holds the tests of one concern, as functions this one runs in order:
// only a file called main.swift may have code outside a function.

import AppKit

Settings.register()

// Run from a git hook, as the gate is, git's own variables would point every command at that repository:
// these must act on their own folders alone.
for name in ProcessInfo.processInfo.environment.keys where name.hasPrefix("GIT_") { unsetenv(name) }
// The tests run in a git worktree of their own, so a session with no folder, which is of the folder the pet
// runs in, shows whether git was asked of it: git would name the repository the worktree was made from.
let started = home.appendingPathComponent("started").path, here = home.appendingPathComponent("here").path
_ = run("/usr/bin/git", ["init", "-q", started])
_ = run("/usr/bin/git", [
    "-C", started, "-c", "user.name=pet", "-c", "user.email=pet@example.com", "commit", "-q", "--allow-empty",
    "-m", "start",
])
_ = run("/usr/bin/git", ["-C", started, "worktree", "add", "-q", here])
FileManager.default.changeCurrentDirectoryPath(here)

settingsTests()
groupTests()
liveSessionTests()
projectTests()
sessionFileTests()
processTests()
programTests()
messageTests()
scheduleTests()
scheduleStartTests()
serverTests()
backgroundTests()
growthTests()
failureTests()
orcaTests()
orcaChatTests()
orcaOpenTests()
orcaRevealTests()
botTests()
sparkTests()
windowTests()

print(failures == 0 ? "all passed" : "\(failures) failed")
exit(failures == 0 ? 0 : 1)
