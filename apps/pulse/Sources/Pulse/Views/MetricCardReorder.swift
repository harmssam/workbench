import AppKit
import SwiftUI
import UniformTypeIdentifiers

enum PopoverDropAnimation {
    static let reorder = Animation.spring(response: 0.55, dampingFraction: 0.88)
    static let landing = Animation.spring(response: 0.32, dampingFraction: 0.86)
}

@MainActor
private func clearDragBindings(
    dragging: Binding<MetricCardKind?>,
    dropInsertionIndex: Binding<Int?>
) {
    var transaction = Transaction()
    transaction.disablesAnimations = true
    withTransaction(transaction) {
        dragging.wrappedValue = nil
        dropInsertionIndex.wrappedValue = nil
    }
}

// MARK: - Drag coordination (viewport scroll + stable insertion index)

@MainActor
final class MetricCardDragCoordinator: ObservableObject {
    weak var scrollView: NSScrollView?
    private(set) var isAutoscrolling = false

    private var dragMonitorTimer: Timer?
    private var mouseUpMonitor: Any?
    private var mouseDragMonitor: Any?
    private var viewportFrameProvider: (() -> CGRect)?
    private var onScrollFallback: ((Int) -> Void)?
    private var onCardDropped: ((MetricCardKind) -> Void)?
    private var lastFallbackStepTime = Date.distantPast
    private let fallbackStepInterval: TimeInterval = 0.38
    private var onDragEnded: (@MainActor () -> Void)?
    private var expectedViewportHeight: CGFloat = 490
    private var dragDidFinalize = false
    private var dragStartTime: Date?
    private var edgeEnteredTime: Date?

    private let startZoneFraction: CGFloat = 0.20
    private let startZoneMinPx: CGFloat = 56
    private let dwellBeforeScroll: TimeInterval = 0.22
    private let maxPxPerFrame: CGFloat = 5.5
    private let dragStartDampeningDuration: TimeInterval = 0.55

    /// Hysteresis: top/bottom bands pick a side; the middle band keeps the last choice.
    private var stickyInsertAfter = false
    private var hoverCard: MetricCardKind?

    func attach(to scrollView: NSScrollView) {
        self.scrollView = scrollView
    }

    func configure(
        viewportFrame: @escaping () -> CGRect,
        viewportHeight: CGFloat = 490,
        onScrollFallback: ((Int) -> Void)? = nil,
        onCardDropped: ((MetricCardKind) -> Void)? = nil
    ) {
        viewportFrameProvider = viewportFrame
        expectedViewportHeight = viewportHeight
        self.onScrollFallback = onScrollFallback
        self.onCardDropped = onCardDropped
    }

