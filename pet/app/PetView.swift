// The pet itself: the spark and its badge, which plays animations, can be dragged and answers clicks.

import AppKit

let petSide: CGFloat = 72

final class PetView: NSView, NSViewToolTipOwner {
    var onClick: () -> Void = {}
    var onMoved: () -> Void = {}
    var onSettings: () -> Void = {}
    var onHelp: () -> Void = {}
    var onQuit: () -> Void = {}
    /// What the pet loops in the state the sessions are in; nil keeps it still.
    var animation: Animation? { didSet { if animation != oldValue && interruption == nil { loop() } } }
    /// How many sessions wait for the person, and how many of those are stuck until answered:
    /// the badge counts them all, red while any is stuck and a dull orange otherwise.
    var waiting = (count: 0, blocked: 0) {
        didSet {
            badge.string = String(waiting.count)
            badge.isHidden = waiting.count == 0
            badge.backgroundColor = PetView.badgeColor(isAnyBlocked: waiting.blocked > 0).cgColor
            let (count, blocked) = waiting
            badgeTip = Text.sessionsWaiting(count) + (blocked == 0 ? "" : Text.sessionsNeeding(blocked))
            setAccessibilityLabel(Text.petLabel(badgeTip))
            tipBadge()
        }
    }

    /// The spark and the square that takes its clicks, scaled together by Ajustes' size.
    private let stage = CALayer()
    private let spark = CAShapeLayer()
    private let touch = CALayer()
    private let badge = CATextLayer()
    /// What the badge says when pointed at, as the waiting were last set.
    private var badgeTip = ""

    /// The badge's color: red while some session is stuck on the person, a dull orange otherwise.
    static func badgeColor(isAnyBlocked: Bool) -> NSColor {
        isAnyBlocked ? .systemRed : NSColor(srgbRed: 0.62, green: 0.37, blue: 0.12, alpha: 1)
    }

    func view(_ view: NSView, stringForToolTip tag: NSView.ToolTipTag, point: NSPoint,
              userData data: UnsafeMutableRawPointer?) -> String { badgeTip }
    private var grab: (mouse: NSPoint, origin: NSPoint)?
    private var hasMoved = false
    /// Running while something plays in place of the state's animation, which it brings back.
    private var interruption: Timer?

