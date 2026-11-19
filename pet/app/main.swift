// Desktop pet: the Claude spark floating above every window, with a speech bubble listing the live
// Claude Code sessions (~/.claude/sessions/*.json). This starts it. All the rest lives in the other
// Swift files of this folder, so its tests (tests/main.swift) can build it without the app starting.

import AppKit

let controller = Controller()
NSApplication.shared.delegate = controller
NSApplication.shared.setActivationPolicy(.accessory)
NSApplication.shared.run()
