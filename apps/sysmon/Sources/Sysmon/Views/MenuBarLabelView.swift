import SwiftUI

/// MenuBarExtra labels render poorly with nested stacks — use a single multiline Text.
struct MenuBarLabelView: View {
    let downloadRate: UInt64
    let uploadRate: UInt64

    var body: some View {
        Text(labelText)
            .font(.system(size: 7, weight: .medium, design: .monospaced))
            .foregroundStyle(.primary)
            .multilineTextAlignment(.trailing)
            .lineSpacing(-2)
            .frame(maxWidth: 32, alignment: .trailing)
            .minimumScaleFactor(0.65)
            .lineLimit(2)
            .allowsTightening(true)
    }

    private var labelText: String {
        let down = ByteFormatter.formatMenuBarMbps(bytesPerSecond: downloadRate)
        let up = ByteFormatter.formatMenuBarMbps(bytesPerSecond: uploadRate)
        return "↓\(down)\n↑\(up)"
    }
}