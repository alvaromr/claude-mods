// The Claude spark the pet is: its outline, and the path of it with each arm stretched.

import AppKit

let sparkSide: CGFloat = 44

// The Claude mark as simple-icons ships it (viewBox 0 0 24 24), its outline
// flattened to x, y pairs so each arm can be stretched on its own.
let sparkOutline: [CGFloat] = [
    4.71, 15.96, 9.43, 13.31, 9.51, 13.08, 9.43, 12.95, 9.2, 12.95, 8.41, 12.9, 5.72, 12.83, 3.38, 12.73, 1.11, 12.61,
    0.54, 12.49, 0.01, 11.78, 0.06, 11.43, 0.54, 11.11, 1.23, 11.17, 2.75, 11.27, 5.02, 11.43, 6.68, 11.53, 9.12, 11.78,
    9.51, 11.78, 9.57, 11.63, 9.43, 11.53, 9.33, 11.43, 6.97, 9.84, 4.42, 8.15, 3.09, 7.18, 2.36, 6.68, 2, 6.22,
    1.84, 5.22, 2.5, 4.49, 3.38, 4.55, 3.6, 4.61, 4.5, 5.3, 6.4, 6.78, 8.89, 8.61, 9.26, 8.91, 9.4, 8.81, 9.42, 8.74,
    9.26, 8.46, 7.9, 6.02, 6.46, 3.53, 5.81, 2.5, 5.64, 1.88, 5.54, 1.15, 6.29, 0.13, 6.7, 0, 7.7, 0.13, 8.11, 0.5,
    8.73, 1.91, 9.74, 4.14, 11.29, 7.17, 11.74, 8.07, 11.99, 8.9, 12.08, 9.16, 12.24, 9.16, 12.24, 9.01, 12.36, 7.3,
    12.6, 5.21, 12.83, 2.51, 12.91, 1.75, 13.29, 0.84, 14.03, 0.35, 14.62, 0.63, 15.1, 1.32, 15.03, 1.76, 14.74, 3.61,
    14.19, 6.51, 13.82, 8.46, 14.03, 8.46, 14.28, 8.21, 15.26, 6.91, 16.91, 4.84, 17.64, 4.03, 18.49, 3.12, 19.04, 2.69,
    20.07, 2.69, 20.83, 3.82, 20.49, 4.98, 19.43, 6.33, 18.54, 7.47, 17.28, 9.17, 16.49, 10.53, 16.57, 10.64,
    16.75, 10.62, 19.61, 10.02, 21.15, 9.74, 22.99, 9.42, 23.82, 9.81, 23.91, 10.21, 23.58, 11.01, 21.62, 11.5,
    19.31, 11.96, 15.87, 12.77, 15.83, 12.8, 15.88, 12.87, 17.43, 13.01, 18.09, 13.05, 19.71, 13.05, 22.73, 13.27,
    23.52, 13.79, 23.99, 14.43, 23.91, 14.92, 22.7, 15.54, 21.06, 15.15, 17.23, 14.24, 15.92, 13.91, 15.74, 13.91,
    15.74, 14.02, 16.83, 15.09, 18.84, 16.9, 21.34, 19.23, 21.47, 19.8, 21.15, 20.26, 20.81, 20.21, 18.61, 18.55,
    17.76, 17.81, 15.83, 16.19, 15.7, 16.19, 15.7, 16.36, 16.15, 17.01, 18.49, 20.53, 18.61, 21.61, 18.44, 21.96,
    17.83, 22.17, 17.17, 22.05, 15.79, 20.13, 14.38, 17.96, 13.24, 16.02, 13.1, 16.1, 12.42, 23.35, 12.11, 23.72,
    11.38, 24, 10.77, 23.54, 10.45, 22.79, 10.77, 21.32, 11.16, 19.39, 11.48, 17.86, 11.76, 15.96, 11.93, 15.33,
    11.92, 15.29, 11.78, 15.31, 10.35, 17.27, 8.17, 20.22, 6.44, 22.06, 6.03, 22.23, 5.32, 21.86, 5.38, 21.2,
    5.78, 20.61, 8.17, 17.57, 9.61, 15.69, 10.54, 14.6, 10.53, 14.44, 10.48, 14.44, 4.14, 18.56, 3.01, 18.71,
    2.52, 18.25, 2.58, 17.5, 2.81, 17.26, 4.72, 15.95,
]
let armCount = 12
/// Every notch between two arms lies within this radius of the center.
let hubRadius: CGFloat = 6

/// One vertex of the outline, from the mark's center: `reach` is how far out
/// along its arm it sits, 0 inside the hub and about 1 at the tip.
struct SparkVertex {
    let dx, dy, reach: CGFloat
    let arm: Int
}

let sparkVertices: [SparkVertex] = {
    let points = stride(from: 0, to: sparkOutline.count, by: 2).map {
        (x: sparkOutline[$0] - 12, y: 12 - sparkOutline[$0 + 1])
    }
    let radii = points.map { hypot($0.x, $0.y) }
    var arm = 0
    return points.indices.map { i in
        // a notch, where the outline passes closest to the center, starts the next arm
        let before = radii[(i + radii.count - 1) % radii.count], after = radii[(i + 1) % radii.count]
        if radii[i] <= before && radii[i] < after && radii[i] < hubRadius { arm += 1 }
        return SparkVertex(dx: points[i].x, dy: points[i].y,
                           reach: max(0, (radii[i] - hubRadius) / (12 - hubRadius)), arm: arm % armCount)
    }
}()
/// The arm that points nearest to twelve o'clock.
let topArm = sparkVertices.max { $0.dy < $1.dy }?.arm ?? 0

/// The mark with each arm stretched by `stretch(place)`, 0 leaving it as drawn; the arms
/// are counted clockwise from the top one, which is place 0.
func sparkPath(stretch: (Int) -> CGFloat = { _ in 0 }) -> CGPath {
    let path = CGMutablePath()
    for (i, vertex) in sparkVertices.enumerated() {
        let factor = (1 + stretch((vertex.arm - topArm + armCount) % armCount) * vertex.reach) * sparkSide / 24
        let point = CGPoint(x: sparkSide / 2 + vertex.dx * factor, y: sparkSide / 2 + vertex.dy * factor)
        if i == 0 { path.move(to: point) } else { path.addLine(to: point) }
    }
    path.closeSubpath()
    return path
}
