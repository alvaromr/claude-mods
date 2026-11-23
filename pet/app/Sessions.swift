// The live Claude Code sessions, as ~/.claude/sessions/*.json lists them, and how they are told apart.

import AppKit

/// The bubble's tabs, in order. The Ayuda window lists every one by its `meaning`.
enum Group: CaseIterable {
    case waiting, working, inactive

    var title: String {
        switch self {
        case .waiting: return Text.tabWaiting
        case .working: return Text.tabWorking
        case .inactive: return Text.tabInactive
        }
    }

    /// What the tab says when it has no session.
    var empty: String {
        switch self {
        case .waiting: return Text.emptyWaiting
        case .working: return Text.emptyWorking
        case .inactive: return Text.emptyInactive
        }
    }

    /// Which sessions it holds, as the Ayuda window says it.
    var meaning: String {
        switch self {
        case .waiting: return Text.tabWaitingHelp
        case .working: return Text.tabWorkingHelp
        case .inactive: return Text.tabInactiveHelp
        }
    }
}

/// Where Claude Code says a session is: at work, done with its turn, or stopped halfway on
/// a dialog that only the person can answer (a permission, a question, a plan to approve).
enum Phase { case busy, idle, blocked }

struct Session: Equatable {
    let pid: Int32
    let id: String
    let name: String
    let project: String
    /// The folder it works in, which its project is worked out from (see `project(of:)`).
    var cwd = ""
    var phase: Phase
    /// What a blocked session waits on, in a few words; empty for any other.
    let reason: String
    /// The id the Claude desktop app knows the session by; empty for one it does not host.
    let desktopID: String
    let updated: Date
    /// The id of the Orca bot whose chat it is; empty for one that is no bot's. Its project is then
    /// the bot's name, and its name the chat's title.
    var botID = ""
    /// The person said they have seen what it ended on: it waits for them no more, until it ends again.
    var isSeen = false
    /// It has a task of its own still to run (a /loop, a reminder), so it goes on by itself.
    var isScheduled = false
    /// A command it left running in the background (a build, a commit's hooks) is still at it,
    /// so it goes on by itself too: its end starts a turn.
    var isRunningCommand = false
    /// The ports the servers it left running in the background listen on, in order: a server
    /// runs until stopped, so it does not go on by itself for one.
    var ports: [Int] = []
    /// How many subagents it sent to work in the background are still at it: it goes on by itself
    /// too, as each one's end starts a turn.
    var runningAgents = 0
    /// What the API error its last turn ended on says (a limit hit, the connection lost); empty
    /// when it ended well.
    var failure = ""
    /// When its process started, as `ps -o lstart` says it at UTC; empty when Claude Code does not tell.
    var started = ""
    /// The same, as Claude Code writes it; a command left running before it died with the process before.
    var startedAt = Date.distantPast

    func group(at now: Date) -> Group {
        switch phase {
        case .busy: return .working
        // stuck until answered, however long ago that was
        case .blocked: return .waiting
        case .idle: return !isSeen && now.timeIntervalSince(updated) < Settings.inactiveAfter ? .waiting : .inactive
        }
    }
}

/// The mark a session's row has before its name, one at most: of those that fit, the first in this
/// order. The Ayuda window lists every one, so a new case is explained there by its `meaning`.
enum Mark: CaseIterable {
    case blocked, scheduled, command, agents, failed, server

    /// The one the session has, if any.
    static func of(_ session: Session) -> Mark? {
        allCases.first { mark in
            switch mark {
            case .blocked: return session.phase == .blocked
            case .scheduled: return session.isScheduled
            case .command: return session.isRunningCommand
            case .agents: return session.runningAgents > 0
            case .failed: return session.phase == .idle && !session.failure.isEmpty
            case .server: return !session.ports.isEmpty
            }
        }
    }

    var symbol: String {
        switch self {
        case .blocked: return "exclamationmark.circle"
        case .scheduled: return "clock"
        case .command: return "terminal"
        case .agents: return "person.2"
        case .failed: return "exclamationmark.triangle"
        case .server: return "network"
        }
    }

