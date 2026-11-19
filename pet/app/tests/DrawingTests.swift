// The tests of what the pet draws: the spark and its animations, the bubble and the Ayuda window.

import AppKit

func sparkTests() {
    test("the mark has its twelve arms, and stretching them makes it larger") {
        expect(sparkVertices.count, sparkOutline.count / 2)
        expect(Set(sparkVertices.map(\.arm)), Set(0..<armCount))
        let drawn = sparkPath().boundingBox, stretched = sparkPath { _ in 0.5 }.boundingBox
        expect(drawn.width <= sparkSide && drawn.height <= sparkSide, true, "as drawn it fits its side:")
        expect(stretched.width > drawn.width && stretched.height > drawn.height, true, "stretched:")
        // one arm alone: the top one reaches higher and nothing reaches lower
        let top = sparkPath { $0 == 0 ? 0.5 : 0 }.boundingBox
        expect(top.maxY > drawn.maxY, true, "the top arm:")
        expectNear(top.minY, drawn.minY, "the bottom:")
    }

    test("the easings run from 0 to 1, the spring a little past it") {
        expect([smooth(-1), smooth(0), smooth(0.5), smooth(1), smooth(2)], [0, 0, 0.5, 1, 1])
        expectNear(spring(0), 0)
        expectNear(spring(1), 1)
        expect(spring(0.8) > 1, true, "the spring runs past 1:")
        for place in 0..<armCount {
            expect(scatter(place, 1) >= 0 && scatter(place, 1) < 1, true, "scatter of \(place):")
            expect(scatter(place, 1), scatter(place, 1))
        }
    }

    test("every animation ends its cycle as it began, so it loops") {
        for animation in Animation.allCases {
            let start = animation.pose(at: 0), end = animation.pose(at: 1), name = "\(animation.rawValue):"
            expect(animation.duration > 0, true, name)
            expect(Animation(rawValue: animation.rawValue), animation)
            expectNear(cos(start.turn), cos(end.turn), name)
            expectNear(sin(start.turn), sin(end.turn), name)
            expectNear(start.x, end.x, name)
            expectNear(start.y, end.y, name)
            expectNear(start.scaleX, end.scaleX, name)
            expectNear(start.scaleY, end.scaleY, name)
            for place in 0..<armCount {
                expectNear(start.stretch(place), end.stretch(place), "\(name) arm \(place)")
            }
        }
    }
}

func windowTests() {
    test("the bubble is wider the more it tells, and each side has its opposite") {
        expect([BubbleSize.compact, .normal, .large].map(\.width), [236, 280, 380])
        expect([Side.above, .below, .left, .right].map(\.opposite), [.below, .above, .right, .left])
        expect([Side.above, .below, .left, .right].map(\.isVertical), [true, true, false, false])
    }

    test("the Ayuda window tells what every tab, mark and place means") {
        func texts(in view: NSView) -> [String] {
            ((view as? NSTextField).map { [$0.stringValue] } ?? []) + view.subviews.flatMap(texts(in:))
        }
        let told = texts(in: makeHelpWindow().contentView!)
        for meaning in Group.allCases.map(\.meaning) + Mark.allCases.map(\.meaning) + Place.kinds.map(\.meaning) {
            expect(told.contains(meaning), true, meaning)
        }
    }

    test("a read that fails leaves the pet showing less, and tells why once, however often it fails") {
        var told: [String] = []
        report = { told.append($0) }
        expect(run("/nonexistent/tool", []), nil)
        expect(run("/nonexistent/tool", []), nil)
        expect(told.count, 1, "lines told")
        expect(told.first?.hasPrefix("running /nonexistent/tool failed: ") ?? false, true, told.first ?? "nothing told")
    }
}
