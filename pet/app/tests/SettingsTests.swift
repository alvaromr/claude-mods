// The tests of Ajustes: what they start from, and what resetting them leaves.

import AppKit

func settingsTests() {
    test("Ajustes start from their defaults") {
        expect(Settings.inactiveAfter, 30 * 60)
        expect(Settings.hasSound, true)
        expect(Settings.hasNeedSound, true)
        expect(Settings.bubbleSize, .normal)
        expect(Settings.bubbleSide, .above)
        expect(Settings.closeOnPress, .onlyWaiting)
        expect(Settings.headline, .session)
        expect(Settings.hasOrcaIcons, false)
        expect(Settings.petScale, 1)
        expect(Mood.allCases.compactMap(\.animation) + Event.allCases.compactMap(\.animation), [])
    }

    test("resetting Ajustes puts every setting back, and leaves where the pet stands") {
        Settings.store.set(2.0, forKey: "petScale")
        Settings.store.set(false, forKey: "sound")
        Settings.store.set(Animation.spin.rawValue, forKey: Mood.working.animationKey)
        Settings.store.set("{10, 20}", forKey: "origin")
        Settings.reset()
        expect(Settings.petScale, 1)
        expect(Settings.hasSound, true)
        expect(Mood.working.animation, nil)
        expect(Settings.store.string(forKey: "origin"), "{10, 20}")
        Settings.store.removeObject(forKey: "origin")
    }

    test("a state or an event plays the animation Ajustes keeps for it") {
        expect(Mood.blocked.animationKey, "blockedAnimation")
        Settings.store.set("Giro", forKey: Event.clicked.animationKey)
        expect(Event.clicked.animation, .spin)
        Settings.store.set("one that is gone", forKey: Event.clicked.animationKey)
        expect(Event.clicked.animation, nil)
        Settings.store.removeObject(forKey: Event.clicked.animationKey)
    }
}
