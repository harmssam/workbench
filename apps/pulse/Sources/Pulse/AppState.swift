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

    private var refreshTask: Task<Void, Never>?
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
    }

    deinit {
        refreshTask?.cancel()
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
    }
}