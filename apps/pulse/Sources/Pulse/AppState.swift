import AppKit
import Foundation

@MainActor
final class AppState: ObservableObject {
    @Published var downloadRate: UInt64 = 0
    @Published var uploadRate: UInt64 = 0
    @Published var diskReadRate: UInt64 = 0
    @Published var diskWriteRate: UInt64 = 0
    @Published var cpuUsage = CPUUsageSample.invalid
    @Published var cpuProcesses: [CPUProcessActivity] = []
    @Published var gpuSnapshot = GPUSnapshot.unavailable
    @Published var gpuProcesses: [GPUProcessActivity] = []
    @Published var networkProcesses: [NetworkProcessActivity] = []
    @Published var diskProcesses: [ProcessActivity] = []
    @Published var tempSnapshot = TempSnapshot.unavailable
    @Published var fanSnapshot = FanSnapshot.unavailable
    @Published var lastError: String?

    @Published private(set) var networkDownHistory: [Double] = []
    @Published private(set) var networkUpHistory: [Double] = []
    @Published private(set) var diskReadHistory: [Double] = []
    @Published private(set) var diskWriteHistory: [Double] = []
    @Published private(set) var cpuHistory: [Double] = []
    @Published private(set) var gpuHistory: [Double] = []
    @Published private(set) var cpuTempHistory: [Double] = []
    @Published private(set) var gpuTempHistory: [Double] = []

    let networkMonitor = NetworkMonitor()
    let diskMonitor = DiskMonitor()
    let cpuMonitor = CPUMonitor()
    let gpuMonitor = GPUMonitor()
    let tempMonitor = TempMonitor()
    let fanMonitor = FanMonitor()

    private let updateManager = UpdateManager(
        currentVersion: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0.0.0"
    )
    @Published var availableUpdate: AppUpdate?
    @Published var isDownloadingUpdate = false
    @Published var updateProgress: Double = 0
    @Published var updateStatus: String?

    @Published var autoUpdateEnabled: Bool = UserDefaults.standard.bool(forKey: "autoUpdateEnabled") {
        didSet {
            UserDefaults.standard.set(autoUpdateEnabled, forKey: "autoUpdateEnabled")
            if autoUpdateEnabled, availableUpdate != nil, !isDownloadingUpdate {
                startUpdate()
            }
        }
    }

    private var refreshTask: Task<Void, Never>?
    private var updateCheckTask: Task<Void, Never>?
    private var downHistory = HistoryBuffer()
    private var upHistory = HistoryBuffer()
    private var diskReadHistoryBuffer = HistoryBuffer()
    private var diskWriteHistoryBuffer = HistoryBuffer()
    private var cpuHistoryBuffer = HistoryBuffer()
    private var gpuHistoryBuffer = HistoryBuffer()
    private var cpuTempHistoryBuffer = HistoryBuffer()
    private var gpuTempHistoryBuffer = HistoryBuffer()

    let refreshInterval: TimeInterval = 1.0

    var headerSubtitle: String {
        let down = ByteFormatter.formatMenuBarMbps(bytesPerSecond: downloadRate)
        let up = ByteFormatter.formatMenuBarMbps(bytesPerSecond: uploadRate)
        let cpu = cpuUsage.isValid ? PercentFormatter.format(cpuUsage.total) : "—"
        var base = "↓\(down) ↑\(up) Mbps · CPU \(cpu)"
        if let t = tempSnapshot.cpuTemperature {
            base += " · \(Int(round(t)))°C"
        }
        return base
    }

    init() {
        startMonitoring()
        checkForUpdates()
    }

    deinit {
        refreshTask?.cancel()
        updateCheckTask?.cancel()
    }

    func refresh() async {
        lastError = nil

        async let networkRates = networkMonitor.sampleRates()
        async let diskRates = diskMonitor.sampleRates()
        async let networkProcesses = networkMonitor.sampleProcesses()
        async let diskProcesses = diskMonitor.sampleProcesses()
        async let cpuProcesses = cpuMonitor.sampleProcesses()
        async let gpuProcesses = gpuMonitor.sampleProcesses()

        let rates = await networkRates
        let disk = await diskRates
        downloadRate = rates.bytesIn
        uploadRate = rates.bytesOut
        diskReadRate = disk.read
        diskWriteRate = disk.write
        cpuUsage = await cpuMonitor.sampleUsage()
        gpuSnapshot = await gpuMonitor.sample()
        tempSnapshot = await tempMonitor.sample()
        fanSnapshot = await fanMonitor.sample()
        self.networkProcesses = await networkProcesses
        self.diskProcesses = await diskProcesses
        self.cpuProcesses = await cpuProcesses
        self.gpuProcesses = await gpuProcesses
        updateHistories()
    }

