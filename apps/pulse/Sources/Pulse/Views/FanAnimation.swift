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
    @State private var eggRotation: Double = 0

    private var effectiveRPM: Double {
        let normalized = min(Double(fan.currentRPM) / 5200.0, 1.8)
        return (normalized + spinBoost) * 5200.0
    }

    // High frequency timer for smooth rotation
    private let timer = Timer.publish(every: 1.0 / 30.0, on: .main, in: .common).autoconnect()

    private var blurRadius: Double {
        // Blur kicks in above 250 RPM and increases with visual speed.
        // Uses effective speed (real + easter egg boost) so motion blur
        // appears during the fast spin and decreases as it winds down.
        let rpm = effectiveRPM
        if rpm < 250 {
            return 0
        }
        // Dialed back for realistic motion blur without being too aggressive.
        return min((rpm - 250) / 2500.0, 2.0)
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
                    .rotationEffect(.degrees(rotation + eggRotation))
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
                    .rotationEffect(.degrees(rotation + eggRotation))
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
        // Quick ramp up to full speed (0.4s), then slower ramp down (4s).
        // Animate eggRotation for visible spinning in tandem with blur/speed.
        withAnimation(.linear(duration: 0.4)) {
            spinBoost = 5.0
            eggRotation += 360 * 8  // quick multi-turn spin
        }
        withAnimation(.easeOut(duration: 4.0).delay(0.4)) {
            spinBoost = 0
            eggRotation += 360 * 4  // additional turns during wind-down
        }
    }
}