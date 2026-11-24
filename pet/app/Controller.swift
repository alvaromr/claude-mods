// The app: its two windows, the pet's and the bubble's, and what makes them follow the sessions.

import AppKit

func makePanel() -> NSPanel {
    let panel = NSPanel(contentRect: .zero, styleMask: [.borderless, .nonactivatingPanel],
                        backing: .buffered, defer: false)
    panel.isOpaque = false
    panel.backgroundColor = .clear
    panel.level = .floating
    panel.hidesOnDeactivate = false
    // the pet's app is never the active one: without this its tooltips would never show
    panel.allowsToolTipsWhenApplicationIsInactive = true
    panel.collectionBehavior = [.canJoinAllSpaces, .stationary, .fullScreenAuxiliary]
    return panel
}

final class Controller: NSObject, NSApplicationDelegate {
    private let tabs = Group.allCases
    private let pet = makePanel()
    private let bubble = makePanel()
    let petView = PetView(frame: NSRect(x: 0, y: 0, width: petSide, height: petSide))
    private let bubbleView = BubbleView()
    private lazy var settings = makeSettingsWindow(target: self)
    private lazy var help = makeHelpWindow()

    private let transcripts = Transcripts()
    private let orcaIcons = OrcaIcons()
    let orcaChats = OrcaChats()
    private var sessions: [Session] = []
    /// When each session the person has seen last changed, by its pid.
    private var seen: [Int32: Date] = [:]
    /// The phase each session was in at the last look.
    private var was: [Int32: Phase] = [:]
    /// Where each session lives, by its pid, with the session's id so that another one given the
    /// pid does not take its place: found out off the main thread, and kept until the session
    /// ends. A session whose place could not be found out has none here yet, and is asked again.
    var places: [Int32: (id: String, place: Place)] = [:]
    /// The pids whose place is being looked for.
    private var locating: Set<Int32> = []
    private let lookups = DispatchQueue(label: "places", qos: .utility)
    private var tab = 0
    /// What the bubble last drew, so it is rebuilt only when that changes.
    private struct Drawing: Equatable {
        let titles: [String]
        let tab: Int
        let rows: [Row]
        let size: BubbleSize
        let side: Side
        let headline: Headline
    }
    private var drawn: Drawing?
    private var hasRefreshed = false
    /// The person opened the bubble with no session waiting, so it stays until they close it.
    private var isKeptOpen = false

    /// A "Probar" button, tagged with the place of its animation among them all: it plays
    /// whole cycles for about three seconds.
    @objc func preview(_ sender: NSButton) {
        let animation = Animation.allCases[sender.tag]
        petView.play(animation, cycles: max(1, Int((3 / animation.duration).rounded())))
    }

    /// Ajustes' "Restablecer ajustes…" button, once the person says so.
    @objc func resetSettings() {
        let alert = NSAlert()
        alert.messageText = Text.resetTitle
        alert.informativeText = Text.resetNote
        alert.addButton(withTitle: Text.reset).hasDestructiveAction = true
        alert.addButton(withTitle: Text.cancel).keyEquivalent = "\u{1b}"
        alert.beginSheetModal(for: settings) { answer in
            if answer == .alertFirstButtonReturn { Settings.reset() }
        }
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        Settings.register()
        pet.hasShadow = false
        pet.setContentSize(petView.frame.size)
        pet.contentView = petView
        if let saved = Settings.store.string(forKey: "origin") {
            pet.setFrameOrigin(NSPointFromString(saved))
            keepOnScreen()
        } else {
            moveToCorner()
        }
        fitPet()
        pet.orderFrontRegardless()
        // built now, well away from any menu, for the reason `openSettings` gives
        _ = settings
        _ = help

        bubble.contentView = bubbleView
        answerPet()
        answerBubble()
        watchSystem()
        refresh()
    }

    private func moveToCorner() {
        guard let visible = NSScreen.main?.visibleFrame else { return }
        pet.setFrameOrigin(NSPoint(x: visible.maxX - pet.frame.width - 40, y: visible.minY + 40))
    }

