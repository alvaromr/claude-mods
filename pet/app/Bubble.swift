// The speech bubble: its tabs and rows, and the tail that points back at the pet.

import AppKit

let tailHeight: CGFloat = 9

/// On which side of the pet the bubble sits; its tail points back at the pet from the edge that faces it.
enum Side: Int {
    case above, below, left, right

    var isVertical: Bool { self == .above || self == .below }
    var opposite: Side { [.below, .above, .right, .left][rawValue] }
}

/// A view whose rows run from the top down.
final class FlippedView: NSView {
    override var isFlipped: Bool { true }
}

final class BubbleView: NSView {
    var onPress: (Row, _ isDouble: Bool) -> Void = { _, _ in }
    var onSeen: (Row) -> Void = { _ in }
    var onClose: (Row) -> Void = { _ in }
    var onTab: (Int) -> Void = { _ in }
    private let tabs = NSSegmentedControl(labels: [], trackingMode: .selectOne, target: nil, action: nil)
    /// The tabs and the rows, which take the whole bubble but its tail.
    private let content = FlippedView()
    private var side = Side.above
    /// How far along the edge that faces the pet the tail is, from the bubble's left or top.
    private var tailAt: CGFloat = 0

    override var isFlipped: Bool { true }

    private var body: NSRect {
        NSRect(origin: NSPoint(x: side == .right ? tailHeight : 0, y: side == .below ? tailHeight : 0),
               size: content.frame.size)
    }

    /// The size of the whole bubble, tail and all, when it sits on that side of the pet.
    func size(on side: Side) -> NSSize {
        let size = content.frame.size
        return side.isVertical ? NSSize(width: size.width, height: size.height + tailHeight)
            : NSSize(width: size.width + tailHeight, height: size.height)
    }

    /// Replaces the tabs and the rows.
    func show(tabs titles: [String], selected: Int, rows: [Row]) {
        let width = Settings.bubbleSize.width
        if content.superview == nil { addSubview(content) }
        content.subviews.forEach { $0.removeFromSuperview() }

        tabs.target = self
        tabs.action = #selector(pick)
        tabs.segmentCount = titles.count
        for (segment, title) in titles.enumerated() { tabs.setLabel(title, forSegment: segment) }
        tabs.selectedSegment = selected
        tabs.segmentDistribution = .fillProportionally
        tabs.controlSize = .small
        tabs.font = .systemFont(ofSize: NSFont.systemFontSize(for: .small))
        tabs.sizeToFit()
        tabs.frame = NSRect(x: 8, y: 9, width: width - 16, height: tabs.frame.height)
        content.addSubview(tabs)

        var y = tabs.frame.maxY + 5
        for (index, row) in rows.enumerated() {
            let view = RowView(row, isFirst: index == 0, onPress: { [unowned self] in onPress(row, $0) },
                               onSeen: { [unowned self] in onSeen(row) }, onClose: { [unowned self] in onClose(row) })
            view.frame = NSRect(x: 0, y: y, width: width, height: view.height)
            content.addSubview(view)
            y += view.height
        }
        content.setFrameSize(NSSize(width: width, height: y + 6))
    }

    @objc private func pick() { onTab(tabs.selectedSegment) }

    /// Sits the bubble on that side of the pet, with its tail `offset` along the edge that faces it.
    func point(from side: Side, at offset: CGFloat) {
        self.side = side
        let size = content.frame.size
        tailAt = min(max(offset, 22), (side.isVertical ? size.width : size.height) - 22)
        content.setFrameOrigin(body.origin)
        needsDisplay = true
    }

    override func draw(_ dirtyRect: NSRect) {
        let outline = NSBezierPath(roundedRect: body.insetBy(dx: 0.5, dy: 0.5), xRadius: 12, yRadius: 12)
        NSColor.windowBackgroundColor.setFill()
        NSColor.separatorColor.setStroke()
        outline.fill()
        outline.stroke()

        // the tail starts a point inside the body, so it covers the outline between them
        let tip: NSPoint, base: (NSPoint, NSPoint)
        switch side {
        case .above:
            tip = NSPoint(x: tailAt, y: bounds.maxY - 0.5)
            base = (NSPoint(x: tailAt - 8, y: body.maxY - 1.5), NSPoint(x: tailAt + 8, y: body.maxY - 1.5))
        case .below:
            tip = NSPoint(x: tailAt, y: 0.5)
            base = (NSPoint(x: tailAt - 8, y: body.minY + 1.5), NSPoint(x: tailAt + 8, y: body.minY + 1.5))
        case .left:
            tip = NSPoint(x: bounds.maxX - 0.5, y: tailAt)
            base = (NSPoint(x: body.maxX - 1.5, y: tailAt - 8), NSPoint(x: body.maxX - 1.5, y: tailAt + 8))
        case .right:
            tip = NSPoint(x: 0.5, y: tailAt)
            base = (NSPoint(x: body.minX + 1.5, y: tailAt - 8), NSPoint(x: body.minX + 1.5, y: tailAt + 8))
        }
        let tail = NSBezierPath()
        tail.move(to: base.0)
        tail.line(to: tip)
        tail.line(to: base.1)
        tail.fill()
        tail.stroke()
    }
}