    private func updateHistories() {
        downHistory.append(ByteFormatter.megabitsPerSecond(from: downloadRate))
        upHistory.append(ByteFormatter.megabitsPerSecond(from: uploadRate))
        diskReadHistoryBuffer.append(Double(diskReadRate))
        diskWriteHistoryBuffer.append(Double(diskWriteRate))

        if cpuUsage.isValid {
            cpuHistoryBuffer.append(cpuUsage.total)
        }

        if let utilization = gpuSnapshot.utilization {
            gpuHistoryBuffer.append(utilization)
        }

        if let cpuT = tempSnapshot.cpuTemperature {
            cpuTempHistoryBuffer.append(cpuT)
        }
        if let gpuT = tempSnapshot.gpuTemperature {
            gpuTempHistoryBuffer.append(gpuT)
        }

        networkDownHistory = downHistory.values
        networkUpHistory = upHistory.values
        diskReadHistory = diskReadHistoryBuffer.values
        diskWriteHistory = diskWriteHistoryBuffer.values
        cpuHistory = cpuHistoryBuffer.values
        gpuHistory = gpuHistoryBuffer.values
        cpuTempHistory = cpuTempHistoryBuffer.values
        gpuTempHistory = gpuTempHistoryBuffer.values
    }

    private func startMonitoring() {
        refreshTask = Task { [weak self] in
            while !Task.isCancelled {
                await self?.refresh()
                try? await Task.sleep(for: .seconds(self?.refreshInterval ?? 1))
            }
        }

        updateCheckTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(4 * 3600))
                self?.checkForUpdates()
            }
        }
    }

    func checkForUpdates() {
        Task {
            if let update = await updateManager.checkForUpdate() {
                await MainActor.run {
                    self.availableUpdate = update
                    if self.autoUpdateEnabled {
                        self.startUpdate()
                    }
                }
            }
        }
    }

    func startUpdate() {
        guard let update = availableUpdate, !isDownloadingUpdate else { return }

        isDownloadingUpdate = true
        updateStatus = "Downloading v\(update.version)..."
        updateProgress = 0

        Task {
            do {
                let tempDir = FileManager.default.temporaryDirectory.appendingPathComponent("PulseUpdate-\(UUID().uuidString)")
                try FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)

                let zipURL = tempDir.appendingPathComponent("Pulse.zip")

                // Download with progress
                let (bytes, response) = try await URLSession.shared.bytes(from: update.downloadURL)
                var received: Int64 = 0
                var data = Data()

                if let httpResponse = response as? HTTPURLResponse,
                   let contentLength = httpResponse.value(forHTTPHeaderField: "Content-Length"),
                   let total = Int64(contentLength) {
                    for try await byte in bytes {
                        data.append(byte)
                        received += 1
                        let progress = Double(received) / Double(total)
                        await MainActor.run {
                            self.updateProgress = progress
                        }
                    }
                } else {
                    for try await byte in bytes {
                        data.append(byte)
                    }
                }

                try data.write(to: zipURL)

                await MainActor.run {
                    self.updateStatus = "Extracting..."
                }

                // Unzip
                let unzip = Process()
                unzip.executableURL = URL(fileURLWithPath: "/usr/bin/unzip")
                unzip.arguments = ["-o", zipURL.path, "-d", tempDir.path]
                try unzip.run()
                unzip.waitUntilExit()

                let newAppURL = tempDir.appendingPathComponent("Pulse.app")
                guard FileManager.default.fileExists(atPath: newAppURL.path) else {
                    throw NSError(domain: "Update", code: 1, userInfo: [NSLocalizedDescriptionKey: "Extracted app not found"])
                }

                await MainActor.run {
                    self.updateStatus = "Ready to install"
                    self.isDownloadingUpdate = false
                    self.availableUpdate = nil
                    self.performUpdateInstall(newAppURL: newAppURL)
                }
            } catch {
                await MainActor.run {
                    self.updateStatus = "Update failed: \(error.localizedDescription)"
                    self.isDownloadingUpdate = false
                }
            }
        }
    }

    private func performUpdateInstall(newAppURL: URL) {
        let currentAppURL = Bundle.main.bundleURL

        // Build a detached script to replace after we quit
        let script = """
        (sleep 1.5; \
        rm -rf "\(currentAppURL.path)"; \
        mv "\(newAppURL.path)" "\(currentAppURL.path)"; \
        open "\(currentAppURL.path)"
        ) &
        """

        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/bin/bash")
        task.arguments = ["-c", script]
        try? task.run()

        // Quit this instance
        NSApp.terminate(nil)
    }
}