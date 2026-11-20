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

/// The same, asked of Orca's CLI, while Orca is the app at the front; none while another one is.
/// Asked on the main thread, so it waits briefly for an answer.
func focusedOrcaHandles() -> Set<String> {
    guard NSWorkspace.shared.frontmostApplication?.bundleIdentifier == orcaBundleID,
          let orca = NSWorkspace.shared.urlForApplication(withBundleIdentifier: orcaBundleID) else { return [] }
    let cli = orca.appendingPathComponent("Contents/Resources/bin/orca").path
    func result(_ arguments: [String]) -> [String: Any]? {
        guard let output = run(cli, arguments + ["--json"], timeout: 2),
              let json = orNil("reading orca \(arguments.joined(separator: " "))", {
                  try JSONSerialization.jsonObject(with: Data(output.utf8)) as? [String: Any]
              }) ?? nil else { return nil }
        return json["result"] as? [String: Any]
    }
    return focusedHandles(worktrees: result(["worktree", "ps"])?["worktrees"] as? [[String: Any]] ?? [],
                          layouts: result(["terminal", "list", "--include-visual-layouts"])?["visualLayouts"]
                              as? [[String: Any]] ?? [])
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
        guard let cli = app?.appendingPathComponent("Contents/Resources/bin/orca").path else { return }
        DispatchQueue.global(qos: .utility).async { [self] in
            func result(_ arguments: [String], _ key: String) -> [[String: Any]] {
                guard let output = run(cli, arguments + ["--json"]),
                      let json = orNil("reading orca \(arguments.joined(separator: " "))", {
                          try JSONSerialization.jsonObject(with: Data(output.utf8)) as? [String: Any]
                      }) ?? nil else { return [] }
                return (json["result"] as? [String: Any])?[key] as? [[String: Any]] ?? []
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
