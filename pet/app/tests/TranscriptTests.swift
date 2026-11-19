// The tests of what a session's transcript tells: its last message, its tasks, what it left in the background.

import AppKit

/// When the session the tests write transcripts of started, and how Claude Code writes a time.
private let start = Date(timeIntervalSince1970: 1_800_000_000)
private let clock: ISO8601DateFormatter = {
    let clock = ISO8601DateFormatter()
    clock.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return clock
}()

/// What Claude Code writes when a background task is stopped: its only word of that task's end.
private func stopped(_ id: String, _ type: String) -> [String: Any] {
    [
        "type": "user",
        "toolUseResult": [
            "message": "Successfully stopped task: \(id)", "task_id": id, "task_type": type, "command": "",
        ],
    ]
}

/// A line of a transcript, as the text Claude Code writes it as.
private func json(_ line: [String: Any]) -> String {
    lossyText(try! JSONSerialization.data(withJSONObject: line))
}

func messageTests() {
    test("the large bubble shows what the session asks, or the close of Claude's last reply") {
        func said(_ type: String, _ content: [[String: Any]], _ more: [String: Any] = [:]) -> [String: Any] {
            ["type": type, "message": ["content": content]].merging(more) { _, new in new }
        }
        func text(_ text: String) -> [String: Any] { ["type": "text", "text": text] }
        func tool(_ name: String, _ input: [String: Any]) -> [String: Any] {
            ["type": "tool_use", "name": name, "input": input]
        }
        /// What the bubble shows for a transcript of those lines.
        func message(_ id: String, _ lines: [[String: Any]]) -> String {
            write(lines, to: ".claude/projects/project/\(id).jsonl")
            return Transcripts().message(of: Session(pid: 1, id: id, name: "", project: "", phase: .idle, reason: "",
                                                     desktopID: "", updated: now))
        }

        expect(message("reply", [said("assistant", [text("Done.\n\nShall I **commit** `it`\nnow?")])]),
               "Shall I commit it now?")
        expect(message("question", [
            said("assistant", [
                text("One thing."), tool("AskUserQuestion", ["questions": [["question": "Which one?"]]]),
            ]),
        ]), "Which one?")
        expect(message("tool", [said("assistant", [tool("Bash", ["command": "ls", "description": "List the files"])])]),
               "Bash: List the files")
        expect(message("bare tool", [said("assistant", [tool("TaskList", [:])])]), "TaskList")
        // a tool that was answered is no longer what the session is on: the reply before it is
        expect(message("answered", [
            said("assistant", [text("Looking.")]),
            said("assistant", [tool("Bash", ["command": "ls"])]),
            said("user", [["type": "tool_result"]]),
        ]), "Looking.")
        // a subagent's turns and the harness's own notes are not the conversation
        expect(message("aside", [
            said("assistant", [text("The answer.")]),
            said("assistant", [text("A subagent's.")], ["isSidechain": true]),
            said("user", [text("A note.")], ["isMeta": true]),
        ]), "The answer.")
        expect(message("empty", []), "")
        expect(Transcripts().message(of: session(.idle)), "")
    }
}

func scheduleTests() {
    test("a session has a task of its own to run until it is cancelled or, being for one time only, runs") {
        func made(_ id: String, recurring: Bool = true) -> [String: Any] {
            ["type": "user", "toolUseResult": ["id": id, "humanSchedule": "Every 2 minutes", "recurring": recurring]]
        }
        func ran(_ id: String) -> [String: Any] { ["type": "system", "subtype": "scheduled_task_fire", "taskId": id] }
        func cancelled(_ id: String) -> [String: Any] {
            [
                "type": "assistant",
                "message": ["content": [["type": "tool_use", "name": "CronDelete", "input": ["id": id]]]],
            ]
        }
        /// Whether a session with a transcript of those lines has one.
        func isScheduled(_ id: String, _ lines: [[String: Any]]) -> Bool {
            write(lines, to: ".claude/projects/project/\(id).jsonl")
            return Transcripts().isScheduled(Session(pid: 1, id: id, name: "", project: "", phase: .idle, reason: "",
                                                     desktopID: "", updated: now))
        }

        expect(isScheduled("made", [made("a")]), true)
        expect(isScheduled("run", [made("a"), ran("a")]), true)
        expect(isScheduled("cancelled", [made("a"), ran("a"), cancelled("a")]), false)
        expect(isScheduled("one of two", [made("a"), made("b"), cancelled("a")]), true)
        expect(isScheduled("once", [made("a", recurring: false)]), true)
        expect(isScheduled("once, run", [made("a", recurring: false), ran("a")]), false)
        // one made further back than the pet reads
        expect(isScheduled("made long ago", [ran("a")]), true)
        expect(isScheduled("made long ago, cancelled", [ran("a"), cancelled("a")]), false)
        // some other tool's result with an id of its own
        expect(isScheduled("another tool", [["type": "user", "toolUseResult": ["id": "a"]]]), false)
        expect(isScheduled("none", []), false)
        expect(Transcripts().isScheduled(session(.idle)), false)
    }
}

