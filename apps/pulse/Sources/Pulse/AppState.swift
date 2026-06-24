import AppKit
import Foundation
import OSLog

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
    @Published var memorySnapshot = MemorySnapshot.unavailable
    @Published var memoryProcesses: [MemoryProcessActivity] = []
    @Published var lastError: String?

    @Published private(set) var networkDownHistory: [Double] = []
    @Published private(set) var networkUpHistory: [Double] = []
    @Published private(set) var diskReadHistory: [Double] = []
    @Published private(set) var diskWriteHistory: [Double] = []
    @Published private(set) var cpuHistory: [Double] = []
    @Published private(set) var gpuHistory: [Double] = []
    @Published private(set) var cpuTempHistory: [Double] = []
    @Published private(set) var gpuTempHistory: [Double] = []
    @Published private(set) var memoryUsedHistory: [Double] = []

    let networkMonitor = NetworkMonitor()
    let diskMonitor = DiskMonitor()
    let cpuMonitor = CPUMonitor()
    let gpuMonitor = GPUMonitor()
    let tempMonitor = TempMonitor()
    let fanMonitor = FanMonitor()
    let memoryMonitor = MemoryMonitor()

    private lazy var updateManager = UpdateManager(
        currentVersion: Self.currentAppVersion
    )

    static var currentAppVersion: String {
        if let v = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String,
           !v.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return v.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        // Fallback for debug runs of the raw executable (bundle plist may not be loaded)
        if let plistURL = Bundle.main.url(forResource: "Info", withExtension: "plist"),
           let data = try? Data(contentsOf: plistURL),
           let dict = try? PropertyListSerialization.propertyList(from: data, options: [], format: nil) as? [String: Any],
           let v = dict["CFBundleShortVersionString"] as? String,
           !v.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return v.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        return "0.2.8"
    }
    @Published var availableUpdate: AppUpdate?
    @Published var isDownloadingUpdate = false
    @Published var updateProgress: Double = 0
    @Published var updateStatus: String?
    @Published var updateFailed = false

    private var updateTask: Task<Void, Never>?
    private var lastUpdateCheck: Date?
    private let updateCheckInterval: TimeInterval = 3600
    private let updateCheckThrottle: TimeInterval = 15 * 60

    @Published var autoUpdateEnabled: Bool = UserDefaults.standard.bool(forKey: "autoUpdateEnabled") {
        didSet {
            UserDefaults.standard.set(autoUpdateEnabled, forKey: "autoUpdateEnabled")
            if autoUpdateEnabled, availableUpdate != nil, !isDownloadingUpdate {
                startUpdate()
            }
        }
    }

    @Published var aggressivePurge: Bool = UserDefaults.standard.bool(forKey: "aggressivePurge") {
        didSet {
            UserDefaults.standard.set(aggressivePurge, forKey: "aggressivePurge")
        }
    }

    @Published var metricCardOrder: [MetricCardKind] = MetricCardKind.loadSavedOrder() {
        didSet {
            MetricCardKind.saveOrder(metricCardOrder)
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
    private var memoryUsedHistoryBuffer = HistoryBuffer()

    let refreshInterval: TimeInterval = 1.0

    var headerSubtitle: String {
        let down = ByteFormatter.formatMenuBarMbps(bytesPerSecond: downloadRate)
        let up = ByteFormatter.formatMenuBarMbps(bytesPerSecond: uploadRate)
        let cpu = cpuUsage.isValid ? PercentFormatter.format(cpuUsage.total) : "—"
        var base = "↓\(down) ↑\(up) Mbps · CPU \(cpu)"
        if let t = tempSnapshot.cpuTemperature {
            base += " · \(Int(round(t)))°C"
        }
        if memorySnapshot.isValid {
            base += " · Free \(ByteFormatter.formatBytes(memorySnapshot.free))"
        }
        return base
    }

    init() {
        checkForUpdates()
        // start() / startMonitoring() called from AppDelegate right after creation
    }

    func start() {
        startMonitoring()
    }

    deinit {
        refreshTask?.cancel()
        updateCheckTask?.cancel()
        updateTask?.cancel()
    }

    func refresh() async {
        lastError = nil
        CrashReporter.breadcrumb("AppState.refresh start")

        async let networkRates = networkMonitor.sampleRates()
        async let diskRates = diskMonitor.sampleRates()
        async let networkProcesses = networkMonitor.sampleProcesses()
        async let diskProcesses = diskMonitor.sampleProcesses()
        async let cpuProcesses = cpuMonitor.sampleProcesses()
        async let gpuProcesses = gpuMonitor.sampleProcesses()
        async let memorySnapshot = memoryMonitor.sample()
        async let memoryProcesses = memoryMonitor.sampleTopMemoryProcesses()

        let rates = await networkRates
        let disk = await diskRates
        downloadRate = rates.bytesIn
        uploadRate = rates.bytesOut
        diskReadRate = disk.read
        diskWriteRate = disk.write
        cpuUsage = await cpuMonitor.sampleUsage()
        gpuSnapshot = await gpuMonitor.sample()
        CrashReporter.breadcrumb("AppState.refresh: tempMonitor")
        tempSnapshot = await tempMonitor.sample()
        CrashReporter.breadcrumb("AppState.refresh: fanMonitor")
        fanSnapshot = await fanMonitor.sample()
        CrashReporter.breadcrumb("AppState.refresh: fanMonitor done")
        self.networkProcesses = await networkProcesses
        self.diskProcesses = await diskProcesses
        self.cpuProcesses = await cpuProcesses
        self.gpuProcesses = await gpuProcesses
        self.memorySnapshot = await memorySnapshot
        self.memoryProcesses = await memoryProcesses
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

        if memorySnapshot.isValid {
            memoryUsedHistoryBuffer.append(Double(memorySnapshot.used))
        }

        networkDownHistory = downHistory.values
        networkUpHistory = upHistory.values
        diskReadHistory = diskReadHistoryBuffer.values
        diskWriteHistory = diskWriteHistoryBuffer.values
        cpuHistory = cpuHistoryBuffer.values
        gpuHistory = gpuHistoryBuffer.values
        cpuTempHistory = cpuTempHistoryBuffer.values
        gpuTempHistory = gpuTempHistoryBuffer.values
        memoryUsedHistory = memoryUsedHistoryBuffer.values
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
                try? await Task.sleep(for: .seconds(self?.updateCheckInterval ?? 3600))
                self?.checkForUpdates()
            }
        }
    }

    func checkForUpdatesIfStale(force: Bool = false) {
        if !force,
           let lastUpdateCheck,
           Date().timeIntervalSince(lastUpdateCheck) < updateCheckThrottle {
            return
        }
        checkForUpdates()
    }

    func checkForUpdates() {
        lastUpdateCheck = Date()
        AppLogger.info("Checking for updates...", category: AppLogger.update)
        Task {
            if let update = await updateManager.checkForUpdate() {
                AppLogger.info("New version found: \(update.version)", category: AppLogger.update)
                await MainActor.run {
                    self.availableUpdate = update
                    if self.autoUpdateEnabled {
                        AppLogger.info("Auto-update is enabled — starting update automatically", category: AppLogger.update)
                        self.startUpdate()
                    } else {
                        AppLogger.info("Auto-update is disabled — showing manual update button", category: AppLogger.update)
                    }
                }
            } else {
                AppLogger.info("No update available", category: AppLogger.update)
                await MainActor.run {
                    self.availableUpdate = nil
                }
            }
        }
    }

    func startUpdate() {
        guard let update = availableUpdate, !isDownloadingUpdate else { return }

        updateTask?.cancel()
        AppLogger.info("Starting update to v\(update.version)", category: AppLogger.update)
        isDownloadingUpdate = true
        updateFailed = false
        updateStatus = "Downloading v\(update.version)..."
        updateProgress = 0

        updateTask = Task {
            do {
                let tempDir = FileManager.default.temporaryDirectory.appendingPathComponent("PulseUpdate-\(UUID().uuidString)")
                AppLogger.info("Using temp dir: \(tempDir.path)", category: AppLogger.update)
                try FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)

                let zipURL = tempDir.appendingPathComponent("Pulse.zip")

                AppLogger.info("Downloading from \(update.downloadURL)", category: AppLogger.update)
                try await UpdateDownloader.download(from: update.downloadURL, to: zipURL) { progress in
                    await MainActor.run {
                        if let progress {
                            self.updateProgress = progress
                        }
                    }
                }

                await MainActor.run {
                    self.updateStatus = "Extracting..."
                    self.updateProgress = 0
                }

                let newAppURL = try await UpdateExtractor.extract(zipURL: zipURL, to: tempDir)
                AppLogger.info("Update package ready at \(newAppURL.path)", category: AppLogger.update)

                await MainActor.run {
                    self.updateStatus = "Installing..."
                    self.isDownloadingUpdate = false
                    self.availableUpdate = nil
                    self.performUpdateInstall(newAppURL: newAppURL)
                }
            } catch is CancellationError {
                AppLogger.info("Update cancelled", category: AppLogger.update)
                await MainActor.run {
                    self.isDownloadingUpdate = false
                    self.updateStatus = nil
                }
            } catch {
                AppLogger.error("Update failed: \(error)", category: AppLogger.update)
                await MainActor.run {
                    self.updateStatus = "Update failed"
                    self.updateFailed = true
                    self.isDownloadingUpdate = false
                }
            }
        }
    }

    func retryUpdate() {
        updateFailed = false
        updateStatus = nil
        startUpdate()
    }

    private func performUpdateInstall(newAppURL: URL) {
        let currentAppURL = Bundle.main.bundleURL
        AppLogger.info("Preparing to replace app at \(currentAppURL.path) with \(newAppURL.path)", category: AppLogger.update)

        // Safer approach: launch the new app first, then quit and let a background process clean up
        // This reduces the chance of the running bundle being deleted while still executing code.
        let script = """
        (sleep 1; \
        open -a "\(newAppURL.path)"; \
        sleep 2; \
        rm -rf "\(currentAppURL.path)"; \
        mv "\(newAppURL.path)" "\(currentAppURL.path)"
        ) &
        """

        AppLogger.info("Spawning cleanup script...", category: AppLogger.update)
        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/bin/bash")
        task.arguments = ["-c", script]
        try? task.run()

        AppLogger.info("Terminating current instance for update", category: AppLogger.update)
        // Quit this instance
        NSApp.terminate(nil)
    }

    func purgeMemory() async {
        let aggressive = aggressivePurge
        AppLogger.info("Purging inactive memory (aggressive: \(aggressive))...", category: AppLogger.monitor)
        let success = await memoryMonitor.purge(aggressive: aggressive)
        if success {
            // Refresh stats immediately
            memorySnapshot = await memoryMonitor.sample()
            AppLogger.info("Memory purged. Free: \(ByteFormatter.formatBytes(memorySnapshot.free))", category: AppLogger.monitor)
        } else {
            lastError = "Failed to free memory"
            AppLogger.error("Failed to purge memory", category: AppLogger.monitor)
        }
    }
}