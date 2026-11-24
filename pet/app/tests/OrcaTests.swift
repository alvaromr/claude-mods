// The tests of what the pet reads of the system around a session: its servers, and Orca's terminals and icons.

import AppKit

func serverTests() {
    test("a background command that listens on a port, itself or a process under it, is a server") {
        let shell = "/bin/zsh -c source /Users/x/.claude/shell-snapshots/snapshot-zsh-1.sh && eval"
        let table = """
              1     0 /sbin/launchd
            100     1 claude
            101   100 \(shell) 'pnpm serve'
            102   101 pnpm serve
            103   102 node vite --port 5173
            104   100 \(shell) 'pnpm check'
            105   100 node shop-mcp.mjs
            106   100 \(shell) 'python3 -m http.server 8765'
            200     1 claude
            201   200 \(shell) 'pnpm test'
            """
        // the session's own port and an MCP server's are not a command's
        let open = "p100\nf27\nn127.0.0.1:50571\np103\nf20\nn[::1]:5173\nf21\nn*:5173\np105\nn*:3100\n"
            + "p106\nn127.0.0.1:8765\n"
        let handedOut = 49152...65535
        let found = servers(of: [100, 200], in: table, listening: open, handedOut: handedOut)
        expect(found[100], Servers(commands: 2, ports: [5173, 8765]))
        expect(found[200], nil, "a session whose commands listen on nothing")
        expect(servers(of: [100], in: table, listening: "", handedOut: handedOut)[100], nil, "nothing listening")

        // a test run or a debugger listens too, on ports the system hands out, to talk to its own
        // processes: it is still at work, as a server is not
        let runs = """
            300     1 claude
            301   300 \(shell) 'pnpm mutation'
            302   301 stryker
            303   302 node --inspect --test
            304   300 \(shell) 'pnpm dev'
            305   304 node --inspect vite --port 5173
            """
        let picked = "p302\nn*:51782\np303\nn127.0.0.1:65475\np305\nn*:5173\nn127.0.0.1:49329\n"
        expect(servers(of: [300], in: runs, listening: picked, handedOut: handedOut)[300],
               Servers(commands: 1, ports: [5173]), "only the port a server was told to listen on")

        var serving = session(.idle)
        serving.ports = [5173, 8765]
        expect(Mark.of(serving), .server)
        expect(Mark.server.goesOnByItself, false)
        expect(Mark.server.label(for: serving), "servidor en marcha · puertos 5173, 8765")
        serving.isRunningCommand = true
        expect(Mark.of(serving), .command, "a command at work besides it")
    }
}

func botTests() {
    test("an Orca bot's chat goes by the bot's name, and is opened in Orca, by the bot's id") {
        let pid = Int(getpid()), folder = home.appendingPathComponent("bots/new-bot").path
        write(["id": "aef56e62-1634", "name": "Casper", "agent": "claude"], to: "bots/new-bot/bot.json")
        write(["id": "../../x", "name": "Bad"], to: "bots/bad/bot.json")
        write([
            "pid": pid, "sessionId": "bot", "name": "Home", "cwd": folder, "entrypoint": "orca", "status": "idle",
        ], to: ".claude/sessions/20.json")
        // a folder that holds a bot.json, worked in from a terminal, and a bot whose id no link can take
        write(["pid": pid, "sessionId": "term", "cwd": folder, "entrypoint": "cli", "status": "idle"],
              to: ".claude/sessions/21.json")
        write([
            "pid": pid, "sessionId": "bad", "cwd": home.appendingPathComponent("bots/bad").path,
            "entrypoint": "orca", "status": "idle",
        ], to: ".claude/sessions/22.json")
        let sessions = Dictionary(liveSessions().map { ($0.id, $0) }) { first, _ in first }
        expect(sessions["bot"]?.project, "Casper")
        expect(sessions["bot"]?.name, "Home")
        expect(sessions["bot"]?.botID, "aef56e62-1634")
        expect(sessions["term"]?.project, "new-bot")
        expect(sessions["term"]?.botID, "")
        expect(sessions["bad"]?.project, "bad")
        expect(sessions["bad"]?.botID, "")
        expect(sessions["bot"].flatMap(place(of:)), .bot("aef56e62-1634"))
        expect(Place.bot("aef56e62-1634").appName, "Orca")
        expect(Place.bot("aef56e62-1634").link?.absoluteString, "orca://bot/aef56e62-1634")
        expect(Place.desktop("local_f6").link?.absoluteString, "claude://code/continue?session=local_f6")
        expect(Place.orca("term_1").link, nil)
        for file in ["20", "21", "22"] {
            try? FileManager.default.removeItem(at: home.appendingPathComponent(".claude/sessions/\(file).json"))
        }
    }
}

