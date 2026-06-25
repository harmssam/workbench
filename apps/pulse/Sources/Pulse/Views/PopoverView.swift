import AppKit
import SwiftUI

enum PopoverLayout {
    static let width: CGFloat = 340
    static let scrollHeight: CGFloat = 490
}

struct PopoverView: View {
    @ObservedObject var appState: AppState
    @State private var draggingCard: MetricCardKind?
    @State private var isQuitHovered = false
    @State private var isSettingsHovered = false
    @State private var showSettings = false

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider()
            cardScroller
            Divider()
            footer
        }
        .frame(width: PopoverLayout.width)
        .fixedSize(horizontal: false, vertical: true)
        .background(Color(nsColor: .windowBackgroundColor))
        .sheet(isPresented: $showSettings) {
            SettingsView(appState: appState)
        }
    }

    private var updateStatusLabel: String {
        if let status = appState.updateStatus {
            if appState.updateProgress > 0, status.hasPrefix("Downloading") {
                let percent = SafeNumeric.roundedInt(appState.updateProgress * 100)
                return "Downloading \(percent)%"
            }
            return status
        }
        return "Updating..."
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack {
                Text("Pulse")
                    .font(.headline)
                Spacer()

                if appState.updateFailed, appState.availableUpdate != nil {
                    Button {
                        appState.retryUpdate()
                    } label: {
                        Label("Retry update", systemImage: "arrow.clockwise.circle.fill")
                            .font(.caption.weight(.medium))
                            .foregroundStyle(.orange)
                    }
                    .buttonStyle(.borderless)
                    .help(appState.updateStatus ?? "Update failed — tap to retry")
                } else if !appState.autoUpdateEnabled, let update = appState.availableUpdate {
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
                        if appState.updateProgress > 0 {
                            ProgressView(value: appState.updateProgress)
                                .frame(width: 60)
                        } else {
                            ProgressView()
                                .controlSize(.small)
                                .frame(width: 16)
                        }
                        Text(updateStatusLabel)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }

                quitButton
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
            Group {
                if appState.isPopoverShown {
                    LazyVStack(spacing: 12) {
                        ForEach(appState.metricCardOrder) { kind in
                            reorderableSection(for: kind)
                        }
                    }
                }
            }
            .padding(12)
            .frame(width: PopoverLayout.width)
        }
        .frame(width: PopoverLayout.width, height: PopoverLayout.scrollHeight, alignment: .top)
        .background(AlwaysVisibleScrollBar())
    }

    private func reorderableSection(for kind: MetricCardKind) -> some View {
        let grabber = CardGrabber(kind: kind, dragging: $draggingCard)
        return cardContent(for: kind, grabber: AnyView(grabber))
            .opacity(draggingCard == kind ? 0.55 : 1)
            .onDrop(
                of: [.plainText],
                delegate: MetricCardReorderDelegate(
                    card: kind,
                    order: $appState.metricCardOrder,
                    dragging: $draggingCard
                )
            )
    }

    @ViewBuilder
    private func cardContent(for kind: MetricCardKind, grabber: AnyView) -> some View {
        switch kind {
        case .network: networkCard(grabber: grabber)
        case .disk: diskCard(grabber: grabber)
        case .cpu: cpuCard(grabber: grabber)
        case .gpu: gpuCard(grabber: grabber)
        case .memory: memoryCard(grabber: grabber)
        case .thermal: tempCard(grabber: grabber)
        }
    }

    private func networkCard(grabber: AnyView) -> some View {
        MetricCard(
            title: "Network",
            icon: "network",
            trailingHeader: grabber,
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

    private func cpuCard(grabber: AnyView) -> some View {
        MetricCard(
            title: "CPU",
            icon: "cpu",
            trailingHeader: grabber,
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

    private func gpuCard(grabber: AnyView) -> some View {
        let gpu = appState.gpuSnapshot

        return MetricCard(
            title: "GPU",
            icon: "display",
            subtitle: gpu.isAvailable ? gpu.name : nil,
            trailingHeader: grabber,
            summary: gpuSummaryItems(for: gpu),
            sparklines: gpu.isAvailable ? [
                SparklineSpec(values: appState.gpuHistory, color: .indigo, label: "Utilization")
            ] : [],
            columns: [
                MetricColumn(title: "Process", width: .flexible, alignment: .leading),
                MetricColumn(title: "Memory", width: .fixed(64), alignment: .trailing)
            ],
            rows: appState.gpuProcesses.map { process in
                [
                    process.name,
                    ByteFormatter.formatBytes(process.memoryBytes)
                ]
            },
            emptyMessage: gpu.isAvailable ? "No active GPU clients" : "GPU metrics unavailable on this system"
        )
    }

    private func memoryCard(grabber: AnyView) -> some View {
        let mem = appState.memorySnapshot
        guard mem.isValid else {
            return AnyView(
                MetricCard(
                    title: "Memory",
                    icon: "memorychip",
                    trailingHeader: grabber,
                    summary: [SummaryItem(label: "Status", value: "Unavailable", tint: .secondary)],
                    sparklines: [],
                    columns: [],
                    rows: [],
                    emptyMessage: "Memory stats unavailable"
                )
            )
        }

        let usedStr = ByteFormatter.formatBytes(mem.used)
        let freeStr = ByteFormatter.formatBytes(mem.free)

        // Compact total for title, e.g. "32GB" or "16.5GB"
        let gib = mem.total / (1024 * 1024 * 1024)
        let rem = mem.total % (1024 * 1024 * 1024)
        let totalDisplay: String
        if rem == 0 {
            totalDisplay = "\(gib)GB"
        } else {
            let totalGB = Double(mem.total) / (1024 * 1024 * 1024)
            totalDisplay = String(format: "%.1fGB", totalGB)
        }

        let topMemory = Array(appState.memoryProcesses.prefix(5))

        let card = MetricCard(
            title: "Memory (\(totalDisplay))",
            icon: "memorychip",
            trailingHeader: grabber,
            summary: [
                SummaryItem(label: "Used", value: usedStr, tint: .purple),
                SummaryItem(label: "Free", value: freeStr, tint: .purple),
                SummaryItem(label: "Wired", value: ByteFormatter.formatBytes(mem.wired), tint: .purple),
                SummaryItem(label: "Compr.", value: ByteFormatter.formatBytes(mem.compressed), tint: .purple)
            ],
            sparklines: [
                SparklineSpec(values: appState.memoryUsedHistory, color: .purple, label: "Used")
            ],
            columns: [
                MetricColumn(title: "Process", width: .flexible, alignment: .leading),
                MetricColumn(title: "Memory", width: .fixed(64), alignment: .trailing)
            ],
            rows: topMemory.map { proc in
                [proc.name, ByteFormatter.formatBytes(proc.memoryBytes)]
            },
            emptyMessage: "No significant memory users"
        )

        return AnyView(
            VStack(spacing: 8) {
                card

                Toggle("Aggressive", isOn: $appState.aggressivePurge)
                    .toggleStyle(.checkbox)
                    .font(.caption2)
                    .help("Simulates critical memory pressure + extra purges. Frees significantly more RAM for large LLMs. Use with care.")

                Button {
                    Task { await appState.purgeMemory() }
                } label: {
                    Label(appState.aggressivePurge ? "Free Memory (Aggressive)" : "Free Memory", systemImage: "trash")
                        .font(.caption.weight(.semibold))
                }
                .buttonStyle(.borderedProminent)
                .tint(.purple)
                .controlSize(.small)
                .help(appState.aggressivePurge ? "Aggressive purge: forces kernel to release max possible memory" : "Purge inactive memory (helps free RAM for LLMs)")
            }
        )
    }

    private func tempCard(grabber: AnyView) -> some View {
        let t = appState.tempSnapshot
        let f = appState.fanSnapshot

        let summary: [SummaryItem] = [
            SummaryItem(
                label: "CPU",
                value: t.cpuTemperature.map { "\(SafeNumeric.roundedInt($0))°C" } ?? "—",
                tint: .orange
            ),
            SummaryItem(
                label: "GPU",
                value: t.gpuTemperature.map { "\(SafeNumeric.roundedInt($0))°C" } ?? "—",
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
                    FanAnimation(fan: fan, isActive: appState.isPopoverShown)
                }
            }
            .frame(maxWidth: .infinity, alignment: .center)
        ) : nil

        let empty = !t.isAvailable && !f.isAvailable
        return MetricCard(
            title: "Thermal",
            icon: "thermometer",
            trailingHeader: grabber,
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

    private func diskCard(grabber: AnyView) -> some View {
        MetricCard(
            title: "Disk",
            icon: "internaldrive",
            trailingHeader: grabber,
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
            settingsButton

            if let error = appState.lastError {
                Text(error)
                    .font(.caption2)
                    .foregroundStyle(Color.red)
                    .lineLimit(1)
            }

            Spacer()

            Button("Logs") {
                NSWorkspace.shared.selectFile(AppLogger.logFileURL.path, inFileViewerRootedAtPath: "")
            }
            .buttonStyle(.borderless)
            .font(.caption2)
            .help("Open Pulse log file")

            Button {
                appState.checkForUpdatesIfStale(force: true)
            } label: {
                Text("v\(AppState.currentAppVersion)")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
                    .monospacedDigit()
            }
            .buttonStyle(.borderless)
            .help("Check for updates")
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
    }

    private var settingsButton: some View {
        Button {
            showSettings = true
        } label: {
            Image(systemName: "gearshape")
                .imageScale(.small)
                .foregroundStyle(isSettingsHovered ? Color.primary : Color.secondary)
                .padding(4)
                .background(
                    RoundedRectangle(cornerRadius: 4)
                        .fill(isSettingsHovered ? Color.primary.opacity(0.1) : Color.clear)
                )
        }
        .buttonStyle(.plain)
        .focusable(false)
        .onHover { isSettingsHovered = $0 }
        .help("Settings")
    }

    private var quitButton: some View {
        Button {
            NSApplication.shared.terminate(nil)
        } label: {
            Image(systemName: "power")
                .imageScale(.small)
                .foregroundStyle(isQuitHovered ? Color.red : Color.secondary)
                .padding(4)
                .background(
                    RoundedRectangle(cornerRadius: 4)
                        .fill(isQuitHovered ? Color.red.opacity(0.14) : Color.clear)
                )
        }
        .buttonStyle(.plain)
        .keyboardShortcut("q", modifiers: .command)
        .focusable(false)
        .onHover { isQuitHovered = $0 }
        .help("Quit Pulse (⌘Q)")
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
    let trailingHeader: AnyView?

    init(
        title: String,
        icon: String,
        subtitle: String? = nil,
        trailingHeader: AnyView? = nil,
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
        self.trailingHeader = trailingHeader
        self.summary = summary
        self.sparklines = sparklines
        self.columns = columns
        self.rows = rows
        self.emptyMessage = emptyMessage
        self.afterSparklines = afterSparklines
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .center, spacing: 8) {
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

                Spacer(minLength: 4)

                if let trailingHeader {
                    trailingHeader
                }
            }

            if !summary.isEmpty {
                HStack(spacing: 3) {
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
                .lineLimit(1)
            Text(item.value)
                .font(.system(.subheadline, design: .monospaced).weight(.medium))
                .foregroundStyle(item.tint)
                .lineLimit(1)
                .minimumScaleFactor(0.75)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(4)
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