import Testing
@testable import Pulse

/// Exercises the full monitor refresh pipeline the same way AppState does.
@Suite("Refresh stress", .serialized)
struct RefreshStressTests {
    /// Mirrors AppState.refresh() monitor fan-out. Run under TSan in CI when chasing SIGTRAP.
    @Test("Parallel monitor sampling survives repeated refresh cycles", arguments: [8, 15])
    func repeatedRefreshCycles(iterations: Int) async {
        let networkMonitor = NetworkMonitor()
        let diskMonitor = DiskMonitor()
        let cpuMonitor = CPUMonitor()
        let gpuMonitor = GPUMonitor()
        let tempMonitor = TempMonitor()
        let fanMonitor = FanMonitor()
        let memoryMonitor = MemoryMonitor()

        for cycle in 0..<iterations {
            async let networkRates = networkMonitor.sampleRates()
            async let diskRates = diskMonitor.sampleRates()
            async let sampledNetworkProcesses = networkMonitor.sampleProcesses()
            async let sampledDiskProcesses = diskMonitor.sampleProcesses()
            async let sampledCPUProcesses = cpuMonitor.sampleProcesses()
            async let sampledGPUProcesses = gpuMonitor.sampleProcesses()
            async let sampledMemorySnapshot = memoryMonitor.sample()
            async let sampledMemoryProcesses = memoryMonitor.sampleTopMemoryProcesses()
            async let sampledCPUUsage = cpuMonitor.sampleUsage()
            async let sampledGPUSnapshot = gpuMonitor.sample()
            async let sampledTempSnapshot = tempMonitor.sample()
            async let sampledFanSnapshot = fanMonitor.sample()

            _ = await networkRates
            _ = await diskRates
            _ = await sampledNetworkProcesses
            _ = await sampledDiskProcesses
            _ = await sampledCPUProcesses
            _ = await sampledGPUProcesses
            _ = await sampledMemorySnapshot
            _ = await sampledMemoryProcesses
            _ = await sampledCPUUsage
            _ = await sampledGPUSnapshot
            _ = await sampledTempSnapshot
            _ = await sampledFanSnapshot

            try? await Task.sleep(for: .milliseconds(100))
            if cycle % 5 == 4 {
                try? await Task.sleep(for: .seconds(3.1))
            }
        }
    }

    @Test("ProcessRunner handles concurrent subprocess spawns")
    func concurrentProcessRunner() async throws {
        try await withThrowingTaskGroup(of: String.self) { group in
            for _ in 0..<20 {
                group.addTask {
                    try await ProcessRunner.run(
                        executable: "/bin/ps",
                        arguments: ["-Aceo", "pid,comm"],
                        timeout: 5
                    )
                }
            }
            for try await output in group {
                #expect(!output.isEmpty)
            }
        }
    }
}