func scheduleStartTests() {
    test("a task made before the session's process started went with it, unless it was made to outlive it") {
        func at(_ seconds: TimeInterval) -> String { clock.string(from: start.addingTimeInterval(seconds)) }
        func made(_ id: String, at seconds: TimeInterval, durable: Bool? = nil) -> [String: Any] {
            var result: [String: Any] = ["id": id, "humanSchedule": "Every 2 minutes", "recurring": true]
            result["durable"] = durable
            return ["type": "user", "timestamp": at(seconds), "toolUseResult": result]
        }
        func ran(_ id: String, at seconds: TimeInterval) -> [String: Any] {
            ["type": "system", "subtype": "scheduled_task_fire", "taskId": id, "timestamp": at(seconds)]
        }
        /// Whether a session started at `start`, resumed from a transcript of those lines, has a task to run.
        func isScheduled(_ id: String, _ lines: [[String: Any]]) -> Bool {
            write(lines, to: ".claude/projects/project/\(id).jsonl")
            return Transcripts().isScheduled(Session(pid: 1, id: id, name: "", project: "", phase: .idle, reason: "",
                                                     desktopID: "", updated: now, startedAt: start))
        }

        expect(isScheduled("this process", [made("a", at: 60)]), true)
        expect(isScheduled("before it", [made("a", at: -3600), ran("a", at: -60)]), false)
        expect(isScheduled("durable, before it", [made("a", at: -3600, durable: true)]), true)
        expect(isScheduled("not durable, before it", [made("a", at: -3600, durable: false)]), false)
        // one that ran in this process is alive in it, wherever it was made
        expect(isScheduled("ran since", [made("a", at: -3600), ran("a", at: 60)]), true)
        expect(isScheduled("one of two", [made("a", at: -3600), made("b", at: 60)]), true)
    }
}

func backgroundTests() {
    test("a command or subagent left running in the background keeps the session at work until word of its end") {
        func went(_ id: String, at: Date = start.addingTimeInterval(60)) -> [String: Any] {
            [
                "type": "user", "timestamp": clock.string(from: at),
                "toolUseResult": ["stdout": "", "backgroundTaskId": id],
            ]
        }
        func ended(_ id: String) -> [String: Any] {
            [
                "type": "queue-operation", "operation": "enqueue",
                "content": "<task-notification>\n<task-id>\(id)</task-id>\n<status>completed</status>\n"
                    + "</task-notification>",
            ]
        }
        /// Whether a session started at `start` with a transcript of those lines has one at it.
        func isRunning(_ id: String, _ lines: [[String: Any]]) -> Bool {
            write(lines, to: ".claude/projects/project/\(id).jsonl")
            return Transcripts().runningCommands(Session(pid: 1, id: id, name: "", project: "", phase: .idle,
                                                         reason: "", desktopID: "", updated: now,
                                                         startedAt: start)) > 0
        }

        expect(isRunning("went", [went("a")]), true)
        expect(isRunning("ended", [went("a"), ended("a")]), false)
        // the word of its end can come before the result that gives its id
        expect(isRunning("ended first", [ended("a"), went("a")]), false)
        expect(isRunning("one of two", [went("a"), went("b"), ended("a")]), true)
        // one stopped gives no word of its end but the stop's own result
        expect(isRunning("stopped", [went("a"), stopped("a", "local_bash")]), false)
        // one left by the process before, which took it along when it ended
        expect(isRunning("before the process", [went("a", at: start.addingTimeInterval(-60))]), false)
        expect(isRunning("none", []), false)

        // subagents sent to the background are counted the same way, apart from the commands
        func sent(_ id: String) -> [String: Any] {
            [
                "type": "user", "timestamp": clock.string(from: start.addingTimeInterval(60)),
                "toolUseResult": ["isAsync": true, "status": "async_launched", "agentId": id],
            ]
        }
        func agents(_ id: String, _ lines: [[String: Any]]) -> Int {
            write(lines, to: ".claude/projects/project/\(id).jsonl")
            return Transcripts().runningAgents(Session(pid: 1, id: id, name: "", project: "", phase: .idle,
                                                       reason: "", desktopID: "", updated: now, startedAt: start))
        }
        expect(agents("two agents", [sent("x"), sent("y")]), 2)
        expect(agents("one back", [sent("x"), sent("y"), ended("x")]), 1)
        expect(agents("one stopped", [sent("x"), sent("y"), stopped("y", "local_agent")]), 1)
        expect(agents("a command is no agent", [went("a")]), 0)
        expect(isRunning("an agent is no command", [sent("x")]), false)
    }
}

