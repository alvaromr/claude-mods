// The Ayuda window: what every tab, mark and place of the pet and its bubble means.

import AppKit

private func heading(_ text: String) -> [NSView] {
    let label = NSTextField(labelWithString: text)
    label.font = NSFont.boldSystemFont(ofSize: NSFont.systemFontSize)
    return [label]
}

private func explained(_ icon: NSView, _ text: String) -> [NSView] {
    let label = NSTextField(wrappingLabelWithString: text)
    // wide enough for the whole help to fit a laptop's screen with no scrolling
    label.preferredMaxLayoutWidth = 760
    return [icon, label]
}

/// A row whose left column is a word, not an icon.
private func named(_ name: String, _ text: String) -> [NSView] {
    let label = NSTextField(labelWithString: name)
    label.textColor = .secondaryLabelColor
    return explained(label, text)
}

private func picture(_ image: NSImage?, side: CGFloat) -> NSView {
    guard let image else { return NSGridCell.emptyContentView }
    let view = NSImageView(image: image)
    view.translatesAutoresizingMaskIntoConstraints = false
    NSLayoutConstraint.activate([
        view.widthAnchor.constraint(equalToConstant: side),
        view.heightAnchor.constraint(equalToConstant: side),
    ])
    return view
}

private func badge(isAnyBlocked: Bool) -> NSView {
    let label = NSTextField(labelWithString: "2")
    label.font = NSFont.boldSystemFont(ofSize: 11)
    label.textColor = .white
    label.alignment = .center
    label.wantsLayer = true
    label.layer?.backgroundColor = PetView.badgeColor(isAnyBlocked: isAnyBlocked).cgColor
    label.layer?.cornerRadius = 8
    label.translatesAutoresizingMaskIntoConstraints = false
    NSLayoutConstraint.activate([
        label.widthAnchor.constraint(equalToConstant: 18),
        label.heightAnchor.constraint(equalToConstant: 16),
    ])
    return label
}

/// Every row of the help, the tabs first, then the marks, places, the pet, when it speaks up and the mouse.
private func helpRows() -> [[NSView]] {
    let terminal = NSWorkspace.shared.urlForApplication(withBundleIdentifier: "com.apple.Terminal")
        .map { NSWorkspace.shared.icon(forFile: $0.path) }
    var rows: [[NSView]] = [heading(Text.helpTabs)]
    rows += Group.allCases.map { named($0.title, $0.meaning) }
    rows.append(heading(Text.helpMarks))
    rows += Mark.allCases.map { explained(picture($0.image(), side: 14), $0.meaning) }
    rows.append(heading(Text.helpPlaces))
    rows += Place.kinds.map { place in
        explained(picture(place == .app(0) ? terminal : place.icon, side: 18), place.meaning)
    }
    rows.append(heading(Text.helpPet))
    rows.append(explained(badge(isAnyBlocked: false), Text.badgeHelp))
    rows.append(explained(badge(isAnyBlocked: true), Text.badgeBlockedHelp))
    // when it speaks up, as Controller.refresh does it
    rows.append(heading(Text.helpAlerts))
    rows.append(named(Text.helpSound, Text.soundHelp))
    rows.append(named(Text.bubble, Text.bubbleHelp))
    // what the mouse does, as PetView and RowView answer it
    rows.append(heading(Text.helpMouse))
    rows.append(named(Text.helpClick, Text.clickHelp))
    rows.append(named(Text.helpDoubleClick, Text.doubleClickHelp))
    rows.append(named(Text.helpDrag, Text.dragHelp))
    rows.append(named(Text.helpRightClick, Text.rightClickHelp))
    return rows
}

private func helpGrid(_ rows: [[NSView]]) -> NSGridView {
    let grid = NSGridView(views: rows)
    for (index, row) in rows.enumerated() {
        if row.count == 1 {
            // a heading, across both columns and parted from the section before
            grid.mergeCells(inHorizontalRange: NSRange(0..<2), verticalRange: NSRange(index...index))
            grid.cell(atColumnIndex: 0, rowIndex: index).xPlacement = .leading
            if index > 0 { grid.row(at: index).topPadding = 10 }
        } else {
            // each icon beside the first line of its text
            grid.row(at: index).yPlacement = .top
        }
    }
    // icons and gestures against their text
    grid.column(at: 0).xPlacement = .trailing
    grid.rowSpacing = 10
    grid.columnSpacing = 12
    grid.translatesAutoresizingMaskIntoConstraints = false
    return grid
}

/// What every tab and icon of the pet and its bubble means, built from the same things that draw
/// them, so it tells of each one there is; then when it speaks up and what the mouse does.
func makeHelpWindow() -> NSWindow {
    let grid = helpGrid(helpRows())

    // flipped, so that it starts at the top when it is taller than the window
    let content = FlippedView()
    content.addSubview(grid)
    NSLayoutConstraint.activate([
        grid.topAnchor.constraint(equalTo: content.topAnchor, constant: 20),
        grid.bottomAnchor.constraint(equalTo: content.bottomAnchor, constant: -20),
        grid.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: 24),
        grid.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -24),
    ])
    let size = content.fittingSize
    content.frame = NSRect(origin: .zero, size: size)
    // it scrolls only on a screen shorter than it
    let scroll = NSScrollView()
    scroll.documentView = content
    scroll.hasVerticalScroller = true
    scroll.autohidesScrollers = true
    scroll.drawsBackground = false
    let room = (NSScreen.main?.visibleFrame.height ?? size.height) - 80
    let window = NSWindow(contentRect: .zero, styleMask: [.titled, .closable], backing: .buffered, defer: false)
    window.title = Text.helpTitle
    window.isReleasedWhenClosed = false
    window.contentView = scroll
    window.setContentSize(NSSize(width: size.width, height: min(size.height, room)))
    window.center()
    return window
}