    /// Sizes the pet as Ajustes asks, about the same middle, when it is not that size already.
    private func fitPet() {
        let side = (petSide * Settings.petScale).rounded()
        guard pet.frame.width != side else { return }
        let middle = NSPoint(x: pet.frame.midX, y: pet.frame.midY)
        pet.setFrame(NSRect(x: middle.x - side / 2, y: middle.y - side / 2, width: side, height: side), display: true)
        petView.frame = NSRect(x: 0, y: 0, width: side, height: side)
        petView.fit()
        Settings.store.set(NSStringFromPoint(pet.frame.origin), forKey: "origin")
        placeBubble()
    }

    /// A pet left on a display that is gone comes back to the main one's corner.
    private func keepOnScreen() {
        let center = NSPoint(x: pet.frame.midX, y: pet.frame.midY)
        if !NSScreen.screens.contains(where: { $0.frame.contains(center) }) { moveToCorner() }
    }

    private func refresh() {
        sessions = currentSessions()
        seen = seen.filter { pid, updated in sessions.contains { $0.pid == pid && $0.updated == updated } }
        let (events, calling) = changesSinceLastLook()
        locatePlaces()

        let now = Date()
        let waiting = sessions.filter { $0.group(at: now) == .waiting }.count
        let blocked = sessions.filter { $0.phase == .blocked }.count
        petView.waiting = (waiting, blocked)
        let mood: Mood = blocked > 0 ? .blocked : waiting > 0 ? .waiting
            : sessions.contains { $0.phase == .busy } ? .working : .resting
        petView.animation = mood.animation
        events.forEach { petView.react(to: $0) }

        playSound(for: events)
        updateBubble(events: events, calling: calling, waiting: waiting)
        hasRefreshed = true
        render()
    }

    /// The sessions alive now, each with what its transcript and its processes tell of it.
    private func currentSessions() -> [Session] {
        // seen for as long as it stays as it was when the person said so
        let listed = liveSessions()
        // only a session with a command in the background can have a server there
        let open = servers(of: listed.filter { transcripts.runningCommands($0) > 0 }.map(\.pid))
        return listed.map { session in
            var session = session
            let server = open[session.pid] ?? Servers()
            session.isScheduled = transcripts.isScheduled(session)
            // a server runs until it is stopped, so the session does not go on by itself for one
            session.isRunningCommand = transcripts.runningCommands(session) > server.commands
            session.ports = server.ports
            session.runningAgents = transcripts.runningAgents(session)
            session.failure = transcripts.failure(of: session)
            // done with its turn, but going on by itself: at work, as it waits for nobody
            if session.phase == .idle && Mark.of(session)?.goesOnByItself == true { session.phase = .busy }
            session.isSeen = seen[session.pid] == session.updated
            if case .orcaChat(let id) = places[session.pid]?.place { session = session.named(by: orcaChats.chat(id)) }
            return session
        }
    }

    /// What changed since the last look, from the least telling to the most: of the ones that have
    /// an animation, the last one is the one that plays; and the sessions that just ended their turn
    /// or stopped on a dialog.
    private func changesSinceLastLook() -> (events: [Event], calling: [Int32]) {
        let phases = Dictionary(sessions.map { ($0.pid, $0.phase) }) { first, _ in first }
        var events: [Event] = []
        var calling: [Int32] = []
        if hasRefreshed {
            /// The sessions now in the phase having been in one of the others.
            func turned(_ phase: Phase, from others: Phase...) -> [Int32] {
                phases.filter { pid, now in now == phase && others.contains { $0 == was[pid] } }.map(\.key)
            }
            if was.keys.contains(where: { phases[$0] == nil }) { events.append(.closed) }
            if phases.keys.contains(where: { was[$0] == nil }) { events.append(.appeared) }
            // going on after an answer is no start: only leaving idle is
            if !turned(.busy, from: .idle).isEmpty { events.append(.started) }
            let finished = turned(.idle, from: .busy, .blocked), needed = turned(.blocked, from: .busy, .idle)
            if !finished.isEmpty { events.append(.finished) }
            if !needed.isEmpty { events.append(.needed) }
            calling = finished + needed
        }
        was = phases
        return (events, calling)
    }