func growthTests() {
    test("work sent to the background is remembered as the transcript grows past what one look reads") {
        func sent(_ id: String) -> String {
            json([
                "type": "user", "timestamp": clock.string(from: start.addingTimeInterval(60)),
                "toolUseResult": ["isAsync": true, "status": "async_launched", "agentId": id],
            ])
        }
        func ended(_ id: String) -> String {
            json([
                "type": "queue-operation",
                "content": "<task-notification>\n<task-id>\(id)</task-id>\n</task-notification>",
            ])
        }
        let filler = (0..<20).map {
            json(["type": "assistant", "message": ["content": [["type": "text", "text": "line \($0) of talk"]]]])
        }
        let path = ".claude/projects/project/grown.jsonl"
        let file = home.appendingPathComponent(path)
        /// Adds to the transcript, as Claude Code does: lines after the last one, which may not be whole yet.
        func append(_ text: String) {
            let handle = try! FileHandle(forWritingTo: file)
            handle.seekToEndOfFile()
            handle.write(Data(text.utf8))
            try! handle.close()
        }
        let grown = Session(pid: 1, id: "grown", name: "", project: "", phase: .idle, reason: "", desktopID: "",
                            updated: now, startedAt: start)

        try! FileManager.default.createDirectory(at: file.deletingLastPathComponent(),
                                                 withIntermediateDirectories: true)
        try! ([sent("x"), sent("y")].joined(separator: "\n") + "\n").write(to: file, atomically: true, encoding: .utf8)
        // a window that reaches only the end of what it reads: it is the first look that is short
        let transcripts = Transcripts(firstLook: 400)
        expect(transcripts.runningAgents(grown), 2)
        // far more written than a look reaches, and the two sent before are still at it
        append(filler.joined(separator: "\n") + "\n")
        expect(transcripts.runningAgents(grown), 2, "after talk:")
        append(ended("x") + "\n")
        expect(transcripts.runningAgents(grown), 1, "one back:")
        append(filler.joined(separator: "\n") + "\n")
        expect(transcripts.runningAgents(grown), 1, "after more talk:")
        // a line half written is read once it is whole, not as it is
        let last = sent("z")
        append(String(last.prefix(40)))
        expect(transcripts.runningAgents(grown), 1, "half written:")
        append(String(last.dropFirst(40)) + "\n" + ended("y") + "\n")
        expect(transcripts.runningAgents(grown), 1, "whole:")
        // one that did end, with the end before the look that finds it
        append(ended("z") + "\n")
        expect(transcripts.runningAgents(grown), 0, "all back:")

        // a first look that starts amid the file finds what is within it, whatever line it cuts
        try! (filler.joined(separator: "\n") + "\n" + sent("w") + "\n")
            .write(to: file, atomically: true, encoding: .utf8)
        expect(Transcripts(firstLook: 600).runningAgents(grown), 1, "first look:")
    }
}

func failureTests() {
    test("a session whose last turn ended on an API error says what it said") {
        func said(_ type: String, _ text: String, _ extra: [String: Any] = [:]) -> [String: Any] {
            ["type": type, "message": ["content": [["type": "text", "text": text]]]].merging(extra) { $1 }
        }
        let failed = said("assistant", "API Error: Connection lost mid-response.", ["isApiErrorMessage": true])
        func failure(_ id: String, _ lines: [[String: Any]]) -> String {
            write(lines, to: ".claude/projects/project/\(id).jsonl")
            return Transcripts().failure(of: Session(pid: 1, id: id, name: "", project: "", phase: .idle, reason: "",
                                                     desktopID: "", updated: now))
        }

        expect(failure("failed", [said("user", "hola"), failed]), "API Error: Connection lost mid-response.")
        // asked again since, it is no longer how it ended
        expect(failure("asked again", [failed, said("user", "otra vez")]), "")
        // a subagent's error or a note of the harness after it does not hide it
        expect(failure("aside", [failed, said("assistant", "sub", ["isSidechain": true])]),
               "API Error: Connection lost mid-response.")
        expect(failure("well", [said("assistant", "Hecho.")]), "")
    }
}
