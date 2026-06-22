import SwiftUI

struct SparklineView: View {
    let values: [Double]
    let color: Color
    var label: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            if let label {
                Text(label)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }

            Canvas { context, size in
                let background = RoundedRectangle(cornerRadius: 4)
                context.fill(background.path(in: CGRect(origin: .zero, size: size)), with: .color(color.opacity(0.08)))

                guard values.count >= 2 else { return }

                let peak = max(values.max() ?? 0, 0.001)
                let stepX = size.width / CGFloat(values.count - 1)
                var points: [CGPoint] = []

                for index in values.indices {
                    let x = CGFloat(index) * stepX
                    let normalized = CGFloat(values[index] / peak)
                    let y = size.height - (normalized * (size.height - 4)) - 2
                    points.append(CGPoint(x: x, y: y))
                }

                var area = Path()
                area.move(to: CGPoint(x: points[0].x, y: size.height))
                for point in points {
                    area.addLine(to: point)
                }
                area.addLine(to: CGPoint(x: points[points.count - 1].x, y: size.height))
                area.closeSubpath()
                context.fill(area, with: .linearGradient(
                    Gradient(colors: [color.opacity(0.28), color.opacity(0.02)]),
                    startPoint: CGPoint(x: 0, y: 0),
                    endPoint: CGPoint(x: 0, y: size.height)
                ))

                var line = Path()
                for (index, point) in points.enumerated() {
                    if index == 0 {
                        line.move(to: point)
                    } else {
                        line.addLine(to: point)
                    }
                }
                context.stroke(
                    line,
                    with: .color(color),
                    style: StrokeStyle(lineWidth: 1.5, lineCap: .round, lineJoin: .round)
                )
            }
            .frame(height: 28)
            .frame(maxWidth: .infinity)
            .overlay {
                if values.count < 2 {
                    Text("…")
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }
            }
        }
    }
}