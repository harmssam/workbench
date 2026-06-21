import Foundation

@MainActor
final class AppState: ObservableObject {
    @Published var downloadRate: UInt64 = 0
    @Published var uploadRate: UInt64 = 0
    @Published var diskReadRate: UInt64 = 0
    @Published var diskWriteRate: UInt64 = 0
    @Published var networkProcesses: [NetworkProcessActivity] = []
    @Published var diskProcesses: [ProcessActivity] = []
    @Published var isLoading = false
    @Published var lastError: String?

    let networkMonitor = NetworkMonitor()
    let diskMonitor = DiskMonitor()

    private var refreshTask: Task<Void, Never>?
    let refreshInterval: TimeInterval = 1.0

    init() {
        startMonitoring()
    }

    deinit {
        refreshTask?.cancel()
    }

    func refresh() async {
        isLoading = true
        lastError = nil

        async let networkRates = networkMonitor.sampleRates()
        async let diskRates = diskMonitor.sampleRates()
        async let networkProcesses = networkMonitor.sampleProcesses()
        async let diskProcesses = diskMonitor.sampleProcesses()

        let rates = await networkRates
        let disk = await diskRates
        downloadRate = rates.bytesIn
        uploadRate = rates.bytesOut
        diskReadRate = disk.read
        diskWriteRate = disk.write
        self.networkProcesses = await networkProcesses
        self.diskProcesses = await diskProcesses
        isLoading = false
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