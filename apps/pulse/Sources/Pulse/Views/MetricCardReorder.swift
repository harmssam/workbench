import SwiftUI
import UniformTypeIdentifiers

struct CardGrabber: View {
    let kind: MetricCardKind
    @Binding var dragging: MetricCardKind?

    @State private var isHovered = false

    var body: some View {
        Image(systemName: "line.3.horizontal")
            .font(.caption2)
            .foregroundStyle(isHovered ? .secondary : .tertiary)
            .padding(.horizontal, 4)
            .padding(.vertical, 2)
            .contentShape(Rectangle())
            .onHover { hovering in
                isHovered = hovering
                if hovering {
                    NSCursor.openHand.push()
                } else {
                    NSCursor.pop()
                }
            }
            .onDrag {
                dragging = kind
                return NSItemProvider(object: kind.rawValue as NSString)
            }
            .help("Drag to reorder")
    }
}

struct MetricCardReorderDelegate: DropDelegate {
    let card: MetricCardKind
    @Binding var order: [MetricCardKind]
    @Binding var dragging: MetricCardKind?

    func validateDrop(info: DropInfo) -> Bool {
        dragging != nil
    }

    func dropUpdated(info: DropInfo) -> DropProposal? {
        DropProposal(operation: .move)
    }

    func dropEntered(info: DropInfo) {
        guard let dragging, dragging != card,
              let fromIndex = order.firstIndex(of: dragging),
              let toIndex = order.firstIndex(of: card) else { return }

        withAnimation(.easeInOut(duration: 0.15)) {
            order.move(
                fromOffsets: IndexSet(integer: fromIndex),
                toOffset: toIndex > fromIndex ? toIndex + 1 : toIndex
            )
        }
    }

    func performDrop(info: DropInfo) -> Bool {
        dragging = nil
        return true
    }

    func dropExited(info: DropInfo) {}
}