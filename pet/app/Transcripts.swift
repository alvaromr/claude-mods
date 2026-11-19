// What a session's transcript tells, from its last lines.

import Foundation

/// What the end of each session's transcript (~/.claude/projects/<project>/<session id>.jsonl)
/// tells: what Claude last said, the tasks it scheduled, the commands and subagents it left in
/// the background and an API error its last turn ended on; kept until the file changes.
final class Transcripts {
    private var files: [String: URL] = [:]
    private struct End {
        let message: String
        let isScheduled: Bool
        let work: (commands: Int, agents: Int)
        let failure: String
    }
    /// What the last look at a transcript found, and of which state of the file.
    private struct Look {
        let modified: Date
        let size: UInt64
        let since: Date
        let end: End
    }
    private var read: [String: Look] = [:]
    /// What each session left in the background, kept across looks: read as the file grows, so
    /// what was sent further back than any one look reaches is not forgotten.
    private var work: [String: Background] = [:]
    /// How much of the end of a transcript the first look at its background work reads; after that
    /// the pet only reads what was added.
    private let firstLook: UInt64
    private let clock: ISO8601DateFormatter

    init(firstLook: UInt64 = 4_000_000) {
        self.firstLook = firstLook
        clock = ISO8601DateFormatter()
        clock.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    }

    /// The question the session is waiting on, or else the close of Claude's last reply.
    func message(of session: Session) -> String { end(of: session).message }

    /// Whether the session has a task of its own still to run (a /loop, a reminder), so it
    /// goes on by itself with nobody answering it.
    func isScheduled(_ session: Session) -> Bool { end(of: session).isScheduled }

    /// How many commands the session left running in the background are still at it.
    func runningCommands(_ session: Session) -> Int { end(of: session).work.commands }

    /// How many subagents the session sent to work in the background are still at it.
    func runningAgents(_ session: Session) -> Int { end(of: session).work.agents }

    /// What the API error the session's last turn ended on says; empty when it ended well.
    func failure(of session: Session) -> String { end(of: session).failure }

    private func end(of session: Session) -> End {
        guard let file = file(of: session.id),
              let attributes = orNil("reading \(file.path)", {
                  try FileManager.default.attributesOfItem(atPath: file.path)
              }),
              let modified = attributes[.modificationDate] as? Date
        else { return End(message: "", isScheduled: false, work: (0, 0), failure: "") }
        let size = (attributes[.size] as? NSNumber)?.uint64Value ?? 0
        if let known = read[session.id], known.modified == modified, known.size == size,
           known.since == session.startedAt {
            return known.end
        }
        let lines = lastLines(of: file)
        let end = End(message: lastMessage(in: lines), isScheduled: hasSchedule(in: lines, since: session.startedAt),
                      work: background(of: session, in: file, size: size), failure: failure(in: lines))
        read[session.id] = Look(modified: modified, size: size, since: session.startedAt, end: end)
        return end
    }

