import SwiftUI

struct MenuBarLabelView: View {
    let downloadRate: UInt64
    let uploadRate: UInt64

    private let rowFont = Font.system(size: 8, weight: .semibold, design: .monospaced)
    private let arrowWidth: CGFloat = 8
    private let valueWidth: CGFloat = 26

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            rateRow(arrow: "↓", rate: downloadRate)
            rateRow(arrow: "↑", rate: uploadRate)
        }
        .frame(height: 20)
        .padding(.horizontal, 1)
    }

    private func rateRow(arrow: String, rate: UInt64) -> some View {
        HStack(spacing: 1) {
            Text(arrow)
                .font(rowFont)
                .foregroundStyle(.secondary)
                .frame(width: arrowWidth, alignment: .center)
            Text(ByteFormatter.formatMbps(bytesPerSecond: rate))
                .font(rowFont)
                .frame(width: valueWidth, alignment: .trailing)
                .monospacedDigit()
        }
        .frame(height: 10)
    }
}