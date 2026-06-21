import SwiftUI

struct PopoverView: View {
    @EnvironmentObject private var appState: AppState

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            header
            networkSection
            Divider()
            diskSection
            footer
        }
        .padding(14)
        .frame(width: 320)
    }

    private var header: some View {
        HStack {
            Label("Sysmon", systemImage: "gauge.with.dots.needle.67percent")
                .font(.headline)
            Spacer()
            if appState.isLoading {
                ProgressView()
                    .controlSize(.small)
            }
        }
    }

    private var networkSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionTitle("Network", systemImage: "network")

            HStack(spacing: 16) {
                rateLabel(title: "Download", value: appState.downloadRate, color: .blue)
                rateLabel(title: "Upload", value: appState.uploadRate, color: .green)
            }

            processList(
                emptyMessage: "No active network processes",
                rows: appState.networkProcesses.map { process in
                    ProcessRow(
                        name: process.name,
                        primary: process.downloadRate,
                        secondary: process.uploadRate,
                        primaryLabel: "↓",
                        secondaryLabel: "↑"
                    )
                }
            )
        }
    }

    private var diskSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionTitle("Disk", systemImage: "internaldrive")

            HStack(spacing: 16) {
                rateLabel(title: "Read", value: appState.diskReadRate, color: .orange)
                rateLabel(title: "Write", value: appState.diskWriteRate, color: .purple)
            }

            processList(
                emptyMessage: "No active disk processes",
                rows: appState.diskProcesses.map { process in
                    ProcessRow(
                        name: process.name,
                        primary: process.readRate,
                        secondary: process.writeRate,
                        primaryLabel: "R",
                        secondaryLabel: "W"
                    )
                }
            )
        }
    }

    private var footer: some View {
        HStack {
            if let error = appState.lastError {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.red)
                    .lineLimit(1)
            } else {
                Text("Updates every second")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Button("Quit") {
                NSApplication.shared.terminate(nil)
            }
            .buttonStyle(.borderless)
            .font(.caption)
        }
    }

    private func sectionTitle(_ title: String, systemImage: String) -> some View {
        Label(title, systemImage: systemImage)
            .font(.subheadline.weight(.semibold))
    }

    private func rateLabel(title: String, value: UInt64, color: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.caption)
                .foregroundStyle(.secondary)
            Text(ByteFormatter.formatRate(bytesPerSecond: value))
                .font(.system(.body, design: .monospaced))
                .foregroundStyle(color)
        }
    }

    @ViewBuilder
    private func processList(emptyMessage: String, rows: [ProcessRow]) -> some View {
        if rows.isEmpty {
            Text(emptyMessage)
                .font(.caption)
                .foregroundStyle(.secondary)
        } else {
            VStack(alignment: .leading, spacing: 4) {
                ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                    row
                }
            }
        }
    }
}

private struct ProcessRow: View {
    let name: String
    let primary: UInt64
    let secondary: UInt64
    let primaryLabel: String
    let secondaryLabel: String

    var body: some View {
        HStack {
            Text(name)
                .font(.caption)
                .lineLimit(1)
            Spacer()
            Text("\(primaryLabel)\(ByteFormatter.shortRate(bytesPerSecond: primary))")
                .font(.caption.monospaced())
                .foregroundStyle(.secondary)
            Text("\(secondaryLabel)\(ByteFormatter.shortRate(bytesPerSecond: secondary))")
                .font(.caption.monospaced())
                .foregroundStyle(.secondary)
        }
    }
}