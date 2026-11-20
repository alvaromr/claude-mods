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
