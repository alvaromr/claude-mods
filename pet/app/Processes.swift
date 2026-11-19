// What the pet asks of the system: the failures it reports, the programs it runs (`ps`, `lsof`)
// and what they tell of a session's process and of the servers it left running.

import Foundation

// MARK: - Failures

/// Where the pet tells why a read failed and it shows less: the system log, which
/// `log stream --process claude-pet` shows. The tests keep the lines instead.
var report: (String) -> Void = { NSLog("%@", $0) }
private var reported: Set<String> = []
private let reporting = NSLock()  // a command for Orca runs off the main thread

/// What `body` gives, or nil when it throws, its cause reported once: the pet reads the same
/// files every second, and a cause told each time would bury every other line.
func orNil<T>(_ doing: String, _ body: () throws -> T) -> T? {
    do {
        return try body()
    } catch {
        let line = "\(doing) failed: \(error.localizedDescription)"
        if reporting.withLock({ reported.insert(line).inserted }) { report(line) }
        return nil
    }
}

/// The text the bytes make, a byte that is no UTF-8 read as the replacement character: what a program
/// printed or a file holds is read whatever it is, not given up for one stray byte.
func lossyText<Bytes: Collection>(_ bytes: Bytes) -> String where Bytes.Element == UInt8 {
    String(decoding: bytes, as: UTF8.self)
}

// MARK: - Programs

private struct TimedOut: LocalizedError {
    let seconds: TimeInterval
    var errorDescription: String? { "it took more than \(seconds) s" }
}

/// What the program prints, or nil when it cannot run, fails or does not end within `timeout`
/// seconds, which it is stopped at: the pet asks `ps` and Orca, and one that hangs must not
/// hold the pet with it.
/// A program that fails with a status in `allowing` still gives what it printed.
func run(_ path: String, _ arguments: [String], timeout: TimeInterval = 5, allowing: Set<Int32> = [0]) -> String? {
    /// What the program printed, filled in by the thread that reads it.
    final class Printed: @unchecked Sendable { var data = Data() }
    let process = Process()
    let output = Pipe()
    process.executableURL = URL(fileURLWithPath: path)
    process.arguments = arguments
    process.standardOutput = output
    process.standardError = FileHandle.nullDevice
    let ended = DispatchSemaphore(value: 0)
    process.terminationHandler = { _ in ended.signal() }
    guard orNil("running \(path)", process.run) != nil else { return nil }
    let printed = Printed(), reading = DispatchGroup(), pipe = output.fileHandleForReading
    reading.enter()
    DispatchQueue.global().async {
        printed.data = pipe.readDataToEndOfFile()
        reading.leave()
    }
    // a program that ends leaves its pipe at its end, unless something it started holds it open
    guard ended.wait(timeout: .now() + timeout) == .success, reading.wait(timeout: .now() + 1) == .success else {
        process.terminate()
        _ = orNil("running \(path)") { throw TimedOut(seconds: timeout) }
        return nil
    }
    return allowing.contains(process.terminationStatus) ? lossyText(printed.data) : nil
}

// MARK: - Servers

/// What a session's background commands that listen on a port have open: such a command is a
/// server, which runs until it is stopped.
struct Servers: Equatable {
    /// How many of its background commands listen.
    var commands = 0
    /// The ports they listen on, in order.
    var ports: [Int] = []
}

/// The servers of each of those sessions, by its pid; none for one whose background commands
/// listen on nothing, nor when `ps` or `lsof` does not answer.
func servers(of sessions: [Int32]) -> [Int32: Servers] {
    guard !sessions.isEmpty, let table = run("/bin/ps", ["-Ao", "pid=,ppid=,command="]),
          // lsof ends with 1 when it finds nothing
          let open = run("/usr/sbin/lsof", ["-nP", "-iTCP", "-sTCP:LISTEN", "-Fpn"], allowing: [0, 1])
    else { return [:] }
    return servers(of: Set(sessions), in: table, listening: open)
}

/// The servers of each of those sessions from what `ps -Ao pid=,ppid=,command=` and
/// `lsof -iTCP -sTCP:LISTEN -Fpn` print. Claude Code runs each command in a shell of its own,
/// one that sources its snapshot of the person's shell, and a command is a server when that
/// shell, or any process under it, listens.
func servers(of sessions: Set<Int32>, in table: String, listening open: String) -> [Int32: Servers] {
    var children: [Int32: [Int32]] = [:], shells: [Int32: [Int32]] = [:]
    for row in table.split(separator: "\n") {
        guard let match = row.firstMatch(of: #/^\s*(\d+)\s+(\d+)\s+(.*)$/#),
              let pid = Int32(match.1), let parent = Int32(match.2) else { continue }
        children[parent, default: []].append(pid)
        if sessions.contains(parent), match.3.contains("/shell-snapshots/") { shells[parent, default: []].append(pid) }
    }
    // a `p` line names a process, and each `n` line after it one address it listens on, its port last
    var ports: [Int32: Set<Int>] = [:], pid: Int32?
    for line in open.split(separator: "\n") {
        if line.hasPrefix("p") {
            pid = Int32(line.dropFirst())
        } else if line.hasPrefix("n"), let pid, let port = line.split(separator: ":").last.flatMap({ Int($0) }) {
            ports[pid, default: []].insert(port)
        }
    }
    func listens(under pid: Int32) -> Set<Int> {
        (children[pid] ?? []).reduce(ports[pid] ?? []) { $0.union(listens(under: $1)) }
    }
    return shells.compactMapValues { shells in
        let each = shells.map(listens(under:)).filter { !$0.isEmpty }
        return each.isEmpty ? nil
            : Servers(commands: each.count, ports: each.reduce(Set<Int>(), { $0.union($1) }).sorted())
    }
}

// MARK: - Processes

/// When the process started, as `ps -o lstart` says it at UTC; nil when `ps` does not say.
func processStart(of pid: Int32) -> String? {
    run("/usr/bin/env", ["TZ=UTC", "LC_ALL=C", "/bin/ps", "-o", "lstart=", "-p", String(pid)])?
        .trimmingCharacters(in: .whitespacesAndNewlines)
}

/// Whether the session's process is still the one Claude Code wrote of, by when it started: a
/// pid goes to another process once its own is gone.
func isRunning(_ session: Session) -> Bool {
    !session.started.isEmpty && processStart(of: session.pid) == session.started
}

/// Whether the name of a process is Claude Code's, as `ps -o comm` gives it: the path it runs from.
func isClaude(command: String) -> Bool {
    URL(fileURLWithPath: command.trimmingCharacters(in: .whitespacesAndNewlines)).lastPathComponent == "claude"
}

/// Whether the session's process is one to end with a signal: the one Claude Code wrote of, or,
/// when it told no start to know it by, one that is Claude Code at least.
func isEndable(_ session: Session) -> Bool {
    if !session.started.isEmpty { return isRunning(session) }
    return run("/bin/ps", ["-o", "comm=", "-p", String(session.pid)]).map(isClaude(command:)) ?? false
}
