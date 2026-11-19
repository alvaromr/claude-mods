// The tests of the sessions: which tab each is in, how they are read, which are alive and where they live.

import AppKit

func groupTests() {
    test("a session waits until it has been idle long enough, or the person has seen it") {
        expect(session(.busy).group(at: now), .working)
        expect(session(.idle).group(at: now), .waiting)
        expect(session(.idle, minutesAgo: 29).group(at: now), .waiting)
        expect(session(.idle, minutesAgo: 31).group(at: now), .inactive)
        expect(session(.idle, isSeen: true).group(at: now), .inactive)
    }

    test("a blocked session waits however long ago it stopped, seen or not") {
        expect(session(.blocked, minutesAgo: 600).group(at: now), .waiting)
        expect(session(.blocked, isSeen: true).group(at: now), .waiting)
    }

    test("what a blocked session waits on is said in Spanish where it is known") {
        expect(reason(""), "te necesita")
        expect(reason("input needed"), "espera tu respuesta")
        expect(reason("dialog open"), "tiene un diálogo abierto")
        expect(reason("sandbox request"), "pide acceso de red")
        expect(reason("goal proposal"), "propone un objetivo")
        expect(reason("approve Bash: ls"), "aprobar Bash: ls")
        expect(reason("something new"), "something new")
    }

    test("how long ago is said in short, and as now within the minute") {
        expect(ago(now.addingTimeInterval(-59), from: now), "ahora")
        expect(ago(now.addingTimeInterval(-5 * 60), from: now), "hace 5 min")
        expect(ago(now.addingTimeInterval(-3 * 3600), from: now), "hace 3 h")
    }
}

func liveSessionTests() {
    test("the live sessions are read from Claude Code's registry, the blocked first, then the latest") {
        let pid = Int(getpid()), ms = now.timeIntervalSince1970 * 1000
        write([
            "pid": pid, "sessionId": "a", "name": "older", "cwd": "/work/app", "status": "idle",
            "statusUpdatedAt": ms - 5000,
        ], to: ".claude/sessions/1.json")
        write([
            "pid": pid, "sessionId": "b", "cwd": "/work/site", "status": "busy", "updatedAt": ms,
            "hostSessionId": "local_abc",
        ], to: ".claude/sessions/2.json")
        write([
            "pid": pid, "sessionId": "c", "name": "stuck", "cwd": "/work/app", "status": "waiting",
            "waitingFor": "input needed", "statusUpdatedAt": ms - 9000,
        ], to: ".claude/sessions/3.json")
        write([
            "pid": pid, "sessionId": "d", "name": "in a shell", "cwd": "/work/app", "status": "shell",
            "statusUpdatedAt": ms - 7000,
        ], to: ".claude/sessions/4.json")
        // one whose process is gone, and a file that is not a session's
        write([["pid": 99_999_999, "sessionId": "e", "status": "idle"]], to: ".claude/sessions/5.json")
        write([["pid": pid, "sessionId": "f", "status": "idle"]], to: ".claude/sessions/6.key")
        // pids that are no process's: none, or beyond what a pid can be, which must not crash the pet
        for (file, bad) in [(8, 0), (9, -5), (10, 5_000_000_000), (11, Int(Int32.max) + 1)] {
            write([["pid": bad, "sessionId": "bad", "status": "idle"]], to: ".claude/sessions/\(file).json")
        }

        let sessions = liveSessions()
        expect(sessions.map(\.id), ["c", "b", "a", "d"])
        expect(sessions.map(\.phase), [.blocked, .busy, .idle, .idle])
        expect(sessions.map(\.name), ["stuck", "site", "older", "in a shell"])
        expect(sessions.map(\.project), ["app", "site", "app", "app"])
        expect(sessions.map(\.reason), ["espera tu respuesta", "", "", ""])
        expect(sessions.map(\.desktopID), ["", "local_abc", "", ""])
        expect(sessions.map(\.isSeen), [false, false, false, false])
    }

    test("a session is running while its process is the one that started when Claude Code says") {
        func running(started: String) -> Bool {
            isRunning(Session(pid: getpid(), id: "", name: "", project: "", phase: .idle, reason: "", desktopID: "",
                              updated: now, started: started))
        }
        let started = run("/usr/bin/env", ["TZ=UTC", "LC_ALL=C", "/bin/ps", "-o", "lstart=", "-p", String(getpid())])!
            .trimmingCharacters(in: .whitespacesAndNewlines)
        expect(running(started: started), true)
        // another process that was given its pid, and one Claude Code tells no start of
        expect(running(started: "Thu Jan  1 00:00:00 1970"), false)
        expect(running(started: ""), false)
        write([["pid": Int(getpid()), "sessionId": "g", "status": "idle", "procStart": started]],
              to: ".claude/sessions/7.json")
        expect(liveSessions().first { $0.id == "g" }.map(isRunning), true)
    }
}

