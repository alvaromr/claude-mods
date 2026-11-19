// A row of the bubble: a session, or a note where there is none, and the view that draws it.

import AppKit

enum Row: Equatable {
    case note(String)
    /// `ago` is how long since it last changed, `message` what the large bubble shows under it,
    /// `icon` the one Orca gives its project, when Ajustes asks for it before the project.
    case session(Session, ago: String, place: Place, message: String, icon: NSImage?)

    var isPressable: Bool {
        if case .session(_, _, let place, _, _) = self { return place != .nowhere }
        return false
    }

    /// Whether the person can say they have seen it: one that waits, and is not stuck on them.
    var isDismissible: Bool {
        if case .session(let session, _, _, _, _) = self {
            return session.phase == .idle && session.group(at: Date()) == .waiting
        }
        return false
    }
}

/// The mark before a session's name (see `Mark`), where it sits, and what it says in the detail
/// under the name and when pointed at.
private struct RowMark {
    let kind: Mark
    let box: NSRect
    let label: String
    let tip: String
}

final class RowView: NSView {
    private let row: Row
    private let isFirst: Bool
    private let size = Settings.bubbleSize
    /// Pressed, with whether it was the second click of a double one.
    private let onPress: (_ isDouble: Bool) -> Void
    private let onSeen: () -> Void
    private let onClose: () -> Void
    private var isHovered = false { didSet { needsDisplay = true } }
    private let nameFont = NSFont.systemFont(ofSize: 13), smallFont = NSFont.systemFont(ofSize: 11)

    /// What it shows large as Ajustes picks, and the other of its name and project, unless it says the same.
    private var lines: (headline: String, other: String) {
        guard case .session(let session, _, _, _, _) = row else { return ("", "") }
        let (headline, other) = Settings.headline == .project ? (session.project, session.name)
                                                               : (session.name, session.project)
        return (headline, other == headline ? "" : other)
    }

    /// What its mark says in short, then the other of its name and project, how long ago, and that
    /// it cannot be opened when it cannot.
    private var detail: String {
        guard case .session(_, let ago, _, _, _) = row else { return "" }
        return ([mark?.label ?? "", lines.other, ago].filter { !$0.isEmpty }
            + (row.isPressable ? [] : [Text.noWindow])).joined(separator: " · ")
    }

    /// As tall as the message is in the large bubble, up to three lines; nothing elsewhere.
    private var messageHeight: CGFloat {
        guard size == .large, case .session(_, _, _, let message, _) = row, !message.isEmpty else { return 0 }
        // measured as it is drawn, so the box is no taller than the lines that end up in it
        let line = ("x" as NSString).size(withAttributes: [.font: smallFont]).height
        return ceil((message as NSString).boundingRect(
            with: NSSize(width: size.width - 24, height: 3 * line),
            options: [.usesLineFragmentOrigin, .truncatesLastVisibleLine], attributes: [.font: smallFont]).height)
    }

    /// The room over the name: more where a hairline parts the rows, as much as is left under their last line.
    private var top: CGFloat { size == .compact ? 4 : 8 }
    private var line: NSRect { bounds.insetBy(dx: 12, dy: 0) }

    /// The row's mark, if its session has one.
    private var mark: RowMark? {
        guard case .session(let session, _, _, _, _) = row, let kind = Mark.of(session) else { return nil }
        return RowMark(kind: kind, box: NSRect(x: line.minX, y: top + 3, width: 11, height: 11),
                       label: kind.label(for: session), tip: kind.tip(for: session))
    }

    /// Where the icon of the app the row opens sits, at the end of the name's line; none in the compact bubble.
    private var appBox: NSRect? {
        guard case .session(_, _, let place, _, _) = row, size != .compact, place.icon != nil else { return nil }
        return NSRect(x: line.maxX - 16, y: top + 1, width: 16, height: 16)
    }

    /// What each icon says when pointed at, over where it is drawn.
    private var tips: [(box: NSRect, tip: String)] {
        var tips: [(box: NSRect, tip: String)] = []
        if let mark { tips.append((mark.box.insetBy(dx: -3, dy: -3), mark.tip)) }
        if let appBox, case .session(_, _, let place, _, _) = row, let app = place.appName {
            tips.append((appBox, Text.openIn(app)))
        }
        return tips
    }