    var color: NSColor {
        switch self {
        case .blocked: return .systemRed
        case .scheduled, .command, .agents, .server: return .systemBlue
        case .failed: return .systemOrange
        }
    }

    /// What it means, as the Ayuda window says it.
    var meaning: String {
        switch self {
        case .blocked: return Text.markBlockedHelp
        case .scheduled: return Text.markScheduledHelp
        case .command: return Text.markCommandHelp
        case .agents: return Text.markAgentsHelp
        case .failed: return Text.markFailedHelp
        case .server: return Text.markServerHelp
        }
    }

    /// Whether a session done with its turn still goes on by itself, so it is at work.
    var goesOnByItself: Bool { self == .scheduled || self == .command || self == .agents }

    /// What closing the session loses, as asking first says it; nil where that is only its turn.
    var loss: String? {
        switch self {
        case .scheduled: return Text.lossScheduled
        case .command: return Text.lossCommand
        case .agents: return Text.lossAgents
        case .server: return Text.lossServer
        case .blocked, .failed: return nil
        }
    }

    /// What it says of the session in short, in the detail under its name.
    func label(for session: Session) -> String {
        switch self {
        case .blocked: return session.reason
        case .scheduled: return Text.markScheduled
        case .command: return Text.markCommand
        case .agents: return Text.markAgents(session.runningAgents)
        case .failed: return Text.apiError
        case .server: return Text.markServer(session.ports)
        }
    }

    /// What it says of the session when pointed at.
    func tip(for session: Session) -> String {
        switch self {
        case .blocked: return session.reason.prefix(1).uppercased() + session.reason.dropFirst()
        case .scheduled: return Text.tipScheduled
        case .command: return Text.tipCommand
        case .agents: return Text.tipAgents(label(for: session))
        case .failed: return Text.tipFailed(session.failure)
        case .server: return Text.tipServer(session.ports)
        }
    }

    /// Its symbol in its color.
    func image() -> NSImage? {
        NSImage(systemSymbolName: symbol, accessibilityDescription: nil)?
            .withSymbolConfiguration(NSImage.SymbolConfiguration(paletteColors: [color]))
    }
}

/// Claude Code's own words for what a blocked session waits on, in Spanish where they are known.
func reason(_ words: String) -> String {
    let known = [
        "input needed": Text.reasonInput, "dialog open": Text.reasonDialog,
        "sandbox request": Text.reasonSandbox, "goal proposal": Text.reasonGoal,
    ]
    if words.isEmpty { return Text.reasonNeeded }
    return known[words] ?? (words.hasPrefix("approve ") ? Text.reasonApprove(words.dropFirst(8)) : words)
}

/// What a session's file said when it was last read whole, by the file's name, and when. A file
/// is replaced as it is written, so a look can find it half written: the session stays for a few
/// seconds on what it said, as it would end and begin again for the pet otherwise.
private var lastRead: [String: (session: Session, at: Date)] = [:]
private let readGrace: TimeInterval = 10

/// When each live process started, by its pid, and when `ps` said so. A process keeps its start
/// for as long as it lives, so it is asked again only now and then, for a pid it had given up.
private var starts: [Int32: (start: String, at: Date)] = [:]
private let startsRecheck: TimeInterval = 60

/// Whether the session's file is of the process that holds its pid now, not of one that had it
/// before: a file left behind by a session that did not end well. Claude Code writes the process's
/// start in it; with none, or no answer from `ps`, the pid being alive is all there is to go by.
private func isOfRunningProcess(_ session: Session, at now: Date) -> Bool {
    guard !session.started.isEmpty else { return true }
    if let known = starts[session.pid], now.timeIntervalSince(known.at) < startsRecheck {
        return known.start == session.started
    }
    guard let start = processStart(of: session.pid) else { return true }
    starts[session.pid] = (start, now)
    return start == session.started
}

/// The project of each folder asked of, by its path. A folder stays a worktree or not for as long as it
/// lives, so git is asked once for each.
private var projects: [String: String] = [:]