    func beginDragSession(
        order: Binding<[MetricCardKind]>,
        dragging: Binding<MetricCardKind?>,
        dropInsertionIndex: Binding<Int?>
    ) {
        guard dragMonitorTimer == nil else { return }
        dragDidFinalize = false
        dragStartTime = Date()
        edgeEnteredTime = nil
        onDragEnded = { [weak self] in
            guard let self, !self.dragDidFinalize, let kind = dragging.wrappedValue else { return }
            self.dragDidFinalize = true
            self.finalizeDrag(
                insertionIndex: dropInsertionIndex.wrappedValue,
                hoveredCard: nil,
                locationY: nil,
                cardHeight: nil,
                order: &order.wrappedValue,
                dragging: kind
            )
            clearDragBindings(dragging: dragging, dropInsertionIndex: dropInsertionIndex)
            self.reset()
            NSCursor.pop()
        }
        endMouseUpMonitor()
        mouseUpMonitor = NSEvent.addLocalMonitorForEvents(matching: .leftMouseUp) { [weak self] event in
            Task { @MainActor in
                self?.onDragEnded?()
            }
            return event
        }
        mouseDragMonitor = NSEvent.addLocalMonitorForEvents(matching: [.leftMouseDragged, .mouseMoved]) { [weak self] event in
            Task { @MainActor in
                self?.considerAutoscroll()
            }
            return event
        }

        let timer = Timer(timeInterval: 1.0 / 60.0, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.considerAutoscroll()
            }
        }
        // `.eventTracking` is required — timers on `.common` alone do not fire during system drag.
        RunLoop.main.add(timer, forMode: .eventTracking)
        RunLoop.main.add(timer, forMode: .common)
        dragMonitorTimer = timer
        resolveScrollView()
    }

    func reset() {
        stickyInsertAfter = false
        hoverCard = nil
        dragDidFinalize = false
        isAutoscrolling = false
        dragStartTime = nil
        edgeEnteredTime = nil
        dragMonitorTimer?.invalidate()
        dragMonitorTimer = nil
        onDragEnded = nil
        endMouseUpMonitor()
    }

    func markFinalized() {
        dragDidFinalize = true
    }

    private func endMouseUpMonitor() {
        if let mouseUpMonitor {
            NSEvent.removeMonitor(mouseUpMonitor)
            self.mouseUpMonitor = nil
        }
        if let mouseDragMonitor {
            NSEvent.removeMonitor(mouseDragMonitor)
            self.mouseDragMonitor = nil
        }
    }

    private func resolveScrollView() {
        if scrollView == nil {
            if let found = PulseScrollViewFinder.findInKeyWindow(preferredHeight: expectedViewportHeight) {
                attach(to: found)
            }
        }
    }

    private func resolvedViewportFrame() -> CGRect? {
        if let frame = viewportFrameProvider?(), frame.height > 0 {
            return frame
        }
        resolveScrollView()
        if let scrollView, let frame = PulseScrollViewFinder.screenFrame(for: scrollView) {
            return frame
        }
        return nil
    }

    /// Maps a drop slot (0 = before first card, 1 = between first/second, …) to display insertion index.
    func displayInsertionIndex(
        slotIndex: Int,
        order: [MetricCardKind],
        dragging: MetricCardKind
    ) -> Int? {
        guard order.contains(where: { $0 == dragging }) else { return nil }
        var index = max(0, min(slotIndex, order.count))
        if let fromIndex = order.firstIndex(of: dragging), index > fromIndex {
            index -= 1
        }
        return index
    }

    func insertionIndex(
        for card: MetricCardKind,
        cardHeight: CGFloat,
        locationY: CGFloat,
        order: [MetricCardKind],
        dragging: MetricCardKind
    ) -> Int? {
        guard let toIndex = order.firstIndex(of: card),
              dragging != card else { return nil }

        let topZone = cardHeight * 0.28
        let bottomZone = cardHeight * 0.72
        let slotIndex: Int
        if locationY < topZone {
            slotIndex = toIndex
        } else if locationY > bottomZone {
            slotIndex = toIndex + 1
        } else if locationY < cardHeight * 0.5 {
            slotIndex = toIndex
        } else {
            slotIndex = toIndex + 1
        }
        return displayInsertionIndex(slotIndex: slotIndex, order: order, dragging: dragging)
    }

    func applyReorder(
        insertionIndex: Int,
        order: inout [MetricCardKind],
        dragging: MetricCardKind
    ) {
        guard let fromIndex = order.firstIndex(of: dragging) else { return }

        var destination = insertionIndex
        if fromIndex < insertionIndex {
            destination = insertionIndex + 1
        }
        destination = min(destination, order.count)
        guard destination != fromIndex, destination != fromIndex + 1 else { return }

        order.move(
            fromOffsets: IndexSet(integer: fromIndex),
            toOffset: destination
        )
    }

    /// Moves the dragged card onto the hovered card (original behavior that enabled multi-slot drags).
    func applyReorderOnHover(
        hoveredCard: MetricCardKind,
        locationY: CGFloat,
        cardHeight: CGFloat,
        order: inout [MetricCardKind],
        dragging: MetricCardKind,
        animated: Bool = true
    ) {
        guard let insertionIndex = insertionIndex(
            for: hoveredCard,
            cardHeight: cardHeight,
            locationY: locationY,
            order: order,
            dragging: dragging
        ) else { return }

        if animated {
            withAnimation(.easeInOut(duration: 0.14)) {
                applyReorder(insertionIndex: insertionIndex, order: &order, dragging: dragging)
            }
        } else {
            applyReorder(insertionIndex: insertionIndex, order: &order, dragging: dragging)
        }
    }

    func finalizeDrag(
        insertionIndex: Int?,
        hoveredCard: MetricCardKind?,
        locationY: CGFloat?,
        cardHeight: CGFloat?,
        order: inout [MetricCardKind],
        dragging: MetricCardKind
    ) {
        withAnimation(PopoverDropAnimation.reorder) {
            if let insertionIndex {
                let applyIndex = insertionIndex >= order.count
                    ? max(0, order.count - 1)
                    : insertionIndex
                applyReorder(insertionIndex: applyIndex, order: &order, dragging: dragging)
            } else if let hoveredCard, let locationY, let cardHeight,
                      let index = self.insertionIndex(
                          for: hoveredCard,
                          cardHeight: cardHeight,
                          locationY: locationY,
                          order: order,
                          dragging: dragging
                      ) {
                applyReorder(insertionIndex: index, order: &order, dragging: dragging)
            }
        }
        onCardDropped?(dragging)
    }

    func considerAutoscroll() {
        resolveScrollView()
        guard let frame = resolvedViewportFrame(), frame.height > 0 else {
            isAutoscrolling = false
            edgeEnteredTime = nil
            return
        }

        let mouse = NSEvent.mouseLocation
        let zoneHeight = max(startZoneMinPx, frame.height * startZoneFraction)

        var direction: CGFloat = 0
        var depth: CGFloat = 0

        if mouse.y > frame.maxY - zoneHeight {
            let distanceFromTopEdge = frame.maxY - mouse.y
            depth = max(0, min(1, 1 - distanceFromTopEdge / zoneHeight))
            direction = -1
        } else if mouse.y < frame.minY + zoneHeight {
            let distanceFromBottomEdge = mouse.y - frame.minY
            depth = max(0, min(1, 1 - distanceFromBottomEdge / zoneHeight))
            direction = 1
        }

        guard direction != 0 else {
            isAutoscrolling = false
            edgeEnteredTime = nil
            return
        }

        if edgeEnteredTime == nil {
            edgeEnteredTime = Date()
        }
        guard let entered = edgeEnteredTime,
              Date().timeIntervalSince(entered) >= dwellBeforeScroll else {
            return
        }

        isAutoscrolling = true

        var pixels = max(0.8, maxPxPerFrame * depth * depth)
        if let start = dragStartTime {
            let elapsed = Date().timeIntervalSince(start)
            if elapsed < dragStartDampeningDuration {
                let ramp = elapsed / dragStartDampeningDuration
                pixels *= 0.3 + 0.7 * ramp
            }
        }

        if let scrollView, let window = scrollView.window,
           let event = NSEvent.mouseEvent(
               with: .leftMouseDragged,
               location: window.convertPoint(fromScreen: mouse),
               modifierFlags: [],
               timestamp: ProcessInfo.processInfo.systemUptime,
               windowNumber: window.windowNumber,
               context: nil,
               eventNumber: 0,
               clickCount: 0,
               pressure: 0
           ), scrollView.contentView.autoscroll(with: event) {
            return
        }

        if let scrollView {
            var origin = scrollView.contentView.bounds.origin
            let documentHeight = scrollView.documentView?.frame.height ?? 0
            let maxY = max(0, documentHeight - scrollView.contentView.bounds.height)
            origin.y = min(max(0, origin.y + direction * pixels), maxY)
            scrollView.contentView.scroll(to: origin)
            scrollView.reflectScrolledClipView(scrollView.contentView)
            return
        }

        let now = Date()
        guard now.timeIntervalSince(lastFallbackStepTime) >= fallbackStepInterval else { return }
        lastFallbackStepTime = now
        onScrollFallback?(Int(direction))
    }
}