func orcaChatTests() {
    test("an Orca chat is known by the id Orca exports to it, and found in Orca's agent list") {
        let environment = "123 ?? S claude TERM=xterm ORCA_TERMINAL_HANDLE=structworker_aa-7f "
            + "ORCA_AGENT_SESSION_ID=9f63e272-d66b HOME=/Users/me"
        expect(orcaChatID(in: environment), "9f63e272-d66b")
        expect(orcaChatID(in: "123 claude ORCA_AGENT_SESSION_ID=../x HOME=/"), nil, "an id Orca's CLI cannot take")
        expect(orcaChatID(in: "123 claude TERM=xterm"), nil)
        // a chat worker's handle is no terminal's, which Orca's CLI switches to
        expect(orcaHandle(in: environment), nil)

        let agents: [[String: Any]] = [
            [
                "orcaSessionId": "w1", "kind": "chat", "worktreeId": "r1::/work/ondine", "repo": "claude-mods",
                "workspace": "Improve session title mod", "paneKey": "structured-agent-session-w1:l1",
                "title": "claude-mods: improve session-title",
            ],
            // a bot's chat is in a folder workspace, of no repo
            [
                "orcaSessionId": "b1", "kind": "chat", "worktreeId": "folder:f1", "workspace": "Casper",
                "paneKey": "structured-agent-session-b1:l2", "title": "Casper",
            ],
            [
                "orcaSessionId": "claude_t1", "kind": "terminal", "worktreeId": "r1::/work", "repo": "x",
                "paneKey": "t1:l3", "title": "terminal",
            ],
            // the same chat open in a second place, and one that says nowhere
            ["orcaSessionId": "w1", "kind": "chat", "worktreeId": "r1::/work", "title": "again"],
            ["orcaSessionId": "w2", "kind": "chat", "title": "nowhere"],
        ]
        expect(orcaChats(in: agents), [
            "w1": OrcaChat(id: "w1", worktree: "r1::/work/ondine", title: "claude-mods: improve session-title",
                           project: "claude-mods"),
            "b1": OrcaChat(id: "b1", worktree: "folder:f1", title: "Casper", project: "Casper"),
        ])
    }

    test("an Orca chat's session goes by Orca's title and project, and keeps its own where Orca gives none") {
        let own = session(.idle)
        let named = own.named(by: OrcaChat(id: "c", worktree: "w", title: "pet: Orca chats", project: "mods"))
        expect(named.name, "pet: Orca chats")
        expect(named.project, "mods")
        let untitled = own.named(by: OrcaChat(id: "c", worktree: "w", title: "", project: "mods"))
        expect(untitled.name, "name")
        expect(untitled.project, "mods")
        let projectless = own.named(by: OrcaChat(id: "c", worktree: "w", title: "pet: Orca chats", project: ""))
        expect(projectless.name, "pet: Orca chats")
        expect(projectless.project, "project")
        // a bot's chat, which Orca titles by the bot's name, its project
        let bot = own.named(by: OrcaChat(id: "c", worktree: "w", title: "Casper", project: "Casper"))
        expect(bot.name, "name")
        expect(bot.project, "Casper")
        expect(own.named(by: nil), own, "a chat Orca does not list")
    }
}

func orcaOpenTests() {
    test("an Orca chat's row opens its tab in Orca, rather than the bot whose chat it may be") {
        // a process Orca runs as a chat; node, as `ps` shows no environment of the system's own programs
        let chat = Process()
        chat.executableURL = URL(fileURLWithPath: run("/usr/bin/which", ["node"])!
            .trimmingCharacters(in: .whitespacesAndNewlines))
        chat.arguments = ["-e", "setTimeout(() => {}, 30000)"]
        chat.environment = ["ORCA_AGENT_SESSION_ID": "9f63e272-d66b"]
        try! chat.run()
        defer { chat.terminate() }
        let session = Session(pid: chat.processIdentifier, id: "chat", name: "", project: "", phase: .idle,
                              reason: "", desktopID: "", updated: now, botID: "aef56e62-1634")
        expect(place(of: session), .orcaChat("9f63e272-d66b"))
        expect(Place.orcaChat("9f63e272-d66b").appName, "Orca")
        expect(Place.orcaChat("9f63e272-d66b").link, nil)
    }

    test("Orca's own Node brings a chat's tab forward, by the script that asks Orca's runtime for it") {
        let chat = OrcaChat(id: "c1", worktree: "r1::/work", title: "", project: "")
        let orca = URL(fileURLWithPath: "/Applications/Orca.app"), script = URL(fileURLWithPath: "/pet/orca-reveal.mjs")
        let command = [
            "ELECTRON_RUN_AS_NODE=1", "/Applications/Orca.app/Contents/MacOS/Orca", "/pet/orca-reveal.mjs",
            "/Applications/Orca.app/Contents/Resources/app.asar.unpacked/out/cli", "r1::/work", "c1",
        ]
        expect(revealCommand(chat, bot: "", orca: orca, script: script), command)
        expect(revealCommand(chat, bot: "b1", orca: orca, script: script), command + ["b1"], "a bot's chat:")
    }
}

