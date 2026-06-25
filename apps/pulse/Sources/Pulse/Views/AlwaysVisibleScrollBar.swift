import AppKit
import SwiftUI

// MARK: - Scroll view discovery

@MainActor
enum PulseScrollViewFinder {
    static func findInKeyWindow(preferredHeight: CGFloat) -> NSScrollView? {
        let windows = [NSApp.keyWindow, NSApp.mainWindow].compactMap { $0 }
            + NSApp.windows.filter { $0.isVisible }
        var seen = Set<ObjectIdentifier>()

        for window in windows {
            guard seen.insert(ObjectIdentifier(window)).inserted else { continue }
            var scrollViews: [NSScrollView] = []
            collect(scrollViews: &scrollViews, in: window.contentView)
            if let match = scrollViews.first(where: {
                abs($0.contentView.bounds.height - preferredHeight) < 40
            }) {
                return match
            }
            if let largest = scrollViews.max(by: {
                $0.contentView.bounds.height < $1.contentView.bounds.height
            }), largest.contentView.bounds.height > 100 {
                return largest
            }
        }
        return nil
    }

    static func screenFrame(for scrollView: NSScrollView) -> CGRect? {
        guard let window = scrollView.window else { return nil }
        return window.convertToScreen(scrollView.convert(scrollView.bounds, to: nil))
    }

    private static func collect(scrollViews: inout [NSScrollView], in view: NSView?) {
        guard let view else { return }
        if let scrollView = view as? NSScrollView {
            scrollViews.append(scrollView)
        }
        for subview in view.subviews {
            collect(scrollViews: &scrollViews, in: subview)
        }
    }
}

// MARK: - In-scroll anchor (reliable enclosingScrollView + frame reporting)

/// Place inside `ScrollView` content so `enclosingScrollView` resolves correctly.
struct ScrollViewAnchor: NSViewRepresentable {
    var dragCoordinator: MetricCardDragCoordinator?
    @Binding var screenFrame: CGRect

    func makeCoordinator() -> Coordinator {
        Coordinator(dragCoordinator: dragCoordinator, screenFrame: $screenFrame)
    }

    func makeNSView(context: Context) -> ScrollAnchorView {
        let view = ScrollAnchorView()
        view.onUpdate = { scrollView, frame in
            context.coordinator.publish(scrollView: scrollView, frame: frame)
        }
        return view
    }

    func updateNSView(_ nsView: ScrollAnchorView, context: Context) {
        context.coordinator.dragCoordinator = dragCoordinator
        nsView.onUpdate = { scrollView, frame in
            context.coordinator.publish(scrollView: scrollView, frame: frame)
        }
        nsView.report()
    }

    final class Coordinator {
        var dragCoordinator: MetricCardDragCoordinator?
        private var screenFrame: Binding<CGRect>

        init(dragCoordinator: MetricCardDragCoordinator?, screenFrame: Binding<CGRect>) {
            self.dragCoordinator = dragCoordinator
            self.screenFrame = screenFrame
        }

        @MainActor func publish(scrollView: NSScrollView?, frame: CGRect?) {
            if let scrollView {
                dragCoordinator?.attach(to: scrollView)
            }
            if let frame, frame.height > 0 {
                screenFrame.wrappedValue = frame
            }
        }
    }
}

final class ScrollAnchorView: NSView {
    var onUpdate: ((NSScrollView?, CGRect?) -> Void)?

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        report()
    }

    override func layout() {
        super.layout()
        report()
    }

    func report() {
        let scrollView = enclosingScrollView
        let frame: CGRect?
        if let scrollView, let window = scrollView.window {
            frame = window.convertToScreen(scrollView.convert(scrollView.bounds, to: nil))
        } else {
            frame = nil
        }
        onUpdate?(scrollView, frame)
    }
}

/// Legacy overlay tracker (fallback frame source).
struct ScrollViewportTracker: NSViewRepresentable {
    @Binding var screenFrame: CGRect

    func makeCoordinator() -> Coordinator {
        Coordinator(screenFrame: $screenFrame)
    }

    func makeNSView(context: Context) -> ViewportTrackingView {
        let view = ViewportTrackingView()
        view.onFrameChange = { frame in
            context.coordinator.publish(frame)
        }
        return view
    }

    func updateNSView(_ nsView: ViewportTrackingView, context: Context) {
        nsView.onFrameChange = { frame in
            context.coordinator.publish(frame)
        }
        nsView.reportFrame()
    }

    final class Coordinator {
        private var screenFrame: Binding<CGRect>

        init(screenFrame: Binding<CGRect>) {
            self.screenFrame = screenFrame
        }

        @MainActor func publish(_ frame: CGRect) {
            if frame.height > 0 {
                screenFrame.wrappedValue = frame
            }
        }
    }
}

final class ViewportTrackingView: NSView {
    var onFrameChange: ((CGRect) -> Void)?

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        reportFrame()
    }

    override func layout() {
        super.layout()
        reportFrame()
    }

    func reportFrame() {
        guard let window else { return }
        let viewRect = convert(bounds, to: nil)
        onFrameChange?(window.convertToScreen(viewRect))
    }
}

/// Configures the enclosing `NSScrollView` to keep vertical scrollers visible.
struct AlwaysVisibleScrollBar: NSViewRepresentable {
    func makeNSView(context: Context) -> NSView {
        let view = NSView(frame: .zero)
        DispatchQueue.main.async {
            configureScrollView(for: view)
        }
        return view
    }

    func updateNSView(_ nsView: NSView, context: Context) {
        DispatchQueue.main.async {
            configureScrollView(for: nsView)
        }
    }

    private func configureScrollView(for view: NSView) {
        guard let scrollView = view.enclosingScrollView else { return }
        scrollView.hasVerticalScroller = true
        scrollView.autohidesScrollers = false
        scrollView.scrollerStyle = .legacy
    }
}