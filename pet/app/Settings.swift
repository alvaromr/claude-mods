// What the Ajustes window edits, and the choices it offers.

import AppKit

/// What the Ajustes window edits, kept in the app's defaults.
enum Settings {
    static let store = UserDefaults.standard

    /// Every setting Ajustes shows, as it starts.
    static var defaults: [String: Any] {
        var defaults: [String: Any] = [
            "inactiveMinutes": 30, "sound": true, "needSound": true, "bubbleSize": 1,
            "bubbleSide": 0, "closeOnPress": 1, "headline": 0, "orcaIcons": false,
            "petScale": 1.0,
        ]
        for key in Mood.allCases.map(\.animationKey) + Event.allCases.map(\.animationKey) {
            defaults[key] = noAnimation
        }
        return defaults
    }

    static func register() { store.register(defaults: defaults) }

    /// Puts every setting Ajustes shows back as it starts; where the pet stands is no setting, and stays.
    static func reset() { defaults.keys.forEach(store.removeObject(forKey:)) }

    static var inactiveAfter: TimeInterval { max(1, store.double(forKey: "inactiveMinutes")) * 60 }
    static var hasSound: Bool { store.bool(forKey: "sound") }
    static var hasNeedSound: Bool { store.bool(forKey: "needSound") }
    /// What a picker shows for a state or an event the pet stays still in.
    static let noAnimation = "Ninguna"
    static var bubbleSize: BubbleSize { BubbleSize(rawValue: store.integer(forKey: "bubbleSize")) ?? .normal }
    static var bubbleSide: Side { Side(rawValue: store.integer(forKey: "bubbleSide")) ?? .above }
    static var closeOnPress: CloseOnPress {
        CloseOnPress(rawValue: store.integer(forKey: "closeOnPress")) ?? .onlyWaiting
    }
    static var headline: Headline { Headline(rawValue: store.integer(forKey: "headline")) ?? .session }
    /// Whether a session in Orca has its project's icon there before the project, where that is the headline.
    static var hasOrcaIcons: Bool { store.bool(forKey: "orcaIcons") }
    /// How much larger than as designed the pet is drawn, within what the slider offers.
    static var petScale: CGFloat {
        min(max(store.double(forKey: "petScale"), petScales.lowerBound), petScales.upperBound)
    }
    static let petScales: ClosedRange<CGFloat> = 0.6...2
}

/// When pressing a session's row, which takes the person to it, closes the bubble too.
enum CloseOnPress: Int {
    case always
    /// When the session is the only one that waits: the bubble has no more to tell.
    case onlyWaiting
    case never
}

/// What a session's row of the bubble shows large, on its first line; the other goes in the detail under it.
enum Headline: Int {
    case session
    case project
}

/// How much a row of the bubble tells about its session; the lettering is the same in all three.
enum BubbleSize: Int {
    /// Its headline and how long ago, on one line.
    case compact
    /// The other of its name and project too, on a second line.
    case normal
    /// And under those, what Claude last said in it or is asking.
    case large

    var width: CGFloat { [236, 280, 380][rawValue] }
}
