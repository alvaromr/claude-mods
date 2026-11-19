// The Ajustes window: each setting, bound to the default it is kept in.

import AppKit

private let bold = NSFont.boldSystemFont(ofSize: NSFont.systemFontSize)
private let small = NSFont.systemFont(ofSize: NSFont.smallSystemFontSize)

private func bound<Control: NSView>(_ control: Control, _ binding: NSBindingName, to key: String) -> Control {
    control.bind(binding, to: NSUserDefaultsController.shared, withKeyPath: "values.\(key)")
    return control
}

/// The name of each state or event and the animation the pet plays for it, two to a row:
/// they read down the left half, then down the right one.
private func pickers<Moment: Animated>(_ moments: [Moment]) -> [[NSView]] {
    let cells: [[NSView]] = moments.map { moment in
        let picker = NSPopUpButton()
        picker.addItems(withTitles: [Settings.noAnimation] + Animation.allCases.map(\.rawValue))
        return [NSTextField(labelWithString: moment.rawValue), bound(picker, .selectedValue, to: moment.animationKey)]
    }
    let half = (cells.count + 1) / 2
    return (0..<half).map { cells[$0] + (half + $0 < cells.count ? cells[half + $0] : []) }
}

/// A row that is one line of text across every column, heading the rows after it.
private func heading(_ text: String, font: NSFont, color: NSColor = .labelColor) -> [NSView] {
    let label = NSTextField(labelWithString: text)
    label.font = font
    label.textColor = color
    return [label]
}

/// A row that is a line across every column, parting one group of rows from the next.
private func separator() -> [NSView] {
    let line = NSBox()
    line.boxType = .separator
    return [line]
}

/// A row with no name, whose control is a checkbox.
private func checkbox(_ title: String, key: String) -> [NSView] {
    [NSGridCell.emptyContentView, bound(NSButton(checkboxWithTitle: title, target: nil, action: nil), .value, to: key)]
}

/// A row that names a setting and offers its choices as segments.
private func choice(_ name: String, _ labels: [String], key: String) -> [NSView] {
    let control = NSSegmentedControl(labels: labels, trackingMode: .selectOne, target: nil, action: nil)
    return [NSTextField(labelWithString: name), bound(control, .selectedIndex, to: key)]
}

/// The slider of how large the pet is, with beside it what it makes of the pet, as a share of the designed size.
private func petScaleControl() -> NSView {
    let scale = NSSlider(value: 1, minValue: Settings.petScales.lowerBound, maxValue: Settings.petScales.upperBound,
                         target: nil, action: nil)
    scale.isContinuous = true
    let percent = NSTextField(labelWithString: "")
    let percents = NumberFormatter()
    percents.numberStyle = .percent
    percents.locale = Text.locale
    percent.formatter = percents
    percent.textColor = .secondaryLabelColor
    percent.font = .monospacedDigitSystemFont(ofSize: NSFont.systemFontSize, weight: .regular)
    // as wide as the widest it says, so the slider does not shift as the figure grows
    percent.alignment = .right
    percent.widthAnchor.constraint(equalToConstant: 48).isActive = true
    return NSStackView(views: [bound(scale, .value, to: "petScale"), bound(percent, .value, to: "petScale")])
}

/// The pet's size, when it counts a session inactive and the sounds.
private func generalRows() -> [[NSView]] {
    let inactive = NSPopUpButton()
    for minutes in [5, 10, 15, 30, 60, 120] {
        inactive.addItem(withTitle: Text.minutes(minutes))
        inactive.lastItem?.tag = minutes
    }
    return [
        [NSTextField(labelWithString: Text.petSize), petScaleControl()],
        [NSTextField(labelWithString: Text.inactiveAfter), bound(inactive, .selectedTag, to: "inactiveMinutes")],
        checkbox(Text.soundWaiting, key: "sound"),
        checkbox(Text.soundNeeded, key: "needSound"),
    ]
}

/// How the bubble looks.
private func bubbleRows() -> [[NSView]] {
    [
        separator(),
        heading(Text.bubble, font: bold),
        choice(Text.bubbleSize, Text.bubbleSizes, key: "bubbleSize"),
        choice(Text.headline, Text.headlines, key: "headline"),
        checkbox(Text.orcaIcons, key: "orcaIcons"),
        choice(Text.bubbleSide, Text.bubbleSides, key: "bubbleSide"),
        choice(Text.closeOnPress, Text.closeOnPressOptions, key: "closeOnPress"),
    ]
}

/// The animations: a button to try each, and which one plays for every state and event.
private func animationRows(target: Controller) -> [[NSView]] {
    let previews = NSStackView(views: Animation.allCases.enumerated().map { index, animation in
        let button = NSButton(title: animation.rawValue, target: target, action: #selector(Controller.preview))
        button.tag = index
        button.controlSize = .small
        return button
    })
    let head: [[NSView]] = [
        separator(),
        heading(Text.animations, font: bold),
        [NSTextField(labelWithString: Text.tryOut), previews],
        heading(Text.moodsNote, font: small, color: .secondaryLabelColor),
    ]
    return head + pickers(Mood.allCases) + [heading(Text.eventsNote, font: small, color: .secondaryLabelColor)]
        + pickers(Event.allCases)
}

/// Two names, each with its control, to the widest rows. A row of one view is a heading, a
/// separator or the reset button at the right, and runs across every column; one of a single
/// name gives its control the rest of them.
private func settingsGrid(_ rows: [[NSView]]) -> NSGridView {
    let grid = NSGridView(views: rows)
    let columns = grid.numberOfColumns
    for (index, row) in rows.enumerated() where row.count < columns {
        grid.mergeCells(inHorizontalRange: NSRange((row.count == 1 ? 0 : 1)..<columns),
                        verticalRange: NSRange(index...index))
        if row.count == 1 {
            grid.cell(atColumnIndex: 0, rowIndex: index).xPlacement =
                row[0] is NSBox ? .fill : row[0] is NSButton ? .trailing : .leading
        }
    }
    for name in [0, 2] { grid.column(at: name).xPlacement = .trailing }
    grid.column(at: 2).leadingPadding = 14
    grid.rowAlignment = .firstBaseline
    grid.rowSpacing = 12
    grid.columnSpacing = 10
    grid.translatesAutoresizingMaskIntoConstraints = false
    return grid
}

func makeSettingsWindow(target: Controller) -> NSWindow {
    let reset = NSButton(title: Text.resetSettings, target: target, action: #selector(Controller.resetSettings))
    let rows: [[NSView]] = generalRows() + bubbleRows() + animationRows(target: target) + [separator(), [reset]]
    let grid = settingsGrid(rows)

    let content = NSView()
    content.addSubview(grid)
    NSLayoutConstraint.activate([
        grid.topAnchor.constraint(equalTo: content.topAnchor, constant: 20),
        grid.bottomAnchor.constraint(equalTo: content.bottomAnchor, constant: -20),
        grid.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: 24),
        grid.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -24),
    ])
    let window = NSWindow(contentRect: .zero, styleMask: [.titled, .closable], backing: .buffered, defer: false)
    window.title = Text.settingsTitle
    window.isReleasedWhenClosed = false
    window.contentView = content
    window.setContentSize(content.fittingSize)
    window.center()
    return window
}
