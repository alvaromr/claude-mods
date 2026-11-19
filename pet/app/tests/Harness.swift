// What every test file uses: the checks, the count of failures, and the home they write to.

import AppKit

var failures = 0

func expect<Value: Equatable>(_ got: Value, _ wanted: Value, _ what: String = "", line: UInt = #line) {
    if got == wanted { return }
    failures += 1
    print("  line \(line): \(what) got \(got), wanted \(wanted)")
}

func expectNear(_ got: CGFloat, _ wanted: CGFloat, _ what: String = "", line: UInt = #line) {
    if abs(got - wanted) < 0.01 { return }
    failures += 1
    print("  line \(line): \(what) got \(got), wanted \(wanted)")
}

func test(_ name: String, _ body: () -> Void) {
    let before = failures
    body()
    print("\(failures == before ? "✓" : "✗") \(name)")
}

let home = FileManager.default.homeDirectoryForCurrentUser
let now = Date()

/// Writes the lines, one JSON value to each, where the pet reads them from.
func write(_ lines: [[String: Any]], to path: String) {
    let file = home.appendingPathComponent(path)
    try! FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
    let text = lines.map { lossyText(try! JSONSerialization.data(withJSONObject: $0)) }
    try! text.joined(separator: "\n").write(to: file, atomically: true, encoding: .utf8)
}

/// The same for a single line.
func write(_ line: [String: Any], to path: String) {
    write([line], to: path)
}

func session(_ phase: Phase, minutesAgo: Double = 0, isSeen: Bool = false, desktopID: String = "") -> Session {
    Session(pid: 1, id: "id", name: "name", project: "project", phase: phase, reason: "", desktopID: desktopID,
            updated: now.addingTimeInterval(-minutesAgo * 60), isSeen: isSeen)
}