    /// Looks for where each session lives, off the main thread, for those not found yet.
    private func locatePlaces() {
        places = places.filter { pid, known in sessions.contains { $0.pid == pid && $0.id == known.id } }
        for session in sessions where places[session.pid] == nil && locating.insert(session.pid).inserted {
            lookups.async { [unowned self] in
                let found = place(of: session)
                DispatchQueue.main.async { [self] in
                    locating.remove(session.pid)
                    // the session may be gone by the time it is found, and its pid another's
                    guard let found,
                          sessions.contains(where: { $0.pid == session.pid && $0.id == session.id }) else { return }
                    places[session.pid] = (session.id, found)
                    render()
                }
            }
        }
    }

    /// One sound at most, the more pressing one.
    private func playSound(for events: [Event]) {
        if events.contains(.needed) && Settings.hasNeedSound {
            NSSound(named: "Ping")?.play()
        } else if events.contains(.finished) && Settings.hasSound {
            NSSound(named: "Glass")?.play()
        }
    }

    /// Opens the bubble for what just happened, unless the person already has it in front of them,
    /// and closes it once nothing waits any more.
    private func updateBubble(events: [Event], calling: [Int32], waiting: Int) {
        if waiting > 0 { isKeptOpen = false }
        let isTold = events.contains(.needed) || events.contains(.finished)
        if isTold && !isInFront(calling) || (!hasRefreshed && waiting > 0) {
            tab = 0
            if !bubble.isVisible { showBubble() }
        } else if waiting == 0 && bubble.isVisible && !isKeptOpen {
            // nothing waits any more: the bubble goes, once the pointer is off it and the pet
            let pointer = NSEvent.mouseLocation
            if !pet.frame.contains(pointer) && !bubble.frame.contains(pointer) { hideBubble() }
        }
    }

    func render() {
        let now = Date()
        let groups = Dictionary(grouping: sessions) { $0.group(at: now) }
        let titles = tabs.map { "\($0.title) \(groups[$0]?.count ?? 0)" }
        let size = Settings.bubbleSize, headline = Settings.headline
        let hasOrcaIcons = Settings.hasOrcaIcons && headline == .project
        var rows: [Row] = (groups[tabs[tab]] ?? []).map { session in
            let place = places[session.pid]?.place ?? .nowhere
            var icon: NSImage?
            switch place {
            case .orca, .orcaChat: if hasOrcaIcons { icon = orcaIcons.icon(of: session.cwd) }
            default: break
            }
            return .session(session, ago: ago(session.updated, from: now), place: place,
                            message: size == .large ? transcripts.message(of: session) : "", icon: icon)
        }
        if rows.isEmpty { rows = [.note(tabs[tab].empty)] }

        let drawing = Drawing(titles: titles, tab: tab, rows: rows, size: size, side: Settings.bubbleSide,
                              headline: headline)
        if drawing == drawn { return }
        drawn = drawing
        bubbleView.show(tabs: titles, selected: tab, rows: rows)
        placeBubble()
    }
}

// MARK: - What the pet and the bubble ask

extension Controller {
    /// What the pet does when pressed, moved, or asked for its windows or to quit.
    private func answerPet() {
        petView.onClick = { [unowned self] in
            isKeptOpen = !bubble.isVisible && petView.waiting.count == 0
            if bubble.isVisible { hideBubble() } else { showBubble() }
        }
        petView.onMoved = { [unowned self] in
            Settings.store.set(NSStringFromPoint(pet.frame.origin), forKey: "origin")
            placeBubble()
        }
        petView.onSettings = { [unowned self] in
            NSApp.activate(ignoringOtherApps: true)
            settings.makeKeyAndOrderFront(nil)
        }
        petView.onHelp = { [unowned self] in
            NSApp.activate(ignoringOtherApps: true)
            help.makeKeyAndOrderFront(nil)
        }
        petView.onQuit = {
            _ = orNil("writing \(quitMark().path)") { try Data().write(to: quitMark()) }
            NSApp.terminate(nil)
        }
    }