// MARK: - Grabber & drop delegate

struct CardGrabber: View {
    let kind: MetricCardKind
    @Binding var dragging: MetricCardKind?
    var onDragBegan: (() -> Void)?

    @State private var isHovered = false

    private let hitWidth: CGFloat = 52
    private let hitHeight: CGFloat = 36

    private var isActive: Bool {
        isHovered || dragging == kind
    }

    var body: some View {
        Image(systemName: "line.3.horizontal")
            .font(.title3.weight(.medium))
            .symbolRenderingMode(.hierarchical)
            .foregroundStyle(isActive ? .secondary : .tertiary)
            .frame(width: hitWidth, height: hitHeight)
            .pulseGrabberSurface(isActive: isActive)
            .contentShape(RoundedRectangle(cornerRadius: PulseGlassMetrics.surfaceCornerRadius, style: .continuous))
            .onHover { hovering in
                isHovered = hovering
                if hovering, dragging == nil {
                    NSCursor.openHand.push()
                } else {
                    NSCursor.pop()
                }
            }
            .onDrag {
                dragging = kind
                onDragBegan?()
                NSCursor.closedHand.push()
                return NSItemProvider(object: kind.rawValue as NSString)
            }
            .help("Drag to reorder")
    }
}

struct GapInsertionDropDelegate: DropDelegate {
    let insertionIndex: Int
    @Binding var order: [MetricCardKind]
    @Binding var dragging: MetricCardKind?
    @Binding var dropInsertionIndex: Int?
    var dragCoordinator: MetricCardDragCoordinator

