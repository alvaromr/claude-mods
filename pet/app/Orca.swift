// What the pet asks of Orca, the terminal app it knows best: which terminals are in front, the
// folders of its worktrees and the icon each of its projects has.

import AppKit

let orcaBundleID = "com.stablyai.orca"

/// Orca exports ORCA_TERMINAL_HANDLE to every terminal it manages, so a claude
/// launched there carries the handle of the tab it lives in, in its environment as `ps eww` says it.
func orcaHandle(in environment: String) -> String? {
    guard let match = environment.range(of: #"\bORCA_TERMINAL_HANDLE=term_[0-9a-f-]+"#, options: .regularExpression)
    else { return nil }
    return String(environment[match].split(separator: "=")[1])
}

/// Orca exports ORCA_AGENT_SESSION_ID to every agent it runs as a chat, a worker's or a bot's, which
/// has a tab of its own and no terminal: the id `orca agent list` gives that chat.
func orcaChatID(in environment: String) -> String? {
    guard let match = environment.range(of: #"\bORCA_AGENT_SESSION_ID=[A-Za-z0-9_-]{1,128}(?=\s|$)"#,
                                        options: .regularExpression) else { return nil }
    return String(environment[match].split(separator: "=")[1])
}

/// A chat Orca runs, as its agent list tells it: its id, the workspace it is in, the title Orca
/// shows for it, and its project by the name Orca gives it.
struct OrcaChat: Equatable {
    let id: String
    let worktree: String
    let title: String
    let project: String
}

/// The chats of Orca's agent list, by their id, the first place of one open in two. A chat in a
/// folder workspace, as a bot's, is of no repo, and its project is the workspace.
func orcaChats(in agents: [[String: Any]]) -> [String: OrcaChat] {
    var chats: [String: OrcaChat] = [:]
    for agent in agents where agent["kind"] as? String == "chat" {
        guard let id = agent["orcaSessionId"] as? String, chats[id] == nil,
              let worktree = agent["worktreeId"] as? String else { continue }
        let repo = agent["repo"] as? String ?? ""
        chats[id] = OrcaChat(id: id, worktree: worktree, title: agent["title"] as? String ?? "",
                             project: repo.isEmpty ? agent["workspace"] as? String ?? "" : repo)
    }
    return chats
}

extension Session {
    /// The session as Orca shows the chat it is: by Orca's title for it and its project. Its own name
    /// is kept where Orca gives no title, or one that only repeats the project, as a bot's chat has
    /// the bot's name; its own project where Orca gives none.
    func named(by chat: OrcaChat?) -> Session {
        guard let chat else { return self }
        var named = self
        if !chat.title.isEmpty && chat.title != chat.project { named.name = chat.title }
        if !chat.project.isEmpty { named.project = chat.project }
        return named
    }
}

/// The chats Orca runs, as its agent list last said, asked again every 10 s off the main thread
/// while there is a chat to ask of.
final class OrcaChats {
    private var chats: [String: OrcaChat] = [:]
    private var asked = Date.distantPast

    /// The chat by that id, if Orca lists it.
    func chat(_ id: String) -> OrcaChat? {
        if Date().timeIntervalSince(asked) > 10 {
            asked = Date()
            DispatchQueue.global(qos: .utility).async {
                // none when Orca does not answer: what it said before still holds
                guard let agents = askOrca(["agent", "list"])?["agents"] as? [[String: Any]] else { return }
                let chats = orcaChats(in: agents)
                DispatchQueue.main.async { self.chats = chats }
            }
        }
        return chats[id]
    }
}

/// The command, for `/usr/bin/env`, that brings the chat's tab forward in Orca, the app at `orca`:
/// the script that asks Orca's runtime for it (orca-reveal.mjs), run by Orca's own Node.
func revealCommand(_ chat: OrcaChat, orca: URL, script: URL) -> [String] {
    [
        "ELECTRON_RUN_AS_NODE=1", orca.appendingPathComponent("Contents/MacOS/Orca").path, script.path,
        orca.appendingPathComponent("Contents/Resources/app.asar.unpacked/out/cli").path, chat.worktree, chat.id,
    ]
}

/// The Orca bot whose own folder this is, as the bot.json Orca keeps there says: its id, which
/// Orca's `orca://bot/<id>` links take, and its name. None for a folder that is no bot's, nor for
/// a bot.json with no name or with an id no link can take.
func orcaBot(in folder: String) -> (id: String, name: String)? {
    let file = URL(fileURLWithPath: folder).appendingPathComponent("bot.json")
    guard !folder.isEmpty, FileManager.default.fileExists(atPath: file.path),
          let fields = orNil("reading \(file.path)", {
              try JSONSerialization.jsonObject(with: Data(contentsOf: file)) as? [String: Any]
          }) ?? nil,
          let id = fields["id"] as? String,
          id.range(of: #"^[A-Za-z0-9_-]{1,128}$"#, options: .regularExpression) != nil,
          let name = fields["name"] as? String, !name.isEmpty else { return nil }
    return (id, name)
}

/// The Orca terminals the person has in front of them: in the workspace Orca shows, the pane picked
/// in the tab picked of each group. Orca does not say which group of a split has the keyboard, so
/// each of them counts.
func focusedHandles(worktrees: [[String: Any]], layouts: [[String: Any]]) -> Set<String> {
    guard let shown = worktrees.first(where: { $0["isActive"] as? Bool == true })?["worktreeId"] as? String,
          let layout = layouts.first(where: { $0["worktreeId"] as? String == shown }) else { return [] }
    var handles: Set<String> = []
    // a node is a group of tabs, a terminal pane, or something that holds nodes (a split)
    func walk(_ node: Any?, leaf: String?) {
        if let nodes = node as? [Any] { return nodes.forEach { walk($0, leaf: leaf) } }
        guard let node = node as? [String: Any] else { return }
        if let tabs = node["tabs"] as? [[String: Any]] {
            for tab in tabs where tab["tabId"] as? String == node["activeTabId"] as? String {
                walk(tab["panes"], leaf: tab["activeLeafId"] as? String)
            }
        } else if node["type"] as? String == "terminal" {
            if node["leafId"] as? String == leaf, let handle = node["handle"] as? String { handles.insert(handle) }
        } else {
            node.values.forEach { walk($0, leaf: leaf) }
        }
    }
    walk(layout["root"], leaf: nil)
    return handles
}

/// What Orca's CLI answers the command with, its `--json` result; nil when Orca is not installed,
/// fails or does not answer within `timeout` seconds.
func askOrca(_ arguments: [String], timeout: TimeInterval = 5) -> [String: Any]? {
    guard let orca = NSWorkspace.shared.urlForApplication(withBundleIdentifier: orcaBundleID),
          let output = run(orca.appendingPathComponent("Contents/Resources/bin/orca").path, arguments + ["--json"],
                           timeout: timeout),
          let json = orNil("reading orca \(arguments.joined(separator: " "))", {
              try JSONSerialization.jsonObject(with: Data(output.utf8)) as? [String: Any]
          }) ?? nil else { return nil }
    return json["result"] as? [String: Any]
}

/// The same, asked of Orca's CLI, while Orca is the app at the front; none while another one is.
/// Asked on the main thread, so it waits briefly for an answer.
func focusedOrcaHandles() -> Set<String> {
    guard NSWorkspace.shared.frontmostApplication?.bundleIdentifier == orcaBundleID else { return [] }
    let worktrees = askOrca(["worktree", "ps"], timeout: 2)?["worktrees"]
    let layouts = askOrca(["terminal", "list", "--include-visual-layouts"], timeout: 2)?["visualLayouts"]
    return focusedHandles(worktrees: worktrees as? [[String: Any]] ?? [], layouts: layouts as? [[String: Any]] ?? [])
}

/// Of Orca's worktree folders, the one the folder is in: the deepest, as one can hold another.
func orcaFolder(of cwd: String, among folders: [String]) -> String? {
    folders.filter { cwd == $0 || cwd.hasPrefix($0.hasSuffix("/") ? $0 : $0 + "/") }.max { $0.count < $1.count }
}

/// The lucide drawings of Orca's project icon picker, by the name Orca keeps for each, as the
/// SVG elements they are made of. Orca ships them only inside its scripts, minified as
/// `{name:`Gauge`,…,icon:et}` and `et=A(`gauge`,[[`path`,{d:`…`,key:`…`}],…])`.
func lucideDrawings(in script: String) -> [String: String] {
    func groups(_ pattern: String, in text: String, first: Bool = false) -> [[String]] {
        guard let expression = orNil("reading Orca's icons", { try NSRegularExpression(pattern: pattern) }) else {
            return []
        }
        let whole = NSRange(text.startIndex..., in: text)
        let matches = first ? expression.firstMatch(in: text, range: whole).map { [$0] } ?? []
            : expression.matches(in: text, range: whole)
        return matches.map { match in
            (1..<match.numberOfRanges).map { Range(match.range(at: $0), in: text).map { String(text[$0]) } ?? "" }
        }
    }
    var drawings: [String: String] = [:]
    for entry in groups(#"\{name:`(\w+)`,label:[^{}]*?,icon:([\w$]+)\}"#, in: script) {
        let definition = #"[,;\s]"# + NSRegularExpression.escapedPattern(for: entry[1])
            + #"=[\w$]+\(`[\w-]+`,(\[\[.*?\]\])\)"#
        guard let nodes = groups(definition, in: script, first: true).first?[0] else { continue }
        drawings[entry[0]] = groups(#"\[`(\w+)`,\{(.*?)\}\]"#, in: nodes).map { node in
            let attributes = groups(#"(\w+):`([^`"<>]*)`"#, in: node[1]).filter { $0[0] != "key" }
            return "<\(node[0])" + attributes.map { " \($0[0])=\"\($0[1])\"" }.joined() + "/>"
        }.joined()
    }
    return drawings
}

/// The icon Orca gives the project of each of its folders, as its sidebar draws it: an emoji, a
/// picture, or a lucide drawing in the project's color, the folder one when it was given none.
final class OrcaIcons {
    /// Each worktree folder Orca knows, with its project's icon as Orca keeps it and its color.
    private var folders: [String: (icon: [String: Any]?, color: String)] = [:]
    private var asked = Date.distantPast
    /// Each icon drawn, by what it is, so the same one stays the same image and the bubble is not redrawn.
    private var images: [String: NSImage] = [:]
    /// Pictures on the web on their way, by their address, so each is fetched once.
    private var fetching: Set<String> = []
    private lazy var lucide = readLucide()

    private var app: URL? { NSWorkspace.shared.urlForApplication(withBundleIdentifier: orcaBundleID) }

    /// The icon of the project the folder is in, if Orca knows it; what Orca says is asked again every 30 s.
    func icon(of cwd: String) -> NSImage? {
        if Date().timeIntervalSince(asked) > 30 { ask() }
        guard let folder = orcaFolder(of: cwd, among: Array(folders.keys)),
              let project = folders[folder] else { return nil }
        return image(of: project.icon, color: project.color)
    }

    /// Asks Orca off the main thread, which it answers from the next look on.
    private func ask() {
        asked = Date()
        DispatchQueue.global(qos: .utility).async { [self] in
            func result(_ arguments: [String], _ key: String) -> [[String: Any]] {
                askOrca(arguments)?[key] as? [[String: Any]] ?? []
            }
            let repos = Dictionary(result(["repo", "list"], "repos").map { ($0["id"] as? String ?? "", $0) },
                                   uniquingKeysWith: { first, _ in first })
            let worktrees = result(["worktree", "list"], "worktrees")
            // none when Orca does not answer: what it said before still holds
            guard !repos.isEmpty else { return }
            let folders: [String: (icon: [String: Any]?, color: String)] = Dictionary(worktrees.compactMap { worktree in
                guard let path = worktree["path"] as? String,
                      let repo = repos[worktree["repoId"] as? String ?? ""] else { return nil }
                let color = repo["badgeColor"] as? String ?? ""
                let isColor = color.range(of: "^#[0-9A-Fa-f]{3,8}$", options: .regularExpression) != nil
                return (path, (repo["repoIcon"] as? [String: Any], isColor ? color : "#737373"))
            }) { first, _ in first }
            DispatchQueue.main.async { self.folders = folders }
        }
    }

    private func image(of icon: [String: Any]?, color: String) -> NSImage? {
        let type = icon?["type"] as? String
        let key: String
        switch type {
        case "emoji": key = "emoji:" + (icon?["emoji"] as? String ?? "")
        case "image": key = "image:" + (icon?["src"] as? String ?? "")
        default: key = "lucide:\(type == "lucide" ? icon?["name"] as? String ?? "" : "Folder"):\(color)"
        }
        if let image = images[key] { return image }
        switch type {
        case "emoji":
            images[key] = emojiImage(icon?["emoji"] as? String ?? "")
        case "image":
            guard let src = icon?["src"] as? String, let url = URL(string: src) else { return nil }
            load(from: url, src: src, key: key)
        default:
            guard let name = key.split(separator: ":").dropFirst().first,
                  let elements = lucide[String(name)] else { return nil }
            images[key] = lucideImage(elements, color: color)
        }
        return images[key]
    }

    /// The emoji, centred in the square an icon of the bubble takes.
    private func emojiImage(_ text: String) -> NSImage {
        let emoji = text as NSString
        return NSImage(size: NSSize(width: 14, height: 14), flipped: false) { box in
            let attributes: [NSAttributedString.Key: Any] = [.font: NSFont.systemFont(ofSize: 12)]
            let size = emoji.size(withAttributes: attributes)
            emoji.draw(at: NSPoint(x: box.midX - size.width / 2, y: box.midY - size.height / 2),
                       withAttributes: attributes)
            return true
        }
    }

    /// Reads the picture at once when it is in the address, or fetches it off the web.
    private func load(from url: URL, src: String, key: String) {
        if url.scheme == "data" {
            images[key] = orNil("reading an icon") { try Data(contentsOf: url) }.flatMap(NSImage.init(data:))
        } else if ["http", "https"].contains(url.scheme), !fetching.contains(src) {
            // it shows from the refresh after it arrives
            fetching.insert(src)
            URLSession.shared.dataTask(with: url) { data, response, error in
                let status = (response as? HTTPURLResponse)?.statusCode ?? 200
                DispatchQueue.main.async {
                    if let error { _ = orNil("fetching \(src)") { throw error } }
                    if status >= 400 { _ = orNil("fetching \(src)") { throw URLError(.badServerResponse) } }
                    self.images[key] = status < 400 ? data.flatMap(NSImage.init(data:)) : nil
                }
            }.resume()
        }
    }

    /// The lucide drawing, whose elements these are, as an image in the color.
    private func lucideImage(_ elements: String, color: String) -> NSImage? {
        let svg = #"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" "#
            + #"viewBox="0 0 24 24" fill="none" stroke="\#(color)" "#
            + #"stroke-width="2" stroke-linecap="round" stroke-linejoin="round">"#
            + elements + "</svg>"
        return NSImage(data: Data(svg.utf8))
    }

    /// The lucide drawings, from the one of Orca's scripts that holds its icon picker.
    private func readLucide() -> [String: String] {
        guard let assets = app?.appendingPathComponent("Contents/Resources/app.asar.unpacked/out/renderer/assets"),
              let files = orNil("listing Orca's scripts", {
                  try FileManager.default.contentsOfDirectory(at: assets, includingPropertiesForKeys: nil)
              })
        else { return [:] }
        for file in files where file.pathExtension == "js" {
            guard let script = orNil("reading \(file.lastPathComponent) of Orca", {
                try String(contentsOf: file, encoding: .utf8)
            }), script.contains("{name:`Folder`") else { continue }
            return lucideDrawings(in: script)
        }
        return [:]
    }
}