func sessionFileTests() {
    test("a file left by a session whose pid another process has since been given is no live session") {
        let pid = Int(getpid())
        write([["pid": pid, "sessionId": "reused", "status": "busy", "procStart": "Thu Jan  1 00:00:00 1970"]],
              to: ".claude/sessions/12.json")
        expect(liveSessions().contains { $0.id == "reused" }, false)
        // no start to tell them apart by, and the pid alive, is as it has always been
        write([["pid": pid, "sessionId": "reused", "status": "busy"]], to: ".claude/sessions/12.json")
        expect(liveSessions().contains { $0.id == "reused" }, true)
        try! FileManager.default.removeItem(at: home.appendingPathComponent(".claude/sessions/12.json"))
    }

    test("a session file unreadable for a moment keeps its session for a few seconds, no more") {
        let file = ".claude/sessions/13.json"
        func listed(at later: TimeInterval) -> Bool {
            liveSessions(at: now.addingTimeInterval(later)).contains { $0.id == "moment" }
        }
        write([["pid": Int(getpid()), "sessionId": "moment", "status": "idle"]], to: file)
        expect(listed(at: 0), true)
        // as it is when half written, or replaced
        try! "{\"pid\": ".write(to: home.appendingPathComponent(file), atomically: true, encoding: .utf8)
        expect(listed(at: 5), true, "half written, at once:")
        expect(listed(at: 11), false, "half written, for good:")
        write([["pid": Int(getpid()), "sessionId": "moment", "status": "idle"]], to: file)
        expect(listed(at: 20), true)
        // a file that is gone is a session that ended, with no wait
        try! FileManager.default.removeItem(at: home.appendingPathComponent(file))
        expect(listed(at: 21), false, "gone:")
    }
}

func processTests() {
    test("a session can be ended when its process is the one Claude Code wrote of, or else is Claude Code") {
        expect(isClaude(command: "claude\n"), true)
        expect(isClaude(command: "/Users/me/.local/bin/claude\n"), true)
        expect(isClaude(command: "/Users/me/.local/bin/claude-pet"), false)
        expect(isClaude(command: "/bin/zsh"), false)
        expect(isClaude(command: ""), false)
        func endable(started: String, pid: Int32 = getpid()) -> Bool {
            isEndable(Session(pid: pid, id: "", name: "", project: "", phase: .idle, reason: "", desktopID: "",
                              updated: now, started: started))
        }
        let started = processStart(of: getpid())!
        expect(endable(started: started), true)
        expect(endable(started: "Thu Jan  1 00:00:00 1970"), false)
        // told no start: the process is no claude here, and none at all is not one either
        expect(endable(started: ""), false)
        expect(endable(started: "", pid: 99_999_999), false)
    }

    test("a session of the Claude desktop app is opened there, by the id the app gives it") {
        expect(place(of: session(.idle, desktopID: "local_f61c0690-f9ed")), .desktop("local_f61c0690-f9ed"))
    }

    test("a place that could not be found out is none, to be asked again, and not a place with no window") {
        // a process `ps` knows nothing of
        expect(place(of: Session(pid: 99_999_999, id: "", name: "", project: "", phase: .idle, reason: "",
                                 desktopID: "", updated: now)), nil)
        let environment = "123 ttys001 S+ claude TERM=xterm ORCA_TERMINAL_HANDLE=term_1f-a2 HOME=/Users/me"
        expect(orcaHandle(in: environment), "term_1f-a2")
        expect(orcaHandle(in: "123 ttys001 S+ claude TERM=xterm HOME=/Users/me"), nil)
    }
}

func programTests() {
    test("a program that does not end in time is stopped, and says so once") {
        var told: [String] = []
        report = { told.append($0) }
        let began = Date()
        expect(run("/bin/sleep", ["30"], timeout: 0.3), nil)
        expect(Date().timeIntervalSince(began) < 5, true, "it waited no longer:")
        expect(told.count, 1, "lines told")
        expect(told.first?.contains("took more than") ?? false, true, told.first ?? "nothing told")
        expect(run("/bin/echo", ["hi"]), "hi\n")
        report = { NSLog("%@", $0) }
    }

    test("the pet's Salir leaves its word next to the app, where the launcher looks") {
        expect(quitMark(app: URL(fileURLWithPath: "/a/claude-pet/Pet.app")).path, "/a/claude-pet/quit")
    }

    test("a row can be pressed when it has a place to go, and seen when it waits unblocked") {
        func row(_ session: Session, _ place: Place) -> Row {
            .session(session, ago: "ahora", place: place, message: "", icon: nil)
        }
        expect(Row.note("nothing").isPressable, false)
        expect(Row.note("nothing").isDismissible, false)
        expect(row(session(.idle), .nowhere).isPressable, false)
        expect(row(session(.idle), .orca("term_1")).isPressable, true)
        expect(row(session(.idle), .nowhere).isDismissible, true)
        expect(row(session(.idle, minutesAgo: 31), .nowhere).isDismissible, false)
        expect(row(session(.idle, isSeen: true), .nowhere).isDismissible, false)
        expect(row(session(.blocked), .nowhere).isDismissible, false)
        expect(row(session(.busy), .nowhere).isDismissible, false)
    }
}
