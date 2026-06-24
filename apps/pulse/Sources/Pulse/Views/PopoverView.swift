import AppKit
import SwiftUI

struct PopoverView: View {
    @ObservedObject var appState: AppState

    private let popoverWidth: CGFloat = 320
    private let scrollHeight: CGFloat = 490

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider()
            cardScroller
            Divider()
            footer
        }
        .frame(width: popoverWidth, height: 604)
        .background(Color(nsColor: .windowBackgroundColor))
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack {
                Text("Pulse")
                    .font(.headline)
                Spacer()

                if !appState.autoUpdateEnabled, let update = appState.availableUpdate {
                    Button {
                        appState.startUpdate()
                    } label: {
                        Label("Update \(update.version)", systemImage: "arrow.down.circle.fill")
                            .font(.caption.weight(.medium))
                            .foregroundStyle(.blue)
                    }
                    .buttonStyle(.borderless)
                    .help("Click to update to version \(update.version)")
                } else if appState.isDownloadingUpdate {
                    HStack(spacing: 4) {
                        ProgressView(value: appState.updateProgress)
                            .frame(width: 60)
                        Text(appState.updateStatus ?? "Updating...")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }

                // Auto-update option (disabled by default) at the very top right
                Toggle(isOn: $appState.autoUpdateEnabled) {
                    Image(systemName: "arrow.triangle.2.circlepath")
                        .imageScale(.small)
                }
                .toggleStyle(.button)
                .labelsHidden()
                .controlSize(.small)
                .help(appState.autoUpdateEnabled ? "Auto-update enabled" : "Auto-update disabled (disabled by default)")
            }
            Text(appState.headerSubtitle)
                .font(.caption)
                .foregroundStyle(.secondary)
                .monospacedDigit()
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
    }

    private var cardScroller: some View {
        ScrollView(.vertical, showsIndicators: true) {
            LazyVStack(spacing: 12) {
                networkCard
                diskCard
                cpuCard
                gpuCard
                tempCard
            }
            .padding(12)
            .frame(width: popoverWidth)
        }
        .frame(width: popoverWidth, height: scrollHeight, alignment: .top)
    }

    private var networkCard: some View {
        MetricCard(
            title: "Network",
            icon: "network",
            summary: [
                SummaryItem(label: "Download", value: "\(ByteFormatter.formatMbps(bytesPerSecond: appState.downloadRate)) Mbps", tint: .blue),
                SummaryItem(label: "Upload", value: "\(ByteFormatter.formatMbps(bytesPerSecond: appState.uploadRate)) Mbps", tint: .green)
            ],
            sparklines: [
                SparklineSpec(values: appState.networkDownHistory, color: .blue, label: "Download"),
                SparklineSpec(values: appState.networkUpHistory, color: .green, label: "Upload")
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
                    tint: .red.opacity(0.8)
                ),
                SummaryItem(
                    label: "System",
                    value: appState.cpuUsage.isValid ? PercentFormatter.format(appState.cpuUsage.system) : "—",
                    tint: .red.opacity(0.6)
                )
            ],
            sparklines: [
                SparklineSpec(values: appState.cpuHistory, color: .red, label: "Usage")
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

    private var gpuCard: some View {
        let gpu = appState.gpuSnapshot

        return MetricCard(
            title: "GPU",
            icon: "display",
            subtitle: gpu.isAvailable ? gpu.name : nil,
            summary: gpuSummaryItems(for: gpu),
            sparklines: gpu.isAvailable ? [
                SparklineSpec(values: appState.gpuHistory, color: .indigo, label: "Utilization")
            ] : [],
            columns: [
                MetricColumn(title: "Process", width: .flexible, alignment: .leading),
                MetricColumn(title: "GPU", width: .fixed(52), alignment: .trailing),
                MetricColumn(title: "Memory", width: .fixed(64), alignment: .trailing)
            ],
            rows: appState.gpuProcesses.map { process in
                [
                    process.name,
                    PercentFormatter.formatDetailed(process.usage),
                    ByteFormatter.formatBytes(process.memoryBytes)
                ]
            },
            emptyMessage: gpu.isAvailable ? "No active GPU clients" : "GPU metrics unavailable on this system"
        )
    }

    private var tempCard: some View {
        let t = appState.tempSnapshot
        let f = appState.fanSnapshot

        let summary: [SummaryItem] = [
            SummaryItem(
                label: "CPU",
                value: t.cpuTemperature.map { "\(Int(round($0)))°C" } ?? "—",
                tint: .orange
            ),
            SummaryItem(
                label: "GPU",
                value: t.gpuTemperature.map { "\(Int(round($0)))°C" } ?? "—",
                tint: .orange.opacity(0.75)
            )
        ]

        let hasCPU = t.cpuTemperature != nil
        let hasGPU = t.gpuTemperature != nil
        let sparklines: [SparklineSpec] = [
            hasCPU ? SparklineSpec(values: appState.cpuTempHistory, color: .orange, label: "CPU °C") : nil,
            hasGPU ? SparklineSpec(values: appState.gpuTempHistory, color: .orange.opacity(0.7), label: "GPU °C") : nil
        ].compactMap { $0 }

        let fanContent: AnyView? = f.isAvailable ? AnyView(
            HStack(spacing: 14) {
                ForEach(f.fans) { fan in
                    FanAnimation(fan: fan)
                }
            }
            .frame(maxWidth: .infinity, alignment: .center)
        ) : nil

        let empty = !t.isAvailable && !f.isAvailable
        return MetricCard(
            title: "Thermal",
            icon: "thermometer",
            summary: summary,
            sparklines: sparklines,
            columns: [],
            rows: [],
            emptyMessage: empty ? "Thermal sensors unavailable" : nil,
            afterSparklines: fanContent
        )
    }

    private func gpuSummaryItems(for gpu: GPUSnapshot) -> [SummaryItem] {
        guard gpu.isAvailable else {
            return [
                SummaryItem(label: "Status", value: "Unavailable", tint: .secondary)
            ]
        }

        var items = [
            SummaryItem(
                label: "Utilization",
                value: gpu.utilization.map { PercentFormatter.format($0) } ?? "—",
                tint: .indigo
            ),
            SummaryItem(
                label: gpu.memoryLabel,
                value: gpu.memoryUsedBytes.map { ByteFormatter.formatBytes($0) } ?? "—",
                tint: .teal
            )
        ]

        if let renderer = gpu.rendererUtilization, let tiler = gpu.tilerUtilization {
            items.append(
                SummaryItem(
                    label: "Render/Tiler",
                    value: "\(PercentFormatter.format(renderer)) / \(PercentFormatter.format(tiler))",
                    tint: .cyan
                )
            )
        }

        return items
    }

    private var diskCard: some View {
        MetricCard(
            title: "Disk",
            icon: "internaldrive",
            summary: [
                SummaryItem(label: "Read", value: ByteFormatter.formatRate(bytesPerSecond: appState.diskReadRate), tint: .orange),
                SummaryItem(label: "Write", value: ByteFormatter.formatRate(bytesPerSecond: appState.diskWriteRate), tint: .purple)
            ],
            sparklines: [
                SparklineSpec(values: appState.diskReadHistory, color: .orange, label: "Read"),
                SparklineSpec(values: appState.diskWriteHistory, color: .purple, label: "Write")
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
            if let error = appState.lastError {
                Text(error)
                    .font(.caption2)
                    .foregroundStyle(Color.red)
                    .lineLimit(1)
            }

            Spacer()

            Button("Logs") {
                if let url = try? FileManager.default.url(for: .libraryDirectory, in: .userDomainMask, appropriateFor: nil, create: false) {
                    let logURL = url.appendingPathComponent("Logs/Pulse/pulse.log")
                    NSWorkspace.shared.selectFile(logURL.path, inFileViewerRootedAtPath: "")
                }
            }
            .buttonStyle(.borderless)
            .font(.caption2)
            .help("Open Pulse log file")

            Button {
                NSApplication.shared.terminate(nil)
            } label: {
                Image(systemName: "power")
                    .imageScale(.small)
            }
            .buttonStyle(.borderless)
            .font(.caption2)
            .foregroundStyle(.secondary)
            .keyboardShortcut("q", modifiers: .command)
            .focusable(false)
            .help("Quit Pulse (⌘Q)")

            let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0.2.1"
            Text("v\(version)")
                .font(.caption2)
                .foregroundStyle(.tertiary)
                .monospacedDigit()
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
    }
}

// MARK: - Card components

private struct SparklineSpec {
    let values: [Double]
    let color: Color
    let label: String
}

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
    let subtitle: String?
    let summary: [SummaryItem]
    let sparklines: [SparklineSpec]
    let columns: [MetricColumn]
    let rows: [[String]]
    let emptyMessage: String?
    let afterSparklines: AnyView?

    init(
        title: String,
        icon: String,
        subtitle: String? = nil,
        summary: [SummaryItem],
        sparklines: [SparklineSpec] = [],
        columns: [MetricColumn],
        rows: [[String]],
        emptyMessage: String? = nil,
        afterSparklines: AnyView? = nil
    ) {
        self.title = title
        self.icon = icon
        self.subtitle = subtitle
        self.summary = summary
        self.sparklines = sparklines
        self.columns = columns
        self.rows = rows
        self.emptyMessage = emptyMessage
        self.afterSparklines = afterSparklines
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                RoundedRectangle(cornerRadius: 2)
                    .fill(accentColor)
                    .frame(width: 3, height: 28)

                VStack(alignment: .leading, spacing: 2) {
                    Label(title, systemImage: icon)
                        .font(.subheadline.weight(.semibold))
                    if let subtitle {
                        Text(subtitle)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }
            }

            if !summary.isEmpty {
                HStack(spacing: 8) {
                    ForEach(Array(summary.enumerated()), id: \.offset) { _, item in
                        summaryTile(item)
                    }
                }
            }

            if !sparklines.isEmpty {
                VStack(spacing: 6) {
                    ForEach(Array(sparklines.enumerated()), id: \.offset) { _, spec in
                        SparklineView(values: spec.values, color: spec.color, label: spec.label)
                    }
                }
            }

            if let content = afterSparklines {
                content
                    .frame(maxWidth: .infinity)
                    .padding(.top, 2)
            }

            if columns.isEmpty {
                if let emptyMessage {
                    Text(emptyMessage)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.vertical, 4)
                }
            } else if rows.isEmpty {
                Text(emptyMessage ?? "No activity")
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
        .background(Color(nsColor: .controlBackgroundColor).opacity(0.55))
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .strokeBorder(Color.primary.opacity(0.06), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    private var accentColor: Color {
        summary.first?.tint ?? .accentColor
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
        .background(Color.primary.opacity(0.055))
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