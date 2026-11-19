// Where a session lives: the Orca tab, desktop app session or window that clicking its row takes the person to.

import AppKit

/// Where a session lives, which is where clicking its row takes the person.
enum Place: Equatable {
    /// A terminal tab of Orca, by its handle.
    case orca(String)
    /// A session of the Claude desktop app, by the id the app gives it.
    case desktop(String)
    /// A window of some other app, as a terminal's: the app is all that can be brought forward.
    case app(pid_t)
    case nowhere

    /// One of each kind, as the Ayuda window shows them.
    static let kinds: [Place] = [.orca(""), .desktop(""), .app(0), .nowhere]

    /// What clicking the row does, as the Ayuda window says it.
    var meaning: String {
        switch self {
        case .orca: return Text.placeOrcaHelp
        case .desktop: return Text.placeDesktopHelp
        case .app: return Text.placeAppHelp
        case .nowhere: return Text.placeNowhereHelp
        }
    }

    /// The name of the app clicking the row brings forward.
    var appName: String? {
        switch self {
        case .orca: return "Orca"
        case .desktop: return Text.claudeApp
        case .app(let pid): return NSRunningApplication(processIdentifier: pid)?.localizedName
        case .nowhere: return nil
        }
    }

    /// The icon of the app clicking the row brings forward.
    var icon: NSImage? {
        let workspace = NSWorkspace.shared
        switch self {
        case .orca:
            return workspace.urlForApplication(withBundleIdentifier: orcaBundleID)
                .map { workspace.icon(forFile: $0.path) }
        case .desktop:
            return URL(string: "claude://").flatMap(workspace.urlForApplication(toOpen:))
                .map { workspace.icon(forFile: $0.path) }
        case .app(let pid): return NSRunningApplication(processIdentifier: pid)?.icon
        case .nowhere: return nil
        }
    }
}

/// Where the session lives; nil when a `ps` did not answer, which says nothing of where it is,
/// where `.nowhere` says it has no window to be taken to.
func place(of session: Session) -> Place? {
    // the app's own links take that id and no other (claude://code/continue?session=local_…)
    if session.desktopID.range(of: #"^local_[A-Za-z0-9-]{1,64}$"#, options: .regularExpression) != nil {
        return .desktop(session.desktopID)
    }
    guard let environment = run("/bin/ps", ["eww", "-p", String(session.pid)]) else { return nil }
    if let handle = orcaHandle(in: environment) { return .orca(handle) }
    // otherwise the first of its ancestors that is an app with windows of its own: its terminal
    var pid = session.pid
    for _ in 0..<16 {
        guard let output = run("/bin/ps", ["-o", "ppid=", "-p", String(pid)]) else { return nil }
        guard let parent = pid_t(output.trimmingCharacters(in: .whitespacesAndNewlines)), parent > 1 else { break }
        if NSRunningApplication(processIdentifier: parent)?.activationPolicy == .regular { return .app(parent) }
        pid = parent
    }
    return .nowhere
}
