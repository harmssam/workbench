import AppKit
import SwiftUI

struct SettingsView: View {
    @ObservedObject var appState: AppState
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider()
            Form {
                generalSection
                loggingSection
                aboutSection
            }
            .formStyle(.grouped)
            .scrollContentBackground(.hidden)
        }
        .frame(width: 320)
        .background(Color(nsColor: .windowBackgroundColor))
    }

    private var header: some View {
        HStack {
            Text("Settings")
                .font(.headline)
            Spacer()
            Button {
                dismiss()
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .foregroundStyle(.secondary)
            }
            .buttonStyle(.borderless)
            .help("Close settings")
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    private var generalSection: some View {
        Section("General") {
            Toggle("Launch at login", isOn: $appState.launchAtLogin)
                .help("Start Pulse automatically when you sign in")

            Toggle("Auto-update", isOn: $appState.autoUpdateEnabled)
                .help("Download and install updates automatically when available")

            Toggle("Aggressive memory purge", isOn: $appState.aggressivePurge)
                .help("Use stronger memory pressure when freeing RAM")
        }
    }

    private var loggingSection: some View {
        Section("Logging") {
            Picker("Log level", selection: $appState.logLevel) {
                ForEach(LogLevel.allCases, id: \.self) { level in
                    Text(level.label).tag(level)
                }
            }
            .pickerStyle(.menu)

            Text(appState.logLevel.detail)
                .font(.caption)
                .foregroundStyle(.secondary)

            Button("Open log file") {
                NSWorkspace.shared.selectFile(AppLogger.logFileURL.path, inFileViewerRootedAtPath: "")
            }
        }
    }

    private var aboutSection: some View {
        Section("About") {
            LabeledContent("Version", value: AppState.currentAppVersion)

            Button("Check for updates") {
                appState.checkForUpdatesIfStale(force: true)
            }

            if let update = appState.availableUpdate {
                LabeledContent("Available") {
                    Text("v\(update.version)")
                        .foregroundStyle(.blue)
                }
            }
        }
    }
}