    func validateDrop(info: DropInfo) -> Bool {
        dragging != nil
    }

    func dropUpdated(info: DropInfo) -> DropProposal? {
        setInsertionIndex()
        dragCoordinator.considerAutoscroll()
        return DropProposal(operation: .move)
    }

    func dropEntered(info: DropInfo) {
        _ = dropUpdated(info: info)
    }

    func performDrop(info: DropInfo) -> Bool {
        dragCoordinator.markFinalized()
        if let dragging {
            dragCoordinator.finalizeDrag(
                insertionIndex: dropInsertionIndex ?? insertionIndex,
                hoveredCard: nil,
                locationY: nil,
                cardHeight: nil,
                order: &order,
                dragging: dragging
            )
        }
        clearDragBindings(dragging: $dragging, dropInsertionIndex: $dropInsertionIndex)
        dragCoordinator.reset()
        NSCursor.pop()
        return true
    }

    private func setInsertionIndex() {
        guard dragging != nil, dropInsertionIndex != insertionIndex else { return }
        withAnimation(.easeOut(duration: 0.1)) {
            dropInsertionIndex = insertionIndex
        }
    }
}

struct CardGapDropZone: View {
    let insertionIndex: Int
    let isActive: Bool
    let isDragging: Bool
    let hitHeight: CGFloat
    @Binding var order: [MetricCardKind]
    @Binding var dragging: MetricCardKind?
    @Binding var dropInsertionIndex: Int?
    var dragCoordinator: MetricCardDragCoordinator

    var body: some View {
        // Zero-height anchor so drop targets overlay card spacing without shifting scroll offset.
        Color.clear
            .frame(height: 0)
            .overlay {
                if isDragging {
                    VStack(spacing: 4) {
                        if isActive {
                            DropInsertionIndicator()
                                .transition(.opacity.combined(with: .scale(scale: 0.96)))
                        }
                        Color.clear
                            .frame(height: isActive ? 6 : hitHeight)
                    }
                    .frame(minHeight: hitHeight)
                    .frame(maxWidth: .infinity)
                    .contentShape(Rectangle())
                    .offset(y: -hitHeight / 2)
                    .animation(.easeOut(duration: 0.12), value: isActive)
                    .onDrop(
                        of: [.plainText],
                        delegate: GapInsertionDropDelegate(
                            insertionIndex: insertionIndex,
                            order: $order,
                            dragging: $dragging,
                            dropInsertionIndex: $dropInsertionIndex,
                            dragCoordinator: dragCoordinator
                        )
                    )
                }
            }
            .allowsHitTesting(isDragging)
    }
}

struct DropInsertionIndicator: View {
    var body: some View {
        HStack(spacing: 6) {
            Circle()
                .fill(Color.accentColor)
                .frame(width: 6, height: 6)
            RoundedRectangle(cornerRadius: 1.5)
                .fill(Color.accentColor)
                .frame(height: 3)
            Circle()
                .fill(Color.accentColor)
                .frame(width: 6, height: 6)
        }
        .padding(.horizontal, 2)
        .shadow(color: Color.accentColor.opacity(0.35), radius: 3, y: 0)
        .transition(.opacity.combined(with: .scale(scale: 0.95)))
    }
}

struct MetricCardReorderDelegate: DropDelegate {
    let card: MetricCardKind
    let cardHeight: CGFloat
    @Binding var order: [MetricCardKind]
    @Binding var dragging: MetricCardKind?
    @Binding var dropInsertionIndex: Int?
    var dragCoordinator: MetricCardDragCoordinator

    func validateDrop(info: DropInfo) -> Bool {
        dragging != nil
    }

    func dropUpdated(info: DropInfo) -> DropProposal? {
        handleHover(info: info)
        return DropProposal(operation: .move)
    }

    func dropEntered(info: DropInfo) {
        handleHover(info: info)
    }

    func performDrop(info: DropInfo) -> Bool {
        dragCoordinator.markFinalized()
        if let dragging {
            dragCoordinator.finalizeDrag(
                insertionIndex: dropInsertionIndex,
                hoveredCard: card,
                locationY: info.location.y,
                cardHeight: cardHeight,
                order: &order,
                dragging: dragging
            )
        }
        clearDragBindings(dragging: $dragging, dropInsertionIndex: $dropInsertionIndex)
        dragCoordinator.reset()
        NSCursor.pop()
        return true
    }

