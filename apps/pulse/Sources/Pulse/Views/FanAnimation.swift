import SwiftUI
import AppKit

struct FanAnimation: View {
    let fan: Fan

    private static let templatedFanImage: NSImage? = {
        if let image = Bundle.module.image(forResource: "fan") {
            image.isTemplate = true
            return image
        }
        return nil
    }()

    @State private var rotation: Double = 0
    @State private var spinBoost: Double = 0

    // High frequency timer for smooth rotation
    private let timer = Timer.publish(every: 1.0 / 30.0, on: .main, in: .common).autoconnect()

    private var blurRadius: Double {
        // More blur at higher speeds. Max around 3.5-4 for fast fans.
        // Boost a bit for easter egg spins too.
        let base = min(Double(fan.currentRPM) / 1400.0, 4.0)
        return min(base + spinBoost * 0.4, 6.0)
    }

    var body: some View {
        VStack(spacing: 1) {
            // The fan icon with rotation and speed-dependent blur
            if let nsImage = Self.templatedFanImage {
                Image(nsImage: nsImage)
                    .resizable()
                    .scaledToFit()
                    .frame(width: 28, height: 28)
                    .foregroundStyle(.orange)
                    .rotationEffect(.degrees(rotation))
                    .blur(radius: blurRadius)
                    .opacity(0.92)
                    .onTapGesture {
                        triggerEasterEggSpin()
                    }
            } else {
                // Fallback if image not found
                Image(systemName: "fanblades")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 28, height: 28)
                    .foregroundStyle(.orange)
                    .rotationEffect(.degrees(rotation))
                    .blur(radius: blurRadius)
                    .onTapGesture {
                        triggerEasterEggSpin()
                    }
            }

            // Small label "fan-1"
            Text("fan-\(fan.id + 1)")
                .font(.system(size: 7, weight: .semibold))
                .foregroundStyle(.secondary)
                .lineLimit(1)

            // RPM
            Text("\(Int(fan.currentRPM))")
                .font(.system(size: 8, weight: .medium, design: .monospaced))
                .foregroundStyle(.orange)
                .lineLimit(1)
        }
        .onReceive(timer) { _ in
            updateRotation()
        }
    }

    private func updateRotation() {
        // Normalize speed. Typical MacBook fans go up to ~5500-7000 RPM.
        let normalizedSpeed = min(fan.currentRPM / 5200.0, 1.8)
        let effectiveSpeed = normalizedSpeed + spinBoost

        // Base rotation speed in degrees per frame (30fps)
        // At full speed this gives a nice fast but not blurry spin.
        let degreesPerFrame = effectiveSpeed * 19.0

        rotation = (rotation + degreesPerFrame).truncatingRemainder(dividingBy: 360)
    }

    private func triggerEasterEggSpin() {
        // Quick high-speed spin (easter egg)
        withAnimation(.linear(duration: 0.5)) {
            spinBoost = 12.0
        }

        // Wind down after a few seconds
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            withAnimation(.easeOut(duration: 3.0)) {
                spinBoost = 0
            }
        }
    }
}