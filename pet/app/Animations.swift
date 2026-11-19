// The animations the pet plays: the states and events they are chosen for, and the pose of the spark at each instant.

import AppKit

// The raw values of Mood, Event and Animation are stored ids: the defaults keep them and Ajustes
// shows them as they are. They stay out of Text.swift so a translation does not change what is saved.

/// A state or an event of the pet: Ajustes lists it by its name and picks its animation.
protocol Animated: CaseIterable, RawRepresentable<String> {}

extension Animated {
    /// Where the defaults keep the animation chosen for it.
    var animationKey: String { "\(self)Animation" }
    var animation: Animation? { Animation(rawValue: Settings.store.string(forKey: animationKey) ?? "") }
}

/// What the sessions are doing as a whole; its animation loops for as long as it lasts.
enum Mood: String, Animated {
    case blocked = "Bloqueada", waiting = "Esperando", working = "Trabajando", resting = "Reposo"
}

/// Something that happens in a moment; its animation plays once, then the state's comes back.
enum Event: String, Animated {
    case needed = "Una sesión te necesita"
    case finished = "Una sesión pasa a esperarte"
    case started = "Una sesión empieza a trabajar"
    case appeared = "Se abre una sesión"
    case closed = "Se cierra una sesión"
    case hovered = "Pasar el ratón por encima"
    case clicked = "Clic en la mascota"
    case dropped = "Soltarla tras arrastrarla"
    case opened = "Ir a una sesión"
}

/// How the spark is drawn at one instant of an animation.
struct Pose {
    /// How much longer each arm is, by its place clockwise from the top; 0 is as drawn.
    var stretch: (Int) -> CGFloat = { _ in 0 }
    /// Turned by so many radians, counterclockwise.
    var turn: CGFloat = 0
    var x: CGFloat = 0
    var y: CGFloat = 0
    var scaleX: CGFloat = 1
    var scaleY: CGFloat = 1
}

/// Eases from 0 to 1, starting and stopping gently.
func smooth(_ x: CGFloat) -> CGFloat {
    let x = min(max(x, 0), 1)
    return x * x * (3 - 2 * x)
}

/// Goes from 0 to 1 running a tenth past it and settling back, as something with a spring in it.
func spring(_ x: CGFloat) -> CGFloat {
    let x = min(max(x, 0), 1), back: CGFloat = 1.70158
    return 1 + (back + 1) * pow(x - 1, 3) + back * pow(x - 1, 2)
}

/// A number from 0 to 1 that looks picked at random, yet is always the same for the same
/// arm and the same `draw`, so an arm keeps its ways from one cycle to the next.
func scatter(_ place: Int, _ draw: Int) -> CGFloat {
    let x = sin(CGFloat(place * 127 + draw * 311) * 12.9898) * 43758.5453
    return x - floor(x)
}

/// A stretch of the bounce, which lasts until `end` of the cycle: how high it is off the ground
/// and how flat a stay on the ground presses it.
private struct BounceStage {
    let end: CGFloat
    let height: CGFloat
    let squash: CGFloat

    init(_ end: CGFloat, _ height: CGFloat, _ squash: CGFloat) {
        self.end = end
        self.height = height
        self.squash = squash
    }
}

/// Each one is a pose for every instant of a cycle that ends as it began, so it loops.
enum Animation: String, CaseIterable {
    case chase = "Uno a uno", clock = "Reloj", pulse = "Latido", spin = "Giro", bounce = "Bote", shake = "Vibración"
    case organic = "Orgánica"

    /// How long a cycle lasts, in seconds.
    var duration: CFTimeInterval {
        switch self {
        case .chase: return 2.9
        case .clock: return 3.6
        case .pulse: return 1.8
        case .spin: return 2.6
        case .bounce: return 2
        case .shake: return 1.8
        case .organic: return 6
        }
    }