    private func file(of id: String) -> URL? {
        if let known = files[id] { return known }
        let projects = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".claude/projects")
        let folders = orNil("listing the transcripts' folders") {
            try FileManager.default.contentsOfDirectory(at: projects, includingPropertiesForKeys: nil)
        } ?? []
        files[id] = folders.map { $0.appendingPathComponent("\(id).jsonl") }
            .first { FileManager.default.fileExists(atPath: $0.path) }
        return files[id]
    }

    /// The transcript's last lines; the last may be half written, so each line is parsed with
    /// `try?` and one that is not JSON yet is skipped.
    private func lastLines(of file: URL) -> [Substring] {
        // the end is enough, and a transcript can run to many megabytes
        let window: UInt64 = 400_000
        let data = orNil("reading \(file.path)") { () throws -> Data in
            let handle = try FileHandle(forReadingFrom: file)
            defer { try? handle.close() }  // a read handle has nothing to lose on close
            let size = try handle.seekToEnd()
            try handle.seek(toOffset: size > window ? size - window : 0)
            return handle.readDataToEndOfFile()
        } ?? Data()
        return lossyText(data).split(separator: "\n")
    }

    /// The tasks the session scheduled that are still to run, as the lines tell it: one made or run
    /// in them, and since then neither cancelled nor, being for one time only, run.
    private struct Schedule {
        var live: Set<String> = [], once: Set<String> = []

        /// What one line says of them; `isOfProcess` is whether it was written by the session's process.
        mutating func take(_ entry: [String: Any], isOfProcess: Bool) {
            if let made = entry["toolUseResult"] as? [String: Any], made["humanSchedule"] != nil,
               let id = made["id"] as? String {
                add(id, made, isOfProcess: isOfProcess)
            } else if entry["subtype"] as? String == "scheduled_task_fire", let id = entry["taskId"] as? String {
                fire(id, isOfProcess: isOfProcess)
            } else if let blocks = (entry["message"] as? [String: Any])?["content"] as? [[String: Any]] {
                for block in blocks where block["name"] as? String == "CronDelete" {
                    if let id = (block["input"] as? [String: Any])?["id"] as? String { live.remove(id) }
                }
            }
        }

        private mutating func add(_ id: String, _ made: [String: Any], isOfProcess: Bool) {
            guard isOfProcess || made["durable"] as? Bool == true else { return }
            live.insert(id)
            if made["recurring"] as? Bool == false { once.insert(id) }
        }

        private mutating func fire(_ id: String, isOfProcess: Bool) {
            guard isOfProcess else { return }
            // one made further back than those lines is taken to repeat, as they do unless told not to
            if once.contains(id) { live.remove(id) } else { live.insert(id) }
        }
    }

    /// Whether some task the session scheduled is still to run: one made or run in those
    /// lines, and since then neither cancelled nor, being for one time only, run. A task made or
    /// run before the session's process started went with it, as a session resumed starts with
    /// none, unless it was made to outlive it (`durable`); the transcript keeps them all.
    private func hasSchedule(in lines: [Substring], since start: Date) -> Bool {
        var schedule = Schedule()
        for line in lines {
            guard let entry = try? JSONSerialization.jsonObject(with: Data(line.utf8)) as? [String: Any]
            else { continue }
            // an entry with no time is taken to be of this process
            let isOfProcess = (entry["timestamp"] as? String).flatMap(clock.date(from:)).map { $0 >= start } ?? true
            schedule.take(entry, isOfProcess: isOfProcess)
        }
        return !schedule.live.isEmpty
    }

    /// What a session sent to the background since its process started, from the transcript's
    /// lines as they were read: each id given when a command or subagent went there, and the ids
    /// of those whose end or stop was told.
    private struct Background {
        let since: Date
        /// How far into the transcript it has read; the last line is left out until it is whole.
        var offset: UInt64
        /// The first line of a read that starts amid the file is the end of one it does not have.
        var skipsFirst: Bool
        var commands: Set<String> = [], agents: Set<String> = [], ended: Set<String> = []

        /// How many are still at it: those with no word since of their end, which Claude Code
        /// writes with that id (sometimes before the result that gives it), nor of their stop,
        /// whose result names that id and is the only word Claude Code gives of it.
        var running: (commands: Int, agents: Int) {
            (commands.subtracting(ended).count, agents.subtracting(ended).count)
        }

        mutating func take(_ line: Substring, clock: ISO8601DateFormatter) {
            if line.contains("<task-id>") {
                for match in line.matches(of: #/<task-id>([^<]+)</#) { ended.insert(String(match.1)) }
                return
            }
            guard line.contains("backgroundTaskId") || line.contains("async_launched") || line.contains("\"task_id\""),
                  let entry = try? JSONSerialization.jsonObject(with: Data(line.utf8)) as? [String: Any],
                  let result = entry["toolUseResult"] as? [String: Any]
            else { return }
            // TaskStop's result, the only one with the id at its top
            if let id = result["task_id"] as? String {
                ended.insert(id)
                return
            }
            guard let at = (entry["timestamp"] as? String).flatMap(clock.date(from:)), at >= since else { return }
            if let id = result["backgroundTaskId"] as? String {
                commands.insert(id)
            } else if result["status"] as? String == "async_launched", let id = result["agentId"] as? String {
                agents.insert(id)
            }
        }
    }

    /// How many commands and subagents the session sent to the background since its process
    /// started are still at it. The first look reads the end of the transcript, and each look
    /// after it only what was added since, so what went there long before is not lost as the
    /// transcript grows past what one look reads.
    private func background(of session: Session, in file: URL, size: UInt64) -> (commands: Int, agents: Int) {
        var state = work[session.id]
        // the transcript is only ever added to: a shorter one is another, read from its start
        if state == nil || state?.since != session.startedAt || size < state?.offset ?? 0 {
            let start = size > firstLook ? size - firstLook : 0
            state = Background(since: session.startedAt, offset: start, skipsFirst: start > 0)
        }
        guard var known = state else { return (0, 0) }
        let data = orNil("reading \(file.path)") { () throws -> Data in
            let handle = try FileHandle(forReadingFrom: file)
            defer { try? handle.close() }  // a read handle has nothing to lose on close
            try handle.seek(toOffset: known.offset)
            return handle.readDataToEndOfFile()
        } ?? Data()
        let end = known.offset + UInt64(data.count)
        var lines = data.split(separator: UInt8(ascii: "\n"), omittingEmptySubsequences: false)
        // the last one is left for the next look while it is half written, as it is when it is
        // not yet JSON; one that is whole counts, with or without the line's end after it
        if let last = lines.last, !last.isEmpty, (try? JSONSerialization.jsonObject(with: last)) == nil {
            lines.removeLast()
        }
        for line in lines {
            known.offset += UInt64(line.count) + 1
            if known.skipsFirst {
                known.skipsFirst = false
                continue
            }
            known.take(Substring(lossyText(line)), clock: clock)
        }
        // the last line's end was counted whether it was there or not
        known.offset = min(known.offset, end)
        work[session.id] = known
        return known.running
    }

    /// The words of the API error the conversation's last turn ended on (a limit hit, the
    /// connection lost); empty when its last word is anything else.
    private func failure(in lines: [Substring]) -> String {
        for line in lines.reversed() {
            guard let entry = try? JSONSerialization.jsonObject(with: Data(line.utf8)) as? [String: Any],
                  entry["isSidechain"] as? Bool != true, entry["isMeta"] as? Bool != true,
                  let type = entry["type"] as? String, type == "user" || type == "assistant" else { continue }
            guard entry["isApiErrorMessage"] as? Bool == true,
                  let blocks = (entry["message"] as? [String: Any])?["content"] as? [[String: Any]] else { return "" }
            let said = blocks.compactMap { $0["text"] as? String }.joined(separator: " ")
            return said.isEmpty ? Text.apiError : said
        }
        return ""
    }

    private func lastMessage(in lines: [Substring]) -> String {
        var isLast = true
        for line in lines.reversed() {
            // the turns of the conversation itself, not a subagent's nor the notes the harness adds
            guard let entry = try? JSONSerialization.jsonObject(with: Data(line.utf8)) as? [String: Any],
                  entry["isSidechain"] as? Bool != true, entry["isMeta"] as? Bool != true,
                  let type = entry["type"] as? String, type == "user" || type == "assistant" else { continue }
            defer { isLast = false }
            guard type == "assistant",
                  let blocks = (entry["message"] as? [String: Any])?["content"] as? [[String: Any]] else { continue }
            // a question still on screen is the last thing in the transcript, as is a tool
            // Claude asked for and has no answer about yet
            if isLast, let call = blocks.last(where: { $0["type"] as? String == "tool_use" }),
               let tool = call["name"] as? String, let input = call["input"] as? [String: Any] {
                if let questions = input["questions"] as? [[String: Any]],
                   let question = questions.first?["question"] as? String {
                    return question
                }
                let what = ["description", "command", "file_path", "url"].lazy.compactMap { input[$0] as? String }.first
                return [tool, what].compactMap { $0 }.joined(separator: ": ")
            }
            let paragraphs = blocks.compactMap { $0["type"] as? String == "text" ? $0["text"] as? String : nil }
                .joined(separator: "\n\n").components(separatedBy: "\n\n")
                .filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
            // a reply closes on what it wants from the person: its last paragraph, as plain words
            if let close = paragraphs.last {
                return close.replacingOccurrences(of: "**", with: "").replacingOccurrences(of: "`", with: "")
                    .split(whereSeparator: \.isNewline).joined(separator: " ")
            }
        }
        return ""
    }
}
