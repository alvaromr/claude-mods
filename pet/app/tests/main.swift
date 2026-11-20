// The pet's own tests: what it works out with no window on screen. Run by
// test.sh, in a home of their own (CFFIXED_USER_HOME) that these write to.
// Each of the other files holds the tests of one concern, as functions this one runs in order:
// only a file called main.swift may have code outside a function.

import AppKit

Settings.register()

settingsTests()
groupTests()
liveSessionTests()
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
botTests()
sparkTests()
windowTests()

print(failures == 0 ? "all passed" : "\(failures) failed")
exit(failures == 0 ? 0 : 1)
