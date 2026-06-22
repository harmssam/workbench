import SwiftUI

struct PopoverView: View {
    @EnvironmentObject private var appState: AppState

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider()
            ScrollView {
                VStack(spacing: 12) {
                    networkCard
                    diskCard
                    cpuCard
                }
                .padding(12)
            }
            .frame(maxHeight: 420)
            Divider()
            footer
        }
        .frame(width: 300)
        .background(.windowBackground)
    }

    private var header: some View {
        HStack {
            Text("Sysmon")
                .font(.headline)
            Spacer()
            if appState.isLoading {
                ProgressView()
                    .controlSize(.small)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
    }

    private var networkCard: some View {
        MetricCard(
            title: "Network",
            icon: "network",
            summary: [
                SummaryItem(label: "Download", value: "\(ByteFormatter.formatMbps(bytesPerSecond: appState.downloadRate)) Mbps", tint: .blue),
                SummaryItem(label: "Upload", value: "\(ByteFormatter.formatMbps(bytesPerSecond: appState.uploadRate)) Mbps", tint: .green)
            ],
            columns: [
                MetricColumn(title: "Process", width: .flexible, alignment: .leading),
                MetricColumn(title: "↓ Mbps", width: .fixed(52), alignment: .trailing),
                MetricColumn(title: "↑ Mbps", width: .fixed(52), alignment: .trailing)
            ],
            rows: appState.networkProcesses.map { process in
                [
                    process.name,
                    ByteFormatter.formatMbps(bytesPerSecond: process.downloadRate),
                    ByteFormatter.formatMbps(bytesPerSecond: process.uploadRate)
                ]
            },
            emptyMessage: "No active network traffic"
        )
    }

    private var cpuCard: some View {
        MetricCard(
            title: "CPU",
            icon: "cpu",
            summary: [
                SummaryItem(
                    label: "Total",
                    value: appState.cpuUsage.isValid ? PercentFormatter.format(appState.cpuUsage.total) : "—",
                    tint: .red
                ),
                SummaryItem(
                    label: "User",
                    value: appState.cpuUsage.isValid ? PercentFormatter.format(appState.cpuUsage.user) : "—",
                    tint: .orange
                ),
                SummaryItem(
                    label: "System",
                    value: appState.cpuUsage.isValid ? PercentFormatter.format(appState.cpuUsage.system) : "—",
                    tint: .yellow
                )
            ],
            columns: [
                MetricColumn(title: "Process", width: .flexible, alignment: .leading),
                MetricColumn(title: "CPU", width: .fixed(52), alignment: .trailing)
            ],
            rows: appState.cpuProcesses.map { process in
                [process.name, PercentFormatter.formatDetailed(process.usage)]
            },
            emptyMessage: "No active CPU usage"
        )
    }

    private var diskCard: some View {
        MetricCard(
            title: "Disk",
            icon: "internaldrive",
            summary: [
                SummaryItem(label: "Read", value: ByteFormatter.formatRate(bytesPerSecond: appState.diskReadRate), tint: .orange),
                SummaryItem(label: "Write", value: ByteFormatter.formatRate(bytesPerSecond: appState.diskWriteRate), tint: .purple)
            ],
            columns: [
                MetricColumn(title: "Process", width: .flexible, alignment: .leading),
                MetricColumn(title: "Read", width: .fixed(64), alignment: .trailing),
                MetricColumn(title: "Write", width: .fixed(64), alignment: .trailing)
            ],
            rows: appState.diskProcesses.map { process in
                [
                    process.name,
                    ByteFormatter.formatRate(bytesPerSecond: process.readRate),
                    ByteFormatter.formatRate(bytesPerSecond: process.writeRate)
                ]
            },
            emptyMessage: "No active disk I/O"
        )
    }

    private var footer: some View {
        HStack {
            Text(appState.lastError ?? "Updates every second")
                .font(.caption2)
                .foregroundStyle(appState.lastError == nil ? Color.secondary : Color.red)
                .lineLimit(1)
            Spacer()
            Button("Quit") {
                NSApplication.shared.terminate(nil)
            }
            .buttonStyle(.borderless)
            .font(.caption2)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }
}

// MARK: - Card components

private struct SummaryItem {
    let label: String
    let value: String
    let tint: Color
}

private struct MetricColumn {
    enum Width {
        case flexible
        case fixed(CGFloat)
    }

    let title: String
    let width: Width
    let alignment: Alignment
}

private struct MetricCard: View {
    let title: String
    let icon: String
    let summary: [SummaryItem]
    let columns: [MetricColumn]
    let rows: [[String]]
    let emptyMessage: String

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label(title, systemImage: icon)
                .font(.subheadline.weight(.semibold))

            HStack(spacing: 8) {
                ForEach(Array(summary.enumerated()), id: \.offset) { _, item in
                    summaryTile(item)
                }
            }

            if rows.isEmpty {
                Text(emptyMessage)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.vertical, 4)
            } else {
                VStack(spacing: 0) {
                    tableHeader
                    Divider()
                    ForEach(Array(rows.enumerated()), id: \.offset) { index, row in
                        tableRow(row, shaded: index.isMultiple(of: 2))
                        if index < rows.count - 1 {
                            Divider().opacity(0.35)
                        }
                    }
                }
                .background(Color.primary.opacity(0.05))
                .clipShape(RoundedRectangle(cornerRadius: 6))
            }
        }
        .padding(10)
        .background(.quaternary.opacity(0.35))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    private func summaryTile(_ item: SummaryItem) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(item.label)
                .font(.caption2)
                .foregroundStyle(.secondary)
            Text(item.value)
                .font(.system(.callout, design: .monospaced).weight(.medium))
                .foregroundStyle(item.tint)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(8)
        .background(item.tint.opacity(0.12))
        .clipShape(RoundedRectangle(cornerRadius: 6))
    }

    private var tableHeader: some View {
        HStack(spacing: 8) {
            ForEach(Array(columns.enumerated()), id: \.offset) { index, column in
                Text(column.title)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: isFlexible(column) ? .infinity : nil, alignment: column.alignment)
                    .frame(width: fixedWidth(for: column))
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
    }

    private func tableRow(_ cells: [String], shaded: Bool) -> some View {
        HStack(spacing: 8) {
            ForEach(Array(columns.enumerated()), id: \.offset) { index, column in
                let text = index < cells.count ? cells[index] : ""
                Text(text)
                    .font(index == 0 ? .caption : .caption.monospaced())
                    .lineLimit(1)
                    .truncationMode(.tail)
                    .frame(maxWidth: isFlexible(column) ? .infinity : nil, alignment: column.alignment)
                    .frame(width: fixedWidth(for: column))
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 5)
        .background(shaded ? Color.primary.opacity(0.04) : .clear)
    }

    private func isFlexible(_ column: MetricColumn) -> Bool {
        if case .flexible = column.width { return true }
        return false
    }

    private func fixedWidth(for column: MetricColumn) -> CGFloat? {
        if case .fixed(let value) = column.width { return value }
        return nil
    }
}