/// Where the stand-ins the reveal script runs against are: Orca's CLI, a folder with `open`, the calls
/// they write down and the workspace Orca shows.
private let standIns = (
    cli: home.appendingPathComponent("orca-cli"), stubs: home.appendingPathComponent("orca-stubs"),
    calls: home.appendingPathComponent("reveal.jsonl").path, shown: home.appendingPathComponent("shown").path
)

/// A stand-in for Orca's CLI, whose runtime client writes down what it was asked, and shows the
/// workspace it is told to, a moment later, when Orca obeys; and one for `open`, which opens a bot's
/// link as Orca does.
private func writeStandIns() {
    let (cli, stubs) = (standIns.cli, standIns.stubs)
    for folder in [cli.appendingPathComponent("runtime/profile"), stubs] {
        try! FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    }
    try! """
        const { appendFileSync, readFileSync, writeFileSync } = require('node:fs')
        const { CALLS, SHOWN, OBEYED, REFUSED } = process.env
        const call = value => appendFileSync(CALLS, JSON.stringify(value) + '\\n')
        let showing = null
        exports.RuntimeClient = class {
          constructor(...args) { call(args) }
          async call(method, params) {
            call({ method, params })
            if (method === 'worktree.ps') {
              if (showing && Date.now() >= showing.at) writeFileSync(SHOWN, showing.worktree)
              const shown = readFileSync(SHOWN, 'utf8')
              const worktrees = ['r1::/other', 'r1::/work', 'folder:f1']
              return { result: { worktrees: worktrees.map(id => ({ worktreeId: id, isActive: id === shown })) } }
            }
            if (method === 'worktree.activate' && OBEYED === '1') {
              showing = { worktree: params.worktree.slice(3), at: Date.now() + 300 }
            }
            if (method === 'session.tabs.activate' && REFUSED === '1') throw new Error('tab_not_found')
            return { result: {} }
          }
        }
        """.write(to: cli.appendingPathComponent("runtime/client.js"), atomically: true, encoding: .utf8)
    try! "exports.getDefaultUserDataPath = () => '/data'"
        .write(to: cli.appendingPathComponent("runtime/profile/metadata.js"), atomically: true, encoding: .utf8)
    try! """
        #!/bin/sh
        printf '"open %s"\\n' "$1" >>"$CALLS"
        [ "$OBEYED" != 1 ] || printf folder:f1 >"$SHOWN"
        """.write(to: stubs.appendingPathComponent("open"), atomically: true, encoding: .utf8)
    _ = run("/bin/chmod", ["+x", stubs.appendingPathComponent("open").path])
}

/// Whether the reveal script took the person to chat c1 of the workspace, with Orca showing the
/// other, and the calls it made, each on a line: the client's arguments first.
private func reveal(_ worktree: String, bot: String = "", showing: String, obeyed: Bool = true,
                    refused: Bool = false) -> (taken: Bool, calls: [String]) {
    let script = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
        .appendingPathComponent("orca-reveal.mjs").path
    try? FileManager.default.removeItem(atPath: standIns.calls)
    try! showing.write(toFile: standIns.shown, atomically: true, encoding: .utf8)
    let path = standIns.stubs.path + ":" + (ProcessInfo.processInfo.environment["PATH"] ?? "")
    let taken = run("/usr/bin/env", [
        "PATH=\(path)", "CALLS=\(standIns.calls)", "SHOWN=\(standIns.shown)", "OBEYED=\(obeyed ? 1 : 0)",
        "REFUSED=\(refused ? 1 : 0)", "node", script, standIns.cli.path, worktree, "c1",
    ] + (bot.isEmpty ? [] : [bot]), timeout: 10) != nil
    let lines = (try? String(contentsOfFile: standIns.calls, encoding: .utf8)) ?? ""
    return (taken, lines.split(separator: "\n").map(String.init))
}