/// The project a session in the folder works on: for a git worktree, the repository it was made from,
/// by the folder of its main checkout (or of the bare repository, without its `.git`), as git's
/// common dir names it; for any other folder, the folder's own name.
func project(of folder: String) -> String {
    if let known = projects[folder] { return known }
    var project = URL(fileURLWithPath: folder).lastPathComponent
    // git ends with 128 in a folder that is no repository's, which leaves the folder's own name
    if !folder.isEmpty,
       let dirs = run("/usr/bin/git", [
           "-C", folder, "rev-parse", "--path-format=absolute", "--git-dir", "--git-common-dir",
       ], allowing: [0, 128])?.split(separator: "\n"),
       dirs.count == 2, dirs[0] != dirs[1] {
        let common = URL(fileURLWithPath: String(dirs[1]))
        let name = common.lastPathComponent
        project = name == ".git" ? common.deletingLastPathComponent().lastPathComponent
            : name.hasSuffix(".git") ? String(name.dropLast(4)) : name
    }
    projects[folder] = project
    return project
}

/// What a session's file says, or nil when it cannot be read, is not JSON yet or names no process.
private func readSession(at file: URL) -> Session? {
    guard let data = try? Data(contentsOf: file),
          let fields = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          // an id that is no process's (zero or less, or beyond what a pid can be) is no session's
          let number = fields["pid"] as? Int, let pid = Int32(exactly: number), pid > 0 else { return nil }
    let cwd = fields["cwd"] as? String ?? ""
    // Orca starts a bot's chats in the bot's own folder, which its bot.json names
    let bot = fields["entrypoint"] as? String == "orca" ? orcaBot(in: cwd) : nil
    let project = bot?.name ?? project(of: cwd)
    let ms = (fields["statusUpdatedAt"] ?? fields["updatedAt"]) as? Double ?? 0
    let status = fields["status"] as? String
    let phase: Phase = status == "busy" ? .busy : status == "waiting" ? .blocked : .idle
    return Session(pid: pid, id: fields["sessionId"] as? String ?? "", name: fields["name"] as? String ?? project,
                   project: project, cwd: cwd, phase: phase,
                   reason: phase == .blocked ? reason((fields["waitingFor"] ?? fields["needs"]) as? String ?? "") : "",
                   desktopID: fields["hostSessionId"] as? String ?? "",
                   updated: Date(timeIntervalSince1970: ms / 1000), botID: bot?.id ?? "",
                   started: fields["procStart"] as? String ?? "",
                   startedAt: Date(timeIntervalSince1970: (fields["startedAt"] as? Double ?? 0) / 1000))
}

/// The sessions whose process is still alive: the blocked ones first, then the most recently active.
func liveSessions(at now: Date = Date()) -> [Session] {
    let dir = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".claude/sessions")
    let files = orNil("listing the sessions") {
        try FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)
    } ?? []
    let names = Set(files.map(\.lastPathComponent))
    lastRead = lastRead.filter { names.contains($0.key) }
    let sessions: [Session] = files.compactMap { file in
        guard file.pathExtension == "json" else { return nil }
        // one gone since the listing is a session ending, and one half written a session
        // starting or being written again: only the second is waited out
        let name = file.lastPathComponent
        if let session = readSession(at: file) { lastRead[name] = (session, now) }
        guard let last = lastRead[name], now.timeIntervalSince(last.at) < readGrace else {
            lastRead[name] = nil
            return nil
        }
        let session = last.session
        guard kill(session.pid, 0) == 0 || errno == EPERM else {
            starts[session.pid] = nil
            return nil
        }
        return isOfRunningProcess(session, at: now) ? session : nil
    }
    return sessions.sorted {
        ($0.phase == .blocked) == ($1.phase == .blocked) ? $0.updated > $1.updated : $0.phase == .blocked
    }
}

func ago(_ date: Date, from now: Date) -> String {
    if now.timeIntervalSince(date) < 60 { return Text.now }
    let formatter = RelativeDateTimeFormatter()
    formatter.locale = Text.locale
    formatter.unitsStyle = .short
    return formatter.localizedString(for: date, relativeTo: now)
}