    /// What the bubble does when a tab or a row is pressed, or one of its rows is asked to be seen or closed.
    private func answerBubble() {
        bubbleView.onTab = { [unowned self] index in
            tab = index
            render()
        }
        bubbleView.onPress = { [unowned self] row, isDouble in
            // a double click's first one took the person there; its second closes the bubble
            if isDouble { return hideBubble() }
            if case .session(let session, _, _, _, _) = row { open(session) }
        }
        bubbleView.onSeen = { [unowned self] row in
            guard case .session(let session, _, _, _, _) = row else { return }
            seen[session.pid] = session.updated
            refresh()
        }
        bubbleView.onClose = { [unowned self] row in
            if case .session(let session, _, _, _, _) = row { close(session) }
        }
    }

    /// Follows the screens and the settings as they change, and looks at the sessions every two seconds.
    private func watchSystem() {
        let center = NotificationCenter.default
        center.addObserver(forName: NSApplication.didChangeScreenParametersNotification, object: nil,
                           queue: .main) { [unowned self] _ in
            keepOnScreen()
            placeBubble()
        }
        center.addObserver(forName: UserDefaults.didChangeNotification, object: Settings.store,
                           queue: .main) { [unowned self] _ in
            fitPet()
            refresh()
        }
        Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { [unowned self] _ in refresh() }
    }
}

// MARK: - Where the bubble sits

extension Controller {
    private func showBubble() {
        pet.addChildWindow(bubble, ordered: .above)
        placeBubble()
    }

    func hideBubble() {
        pet.removeChildWindow(bubble)
        bubble.orderOut(nil)
    }

    /// On the side of the pet Ajustes asks for, or on the opposite one when only that one
    /// has the room, and never off the screen's edges.
    private func placeBubble() {
        guard let screen = (pet.screen ?? NSScreen.main)?.visibleFrame else { return }
        let around = pet.frame.insetBy(dx: 10, dy: 10)
        /// The bubble on that side: against the pet and centred on it.
        func frame(on side: Side) -> NSRect {
            let size = bubbleView.size(on: side)
            let origin: NSPoint
            switch side {
            case .above: origin = NSPoint(x: around.midX - size.width / 2, y: around.maxY)
            case .below: origin = NSPoint(x: around.midX - size.width / 2, y: around.minY - size.height)
            case .left: origin = NSPoint(x: around.minX - size.width, y: around.midY - size.height / 2)
            case .right: origin = NSPoint(x: around.maxX, y: around.midY - size.height / 2)
            }
            return NSRect(origin: origin, size: size)
        }
        /// Whether the screen has the room the bubble needs away from the pet on that side.
        func fits(_ side: Side) -> Bool {
            let frame = frame(on: side)
            switch side {
            case .above: return frame.maxY <= screen.maxY
            case .below: return frame.minY >= screen.minY
            case .left: return frame.minX >= screen.minX
            case .right: return frame.maxX <= screen.maxX
            }
        }
        var side = Settings.bubbleSide
        if !fits(side) && fits(side.opposite) { side = side.opposite }
        var frame = frame(on: side)
        // slid along the pet's side as far as the screen's edges ask
        if side.isVertical {
            frame.origin.x = max(screen.minX + 4, min(frame.minX, screen.maxX - frame.width - 4))
        } else {
            frame.origin.y = max(screen.minY + 4, min(frame.minY, screen.maxY - frame.height - 4))
        }
        bubbleView.point(from: side, at: side.isVertical ? around.midX - frame.minX : frame.maxY - around.midY)
        bubble.setFrame(frame, display: true)
        bubble.invalidateShadow()
    }

    /// Whether the person already has every one of those sessions in front of them, so the bubble
    /// has nothing to tell them. Known of an Orca tab alone: of another app's window, only that it
    /// is at the front, not which of its tabs.
    private func isInFront(_ pids: [Int32]) -> Bool {
        let handles = pids.compactMap { pid -> String? in
            if case .orca(let handle) = places[pid]?.place { return handle }
            return nil
        }
        guard !handles.isEmpty, handles.count == pids.count else { return false }
        return Set(handles).isSubset(of: focusedOrcaHandles())
    }
}