    override init(frame: NSRect) {
        super.init(frame: frame)
        layer = CALayer()
        wantsLayer = true

        // a window lets through the clicks that land where it draws nothing: a fill too faint
        // to see keeps the ones on the square the spark stands in, between its arms too
        touch.backgroundColor = NSColor(white: 1, alpha: 0.01).cgColor
        stage.addSublayer(touch)
        spark.path = sparkPath()
        spark.fillColor = NSColor(srgbRed: 0.851, green: 0.467, blue: 0.341, alpha: 1).cgColor
        spark.shadowOpacity = 0.35
        spark.shadowRadius = 3
        spark.shadowOffset = CGSize(width: 0, height: -1)
        stage.addSublayer(spark)
        layer?.addSublayer(stage)

        // its size, corners and lettering are fit's, which scales them with the pet
        badge.foregroundColor = NSColor.white.cgColor
        badge.font = NSFont.boldSystemFont(ofSize: 11)
        badge.alignmentMode = .center
        badge.contentsScale = NSScreen.screens.map(\.backingScaleFactor).max() ?? 2
        badge.isHidden = true
        layer?.addSublayer(badge)
        fit()

        let menu = NSMenu()
        menu.addItem(withTitle: Text.menuSettings, action: #selector(openSettings), keyEquivalent: "").target = self
        let help = menu.addItem(withTitle: Text.menuHelp, action: #selector(openHelp), keyEquivalent: "")
        help.target = self
        // macOS gives Ajustes and Salir their symbols by their titles; this one it does not know
        help.image = NSImage(systemSymbolName: "questionmark.circle", accessibilityDescription: nil)
        menu.addItem(withTitle: Text.menuQuit, action: #selector(quit), keyEquivalent: "").target = self
        self.menu = menu

        setAccessibilityElement(true)
        setAccessibilityRole(.button)
    }

    required init?(coder: NSCoder) { fatalError("not loaded from a nib") }

    /// Lays out what it draws for its size, as the designed pet scaled: the spark, drawn at its
    /// designed size and scaled around the middle, its animations with it; the badge in the top
    /// right corner, its lettering too.
    func fit() {
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        stage.frame = bounds
        let inset = (bounds.width - sparkSide) / 2
        spark.frame = bounds.insetBy(dx: inset, dy: inset)
        touch.frame = spark.frame
        let scale = bounds.width / petSide
        stage.sublayerTransform = CATransform3DMakeScale(scale, scale, 1)
        badge.frame = NSRect(x: bounds.maxX - 26 * scale, y: bounds.maxY - 24 * scale,
                             width: 18 * scale, height: 16 * scale)
        badge.cornerRadius = 8 * scale
        badge.fontSize = 11 * scale
        CATransaction.commit()
        tipBadge()
    }

    /// The badge says what it counts when pointed at; the view answers for it, as AppKit does not
    /// keep the owner it is given.
    private func tipBadge() {
        removeAllToolTips()
        if waiting.count > 0 { addToolTip(badge.frame, owner: self, userData: nil) }
    }

    /// Whoever asked the system for less motion gets only what they try by hand in Ajustes.
    private var wantsLessMotion: Bool { NSWorkspace.shared.accessibilityDisplayShouldReduceMotion }

    /// Plays once the animation Ajustes has for the event, if it has one.
    func react(to event: Event) {
        if let animation = event.animation, !wantsLessMotion { play(animation, cycles: 1) }
    }

    /// Plays the animation so many cycles in place of the state's own, which comes back after.
    func play(_ animation: Animation, cycles: Int) {
        show(animation, cycles: Float(cycles))
        interruption?.invalidate()
        interruption = Timer.scheduledTimer(withTimeInterval: animation.duration * Double(cycles),
                                            repeats: false) { [unowned self] _ in
            interruption = nil
            loop()
        }
    }

    private func loop() {
        show(wantsLessMotion ? nil : animation, cycles: .infinity)
    }

    /// Replaces what the spark is doing with the animation, sampled sixty poses a second.
    private func show(_ animation: Animation?, cycles: Float) {
        // always under the one key, so that adding takes the place of what was playing: removing
        // it and adding another unnamed one in the same go left the screen frozen on the old pose
        let key = "animation"
        guard let animation else { return spark.removeAnimation(forKey: key) }
        let frames = Int(animation.duration * 60)
        let poses = (0...frames).map { animation.pose(at: CGFloat($0) / CGFloat(frames)) }
        let tracks: [(keyPath: String, values: [Any])] = [
            ("path", poses.map { sparkPath(stretch: $0.stretch) }),
            ("transform.rotation.z", poses.map(\.turn)),
            ("transform.translation.x", poses.map(\.x)),
            ("transform.translation.y", poses.map(\.y)),
            ("transform.scale.x", poses.map(\.scaleX)),
            ("transform.scale.y", poses.map(\.scaleY)),
        ]
        let group = CAAnimationGroup()
        group.animations = tracks.map { track in
            let frames = CAKeyframeAnimation(keyPath: track.keyPath)
            frames.values = track.values
            frames.duration = animation.duration
            return frames
        }
        group.duration = animation.duration
        group.repeatCount = cycles
        spark.add(group, forKey: key)
    }

    override func updateTrackingAreas() {
        // its own alone: AppKit keeps the tooltip's in the same list
        trackingAreas.filter { $0.owner as AnyObject? === self }.forEach(removeTrackingArea)
        addTrackingArea(NSTrackingArea(rect: .zero, options: [.mouseEnteredAndExited, .activeAlways, .inVisibleRect],
                                       owner: self))
    }

    override func mouseEntered(with event: NSEvent) { react(to: .hovered) }

    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }

    override func mouseDown(with event: NSEvent) {
        grab = (NSEvent.mouseLocation, window?.frame.origin ?? .zero)
        hasMoved = false
    }

    override func mouseDragged(with event: NSEvent) {
        guard let grab else { return }
        let mouse = NSEvent.mouseLocation
        let dx = mouse.x - grab.mouse.x, dy = mouse.y - grab.mouse.y
        // a click that slips a couple of points is still a click
        if !hasMoved && hypot(dx, dy) < 3 { return }
        hasMoved = true
        window?.setFrameOrigin(NSPoint(x: grab.origin.x + dx, y: grab.origin.y + dy))
    }

    override func mouseUp(with event: NSEvent) {
        grab = nil
        guard hasMoved else { return click() }
        react(to: .dropped)
        onMoved()
    }

    private func click() {
        react(to: .clicked)
        onClick()
    }

    override func accessibilityPerformPress() -> Bool {
        click()
        return true
    }

    override func accessibilityPerformShowMenu() -> Bool {
        menu?.popUp(positioning: nil, at: NSPoint(x: bounds.midX, y: bounds.midY), in: self)
        return menu != nil
    }

    /// Once the menu is done: a window laid out while the menu is still closing has
    /// crashed AppKit, deep in the sizing of its buttons.
    @objc private func openSettings() {
        DispatchQueue.main.async { [unowned self] in onSettings() }
    }

    /// The same, for the Ayuda window.
    @objc private func openHelp() {
        DispatchQueue.main.async { [unowned self] in onHelp() }
    }

    /// The Salir item, which leaves the pet closed for the sessions that start, as /pet salir does.
    @objc private func quit() { onQuit() }
}

/// Where the pet's person leaves their word that it stays closed, next to the app it runs from
/// (launch.sh, which a session starting runs, looks there too, and /pet clears it).
func quitMark(app: URL = Bundle.main.bundleURL) -> URL {
    app.deletingLastPathComponent().appendingPathComponent("quit")
}
