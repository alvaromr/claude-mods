// What pressing a session's row or its Cerrar sesión item does: going to the session, or ending it.

import AppKit

extension Controller {
    /// Takes the person to the session, wherever it lives.
    func open(_ session: Session) {
        switch places[session.pid]?.place ?? .nowhere {
        case .orca(let handle):
            guard let orca = NSWorkspace.shared.urlForApplication(withBundleIdentifier: orcaBundleID) else {
                return refuse(session)
            }
            DispatchQueue.global(qos: .userInitiated).async { [self] in
                let cli = orca.appendingPathComponent("Contents/Resources/bin/orca").path
                if run(cli, ["terminal", "switch", "--terminal", handle, "--json"]) == nil {
                    DispatchQueue.main.async { self.refuse(session) }
                } else {
                    NSWorkspace.shared.openApplication(at: orca, configuration: NSWorkspace.OpenConfiguration())
                }
            }
        case .bot, .desktop:
            let place = places[session.pid]?.place ?? .nowhere
            guard let url = place.link, NSWorkspace.shared.open(url) else { return refuse(session) }
        case .app(let pid):
            guard NSRunningApplication(processIdentifier: pid)?.activate() == true else { return refuse(session) }
        case .nowhere:
            return
        }
        petView.react(to: .opened)
        let isOnlyWaiting = session.group(at: Date()) == .waiting && petView.waiting.count == 1
        let close = Settings.closeOnPress
        if close == .always || close == .onlyWaiting && isOnlyWaiting { hideBubble() }
    }

    /// Ends the session's Claude Code, which keeps its conversation to be resumed. One at work is
    /// asked about first, as is one with a server: the turn it is on, the task it had still to
    /// run or the command, subagents or server it left running are lost.
    func close(_ session: Session) {
        if session.phase == .busy || !session.ports.isEmpty {
            let alert = NSAlert()
            alert.messageText = Text.closeTitle(session.name)
            alert.informativeText = Mark.of(session)?.loss
                ?? (session.ports.isEmpty ? Text.closeWorking : Text.lossServer)
            alert.addButton(withTitle: Text.closeSession).hasDestructiveAction = true
            alert.addButton(withTitle: Text.cancel).keyEquivalent = "\u{1b}"
            NSApp.activate(ignoringOtherApps: true)
            guard alert.runModal() == .alertFirstButtonReturn else { return }
        }
        // it leaves the bubble at the next look, once it is gone
        guard isEndable(session), kill(session.pid, SIGTERM) == 0 else { return NSSound.beep() }
    }

    /// The session's place did not take the person there, as a tab closed under it or Orca
    /// restarting: the row dims until the next look finds where it lives again.
    private func refuse(_ session: Session) {
        places[session.pid] = nil
        render()
    }
}