    /// The pose `time` into the cycle, time running from 0 to 1.
    func pose(at time: CGFloat) -> Pose {
        switch self {
        case .chase:
            // one arm at a time goes out quickly and comes back more slowly, and only then the next
            let turn = time * CGFloat(armCount)
            return Pose(stretch: { place in
                let x = turn - CGFloat(place)
                return x > 0 && x < 1 ? 0.32 * pow(sin(.pi * pow(x, 0.7)), 2) : 0
            })
        case .clock:
            // one after another the arms spring out and stay out; once they all are, they draw
            // back in the same order. Each takes two turns to move, so it is still settling
            // as the next one starts, and there is a pause before the way back
            let half = CGFloat(armCount) + 3
            let turn = time * 2 * half
            return Pose(stretch: { place in
                let out = spring((turn - CGFloat(place)) / 2), back = spring((turn - half - CGFloat(place)) / 2)
                return 0.3 * (out - back)
            })
        case .pulse:
            // swells and sinks as one; a second, smaller wave leans the first forward, so it
            // swells quicker than it sinks
            let angle = 2 * CGFloat.pi * time
            let swell = (sin(angle) + 0.3 * sin(2 * angle)) / 1.13
            return Pose(stretch: { _ in 0.25 * swell }, scaleX: 1 + 0.1 * swell, scaleY: 1 + 0.1 * swell)
        case .spin:
            // leans back, swings a whole turn round and runs a little past before settling
            func angle(_ time: CGFloat) -> CGFloat {
                let lean: CGFloat = 0.3, past: CGFloat = 0.2, round = 2 * CGFloat.pi
                if time < 0.15 { return lean * smooth(time / 0.15) }
                if time < 0.65 { return lean - (lean + round + past) * smooth((time - 0.15) / 0.5) }
                return -round - past * (1 - smooth((time - 0.65) / 0.17))
            }
            // the faster it turns, the further its arms are flung out
            let speed = abs(angle(time + 0.01) - angle(time - 0.01)) / 0.02
            return Pose(stretch: { _ in 0.011 * speed }, turn: angle(time))
        case .bounce:
            return bouncePose(at: time)
        case .shake:
            // two short buzzes and a pause, each swelling up and dying away
            func buzz(from start: CGFloat) -> CGFloat {
                let x = (time - start) / 0.28
                return x > 0 && x < 1 ? pow(sin(.pi * x), 2) : 0
            }
            let strength = buzz(from: 0) + buzz(from: 0.36)
            // twelve shakes a second, rocking at half that
            let beat = 2 * CGFloat.pi * 12 * time * duration
            return Pose(turn: 0.05 * strength * sin(beat / 2), x: 2.4 * strength * sin(beat))
        case .organic:
            // every arm sways to a rhythm of its own and none waits for another: a slow wave
            // with a quicker, smaller one over it, each at a pace, a start and a reach drawn for
            // that arm. Both fit the cycle a whole number of times, which is what lets it loop
            return Pose(stretch: { place in
                let slow = sin(2 * .pi * (CGFloat(1 + Int(scatter(place, 1) * 3)) * time + scatter(place, 2)))
                let quick = sin(2 * .pi * (CGFloat(4 + Int(scatter(place, 3) * 3)) * time + scatter(place, 4)))
                return (0.1 + 0.08 * scatter(place, 5)) * (slow + 0.5 * quick)
            })
        }
    }

    /// The bounce `time` into the cycle: it crouches, then hops three times, each lower and shorter
    /// as under one gravity, squashing where it lands; `squash` is how flat a stay on the ground presses it.
    private func bouncePose(at time: CGFloat) -> Pose {
        let phases = [
            BounceStage(0.06, 0, 0.1), BounceStage(0.34, 8, 0), BounceStage(0.4, 0, 0.18), BounceStage(0.58, 3.4, 0),
            BounceStage(0.63, 0, 0.1), BounceStage(0.73, 1.1, 0), BounceStage(0.77, 0, 0.05), BounceStage(1, 0, 0),
        ]
        let index = phases.firstIndex { time < $0.end } ?? phases.count - 1
        let phase = phases[index], start = index == 0 ? 0 : phases[index - 1].end
        let x = (time - start) / (phase.end - start)
        let squash = phase.squash * sin(.pi * x)
        // in the air it is drawn out a little, most where it moves fastest
        let drawn = 0.06 * sqrt(phase.height / 8) * abs(1 - 2 * x)
        let scaleY = 1 - squash + drawn
        // squashed or drawn out, its foot stays where it was
        return Pose(y: 4 * phase.height * x * (1 - x) - (1 - scaleY) * sparkSide / 2,
                    scaleX: 1 + 0.8 * squash - 0.6 * drawn, scaleY: scaleY)
    }
}