func orcaRevealTests() {
    writeStandIns()
    let client = #"["/data",null,null,null]"#, asked = #"{"method":"worktree.ps","params":{}}"#
    func activated(_ worktree: String) -> String {
        #"{"method":"session.tabs.activate","params":{"worktree":"id:\#(worktree)","tabId":"agent-session:c1","#
            + #""navigation":"host","intent":"user"}}"#
    }

    test("the script activates the chat's tab in the workspace Orca shows, and fails when Orca does not take it") {
        let shownAlready = reveal("r1::/work", showing: "r1::/work")
        expect(shownAlready.taken, true, "taken:")
        expect(shownAlready.calls, [client, asked, activated("r1::/work")])
        expect(reveal("r1::/work", showing: "r1::/work", refused: true).taken, false, "refused:")
    }

    test("the script shows a repo's workspace first, waits for Orca to show it, and fails when it does not") {
        let other = reveal("r1::/work", showing: "r1::/other")
        expect(other.taken, true, "taken:")
        expect(other.calls.filter { $0 != asked }, [
            client, #"{"method":"worktree.activate","params":{"worktree":"id:r1::/work","navigation":"host"}}"#,
            activated("r1::/work"),
        ])
        expect(other.calls.dropFirst().first, asked, "asked first:")
        let began = Date()
        let unshown = reveal("r1::/work", showing: "r1::/other", obeyed: false)
        expect(unshown.taken, false, "not shown:")
        expect(unshown.calls.contains(activated("r1::/work")), false, "a tab activated where Orca does not show it:")
        expect(Date().timeIntervalSince(began) < 6, true, "it gave up waiting:")
    }

    test("the script shows a bot's folder by the bot's link, and fails for a folder no bot has") {
        let bot = reveal("folder:f1", bot: "b1", showing: "r1::/other")
        expect(bot.taken, true, "taken:")
        expect(bot.calls, [client, asked, #""open orca://bot/b1""#, asked, activated("folder:f1")])
        let folder = reveal("folder:f1", showing: "r1::/other")
        expect(folder.taken, false, "a folder no bot has:")
        expect(folder.calls, [client, asked])
        expect(reveal("folder:f1", showing: "folder:f1").taken, true, "a folder Orca shows:")
    }
}

func orcaTests() {
    test("the Orca terminals in front are the picked pane of the picked tab, in the workspace shown") {
        func pane(_ handle: String, _ leaf: String) -> [String: Any] {
            ["type": "terminal", "handle": handle, "leafId": leaf]
        }
        func tab(_ id: String, leaf: String, _ panes: Any) -> [String: Any] {
            ["tabId": id, "activeLeafId": leaf, "panes": panes]
        }
        func group(active: String, _ tabs: [[String: Any]]) -> [String: Any] {
            ["type": "group", "activeTabId": active, "tabs": tabs]
        }
        let worktrees: [[String: Any]] = [
            ["worktreeId": "w1", "isActive": false], ["worktreeId": "w2", "isActive": true],
        ]
        let split: [String: Any] = [
            "type": "split",
            "children": [
                // two panes split in the tab picked, the one picked counts
                group(active: "t2", [
                    tab("t2", leaf: "l3", ["type": "split", "children": [pane("beside", "l2"), pane("front", "l3")]]),
                    tab("t3", leaf: "l4", pane("other tab", "l4")),
                ]),
                // a second group of the split shows its own picked tab
                group(active: "t4", [tab("t4", leaf: "l5", pane("second group", "l5"))]),
            ],
        ]
        let layouts: [[String: Any]] = [
            ["worktreeId": "w1", "root": group(active: "t1", [tab("t1", leaf: "l1", pane("hidden", "l1"))])],
            ["worktreeId": "w2", "root": split],
        ]

        expect(focusedHandles(worktrees: worktrees, layouts: layouts), ["front", "second group"])
        expect(focusedHandles(worktrees: [], layouts: layouts), [])
    }

    test("a folder is of the deepest Orca worktree it is in, and of none it only starts like") {
        let folders = ["/home", "/home/app", "/home/app/.claude/worktrees/agent-1"]
        expect(orcaFolder(of: "/home/app", among: folders), "/home/app")
        expect(orcaFolder(of: "/home/app/src", among: folders), "/home/app")
        expect(orcaFolder(of: "/home/app/.claude/worktrees/agent-1/src", among: folders),
               "/home/app/.claude/worktrees/agent-1")
        expect(orcaFolder(of: "/home/apple", among: folders), "/home")
        expect(orcaFolder(of: "/elsewhere", among: folders), nil)
    }

    test("the lucide drawings are read from Orca's script, as SVG elements without React's keys") {
        let script = "x=1,et=A(`gauge`,[[`path`,{d:`m12 14 4-4`,key:`9kzdfg`}],"
            + "[`circle`,{cx:`6`,cy:`6`,r:`3`,key:`a`}]]),"
            + "$e=A(`folder`,[[`path`,{d:`M20 20a2`,key:`b`}]]);u=[{name:`Gauge`,label:O(`k.1`,`Metrics`),icon:et},"
            + "{name:`Folder`,label:O(`k.2`,`Folder`),icon:$e},{name:`Gone`,label:O(`k.3`,`Gone`),icon:zz}]"
        expect(lucideDrawings(in: script), [
            "Gauge": #"<path d="m12 14 4-4"/><circle cx="6" cy="6" r="3"/>"#,
            "Folder": #"<path d="M20 20a2"/>"#,
        ])
    }
}
