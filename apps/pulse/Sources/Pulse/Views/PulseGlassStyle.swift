import AppKit
import SwiftUI

enum PulseGlassMetrics {
    static let popoverCornerRadius: CGFloat = 14
    static let cardCornerRadius: CGFloat = 10
    static let surfaceCornerRadius: CGFloat = 8
}

extension View {
    @ViewBuilder
    func pulsePopoverChrome() -> some View {
        if #available(macOS 26.0, *) {
            modifier(PulsePopoverChromeModifier())
        } else {
            background(Color(nsColor: .windowBackgroundColor))
        }
    }

    @ViewBuilder
    func pulseCardGlass() -> some View {
        if #available(macOS 26.0, *) {
            modifier(PulseCardGlassModifier())
        } else {
            background(Color(nsColor: .controlBackgroundColor).opacity(0.55))
                .overlay(
                    RoundedRectangle(cornerRadius: PulseGlassMetrics.cardCornerRadius, style: .continuous)
                        .strokeBorder(Color.primary.opacity(0.06), lineWidth: 1)
                )
                .clipShape(RoundedRectangle(cornerRadius: PulseGlassMetrics.cardCornerRadius, style: .continuous))
        }
    }

    @ViewBuilder
    func pulseInsetSurface(cornerRadius: CGFloat = PulseGlassMetrics.surfaceCornerRadius) -> some View {
        if #available(macOS 26.0, *) {
            modifier(PulseInsetSurfaceModifier(cornerRadius: cornerRadius))
        } else {
            background(Color.primary.opacity(0.055))
                .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
        }
    }

    @ViewBuilder
    func pulseGrabberSurface(isActive: Bool) -> some View {
        if #available(macOS 26.0, *) {
            modifier(PulseGrabberSurfaceModifier(isActive: isActive))
        } else {
            background(
                RoundedRectangle(cornerRadius: PulseGlassMetrics.surfaceCornerRadius, style: .continuous)
                    .fill(isActive ? Color.primary.opacity(0.1) : Color.primary.opacity(0.05))
            )
        }
    }
}

@available(macOS 26.0, *)
private struct PulsePopoverChromeModifier: ViewModifier {
    func body(content: Content) -> some View {
        content.background {
            RoundedRectangle(cornerRadius: PulseGlassMetrics.popoverCornerRadius, style: .continuous)
                .fill(.clear)
                .glassEffect(.regular, in: .rect(cornerRadius: PulseGlassMetrics.popoverCornerRadius))
        }
    }
}

@available(macOS 26.0, *)
private struct PulseCardGlassModifier: ViewModifier {
    func body(content: Content) -> some View {
        content.glassEffect(.regular, in: .rect(cornerRadius: PulseGlassMetrics.cardCornerRadius))
    }
}

@available(macOS 26.0, *)
private struct PulseInsetSurfaceModifier: ViewModifier {
    let cornerRadius: CGFloat

    func body(content: Content) -> some View {
        content.glassEffect(.clear, in: .rect(cornerRadius: cornerRadius))
    }
}

@available(macOS 26.0, *)
private struct PulseGrabberSurfaceModifier: ViewModifier {
    let isActive: Bool

    func body(content: Content) -> some View {
        content.glassEffect(
            isActive ? .regular.interactive() : .clear,
            in: .rect(cornerRadius: PulseGlassMetrics.surfaceCornerRadius)
        )
    }
}

@MainActor
enum PulseHostingChrome {
    static func applyTransparentPopoverBackground(to hostingController: NSHostingController<some View>) {
        guard #available(macOS 26.0, *) else { return }
        hostingController.view.wantsLayer = true
        hostingController.view.layer?.backgroundColor = NSColor.clear.cgColor
        hostingController.view.layer?.isOpaque = false
    }
}