    /// The tips registered, by the tag AppKit gave each.
    private var tipsByTag: [NSView.ToolTipTag: String] = [:]

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        // the row is laid out before it joins the bubble; the view answers for its tips itself, as
        // AppKit does not keep the owner it is given
        removeAllToolTips()
        tipsByTag = Dictionary(tips.map { (addToolTip($0.box, owner: self, userData: nil), $0.tip) },
                               uniquingKeysWith: { first, _ in first })
    }

    var height: CGFloat {
        guard case .session = row else { return 30 }
        return size == .compact ? 26 : 47 + (messageHeight > 0 ? messageHeight + 4 : 0)
    }

    init(_ row: Row, isFirst: Bool, onPress: @escaping (Bool) -> Void, onSeen: @escaping () -> Void,
         onClose: @escaping () -> Void) {
        self.row = row
        self.isFirst = isFirst
        self.onPress = onPress
        self.onSeen = onSeen
        self.onClose = onClose
        super.init(frame: .zero)
        if case .session = row {
            let menu = NSMenu()
            if row.isDismissible {
                menu.addItem(withTitle: Text.markSeen, action: #selector(markSeen), keyEquivalent: "").target = self
            }
            menu.addItem(withTitle: Text.closeSession, action: #selector(closeSession), keyEquivalent: "").target = self
            self.menu = menu
        }
        setAccessibilityElement(true)
        setAccessibilityRole(row.isPressable ? .button : .staticText)
        switch row {
        case .note(let text): setAccessibilityLabel(text)
        case .session(_, _, _, let message, _): setAccessibilityLabel("\(lines.headline), \(detail). \(message)")
        }
    }

    required init?(coder: NSCoder) { fatalError("not loaded from a nib") }

    override var isFlipped: Bool { true }
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }

    override func updateTrackingAreas() {
        // its own alone: AppKit keeps the tooltips' in the same list
        trackingAreas.filter { $0.owner as AnyObject? === self }.forEach(removeTrackingArea)
        guard row.isPressable else { return }
        addTrackingArea(NSTrackingArea(rect: .zero, options: [.mouseEnteredAndExited, .activeAlways, .inVisibleRect],
                                       owner: self))
    }

    override func mouseEntered(with event: NSEvent) { isHovered = true }
    override func mouseExited(with event: NSEvent) { isHovered = false }

    /// The second click of a double one closes the bubble too: the first already took the person there.
    override func mouseUp(with event: NSEvent) {
        if row.isPressable && bounds.contains(convert(event.locationInWindow, from: nil)) {
            onPress(event.clickCount > 1)
        }
    }

    override func accessibilityPerformPress() -> Bool {
        guard row.isPressable else { return false }
        onPress(false)
        return true
    }

    override func accessibilityPerformShowMenu() -> Bool {
        menu?.popUp(positioning: nil, at: NSPoint(x: bounds.midX, y: bounds.midY), in: self)
        return menu != nil
    }

    @objc private func markSeen() { onSeen() }
    @objc private func closeSession() { onClose() }

    override func draw(_ dirtyRect: NSRect) {
        if isHovered {
            NSColor.labelColor.withAlphaComponent(0.08).setFill()
            NSBezierPath(roundedRect: bounds.insetBy(dx: 5, dy: 1), xRadius: 6, yRadius: 6).fill()
        }
        // a hairline between one row and the next, where rows have lines enough to run together
        if !isFirst && size != .compact {
            NSColor.separatorColor.setFill()
            NSRect(x: line.minX, y: 0, width: line.width, height: 1).fill()
        }
        switch row {
        case .note(let text):
            write(text, in: NSRect(x: line.minX, y: 7, width: line.width, height: 18), font: smallFont,
                  color: .secondaryLabelColor)
        case .session(_, let ago, let place, let message, let icon):
            let nameColor: NSColor = row.isPressable ? .labelColor : .tertiaryLabelColor
            var name = NSRect(x: line.minX, y: top, width: line.width, height: 18)
            if let mark {
                mark.kind.image()?.draw(in: mark.box, from: .zero, operation: .sourceOver, fraction: 1,
                                        respectFlipped: true, hints: nil)
                name = NSRect(x: line.minX + 16, y: top, width: line.width - 16, height: 18)
            }
            // after the mark, the icon Orca gives the project the line starts with
            if let icon {
                icon.draw(in: NSRect(x: name.minX, y: top + 2, width: 14, height: 14), from: .zero,
                          operation: .sourceOver, fraction: 1, respectFlipped: true, hints: nil)
                name = NSRect(x: name.minX + 18, y: top, width: name.width - 18, height: 18)
            }
            guard size != .compact else {
                // the one line it has is the headline's, less the room how long ago takes at its end
                let agoWidth = ceil((ago as NSString).size(withAttributes: [.font: smallFont]).width)
                name.size.width -= agoWidth + 8
                write(lines.headline, in: name, font: nameFont, color: nameColor)
                write(ago, in: NSRect(x: line.maxX - agoWidth, y: top + 2, width: agoWidth, height: 16),
                      font: smallFont, color: .secondaryLabelColor)
                return
            }
            // at the end of the name's line, the app the row opens
            if let appBox, let icon = place.icon {
                icon.draw(in: appBox, from: .zero, operation: .sourceOver, fraction: 1, respectFlipped: true,
                          hints: nil)
                name.size.width -= 22
            }
            write(lines.headline, in: name, font: nameFont, color: nameColor)
            write(detail, in: NSRect(x: line.minX, y: top + 17, width: line.width, height: 16), font: smallFont,
                  color: .secondaryLabelColor)
            write(message, in: NSRect(x: line.minX, y: top + 35, width: line.width, height: messageHeight),
                  font: smallFont, color: .labelColor)
        }
    }

    /// Draws the text in the box, as many lines as fit it, the last one cut short with an ellipsis.
    private func write(_ string: String, in box: NSRect, font: NSFont, color: NSColor) {
        (string as NSString).draw(with: box, options: [.usesLineFragmentOrigin, .truncatesLastVisibleLine],
                                  attributes: [.font: font, .foregroundColor: color])
    }
}

extension RowView: NSViewToolTipOwner {
    func view(_ view: NSView, stringForToolTip tag: NSView.ToolTipTag, point: NSPoint,
              userData data: UnsafeMutableRawPointer?) -> String {
        tipsByTag[tag] ?? ""
    }
}
