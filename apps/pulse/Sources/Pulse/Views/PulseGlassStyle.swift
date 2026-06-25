import AppKit
import SwiftUI

enum PulseGlassMetrics {
    static let popoverCornerRadius: CGFloat = 14
    static let cardCornerRadius: CGFloat = 10
    static let surfaceCornerRadius: CGFloat = 8
}

extension View {
    func pulsePopoverChrome() -> some View {
        background(Color(nsColor: .windowBackgroundColor))
    }

    func pulseCardGlass() -> some View {
        background(Color(nsColor: .controlBackgroundColor).opacity(0.55))
            .overlay(
                RoundedRectangle(cornerRadius: PulseGlassMetrics.cardCornerRadius, style: .continuous)
                    .strokeBorder(Color.primary.opacity(0.06), lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: PulseGlassMetrics.cardCornerRadius, style: .continuous))
    }

    func pulseInsetSurface(cornerRadius: CGFloat = PulseGlassMetrics.surfaceCornerRadius) -> some View {
        background(Color.primary.opacity(0.055))
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
    }

    func pulseGrabberSurface(isActive: Bool) -> some View {
        background(
            RoundedRectangle(cornerRadius: PulseGlassMetrics.surfaceCornerRadius, style: .continuous)
                .fill(isActive ? Color.primary.opacity(0.1) : Color.primary.opacity(0.05))
        )
    }
}

@MainActor
enum PulseHostingChrome {
    static func applyTransparentPopoverBackground(to hostingController: NSHostingController<some View>) {}
}