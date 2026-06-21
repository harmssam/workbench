import SwiftUI

/// MenuBarExtra labels render poorly with nested stacks — use a single multiline Text.
struct MenuBarLabelView: View {
    let downloadRate: UInt64
    let uploadRate: UInt64

    var body: some View {
        Text(labelText)
            .font(.system(size: 9, weight: .semibold, design: .monospaced))
            .foregroundStyle(.primary)
            .multilineTextAlignment(.trailing)
            .lineSpacing(-1)
            .fixedSize()
    }

    private var labelText: String {
        let down = ByteFormatter.formatMbps(bytesPerSecond: downloadRate)
        let up = ByteFormatter.formatMbps(bytesPerSecond: uploadRate)
        return "↓\(down)\n↑\(up)"
    }
}