    private func handleHover(info: DropInfo) {
        guard let dragging, dragging != card,
              let cardIndex = order.firstIndex(of: card) else { return }

        // Card body only handles edge bands; gaps between cards own the space between.
        let topZone = cardHeight * 0.28
        let bottomZone = cardHeight * 0.72
        let slotIndex: Int
        if info.location.y < topZone {
            slotIndex = cardIndex
        } else if info.location.y > bottomZone {
            slotIndex = cardIndex + 1
        } else {
            dragCoordinator.considerAutoscroll()
            return
        }

        guard let index = dragCoordinator.displayInsertionIndex(
            slotIndex: slotIndex,
            order: order,
            dragging: dragging
        ), dropInsertionIndex != index else {
            dragCoordinator.considerAutoscroll()
            return
        }

        withAnimation(.easeOut(duration: 0.1)) {
            dropInsertionIndex = index
        }
        dragCoordinator.considerAutoscroll()
    }
}

struct EdgeAutoscrollDropDelegate: DropDelegate {
    let insertionIndex: Int
    @Binding var order: [MetricCardKind]
    @Binding var dragging: MetricCardKind?
    @Binding var dropInsertionIndex: Int?
    var dragCoordinator: MetricCardDragCoordinator

    func validateDrop(info: DropInfo) -> Bool {
        dragging != nil
    }

    func dropUpdated(info: DropInfo) -> DropProposal? {
        dropInsertionIndex = insertionIndex
        dragCoordinator.considerAutoscroll()
        return DropProposal(operation: .move)
    }

    func dropEntered(info: DropInfo) {
        _ = dropUpdated(info: info)
    }

    func performDrop(info: DropInfo) -> Bool {
        dragCoordinator.markFinalized()
        if let dragging {
            dragCoordinator.finalizeDrag(
                insertionIndex: dropInsertionIndex ?? insertionIndex,
                hoveredCard: nil,
                locationY: nil,
                cardHeight: nil,
                order: &order,
                dragging: dragging
            )
        }
        clearDragBindings(dragging: $dragging, dropInsertionIndex: $dropInsertionIndex)
        dragCoordinator.reset()
        NSCursor.pop()
        return true
    }
}

struct ScrollGapDropDelegate: DropDelegate {
    @Binding var order: [MetricCardKind]
    @Binding var dragging: MetricCardKind?
    @Binding var dropInsertionIndex: Int?
    var dragCoordinator: MetricCardDragCoordinator

    func validateDrop(info: DropInfo) -> Bool {
        dragging != nil
    }

    func dropUpdated(info: DropInfo) -> DropProposal? {
        dragCoordinator.considerAutoscroll()
        return DropProposal(operation: .move)
    }

    func performDrop(info: DropInfo) -> Bool {
        dragCoordinator.markFinalized()
        if let dragging {
            dragCoordinator.finalizeDrag(
                insertionIndex: dropInsertionIndex,
                hoveredCard: nil,
                locationY: nil,
                cardHeight: nil,
                order: &order,
                dragging: dragging
            )
        }
        clearDragBindings(dragging: $dragging, dropInsertionIndex: $dropInsertionIndex)
        dragCoordinator.reset()
        NSCursor.pop()
        return true
    }
}

struct BottomMetricCardDropDelegate: DropDelegate {
    @Binding var order: [MetricCardKind]
    @Binding var dragging: MetricCardKind?
    @Binding var dropInsertionIndex: Int?
    var dragCoordinator: MetricCardDragCoordinator

    func validateDrop(info: DropInfo) -> Bool {
        dragging != nil
    }

    func dropUpdated(info: DropInfo) -> DropProposal? {
        dropInsertionIndex = order.count
        dragCoordinator.considerAutoscroll()
        return DropProposal(operation: .move)
    }

    func dropEntered(info: DropInfo) {
        _ = dropUpdated(info: info)
    }

    func performDrop(info: DropInfo) -> Bool {
        dragCoordinator.markFinalized()
        if let dragging {
            dragCoordinator.finalizeDrag(
                insertionIndex: dropInsertionIndex ?? order.count,
                hoveredCard: nil,
                locationY: nil,
                cardHeight: nil,
                order: &order,
                dragging: dragging
            )
        }
        clearDragBindings(dragging: $dragging, dropInsertionIndex: $dropInsertionIndex)
        dragCoordinator.reset()
        NSCursor.pop()
        return true
    }
}