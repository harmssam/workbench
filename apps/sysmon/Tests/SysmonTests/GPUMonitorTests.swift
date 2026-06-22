import Testing
@testable import Sysmon

@Suite("GPU monitor")
struct GPUMonitorTests {
    @Test("Parses Apple Silicon performance statistics")
    func appleSiliconStats() {
        let stats: [String: Any] = [
            "Device Utilization %": 18,
            "Renderer Utilization %": 12,
            "Tiler Utilization %": 6,
            "In use system memory": 351_682_560
        ]

        let parsed = GPUPerformanceParser.parse(ioClass: "AGXAcceleratorG13X", statistics: stats)

        #expect(parsed.name == "Apple GPU")
        #expect(parsed.utilization == 0.18)
        #expect(parsed.rendererUtilization == 0.12)
        #expect(parsed.tilerUtilization == 0.06)
        #expect(parsed.memoryUsedBytes == 351_682_560)
        #expect(parsed.memoryLabel == "Shared")
    }

    @Test("Parses discrete GPU VRAM statistics")
    func discreteVRAMStats() {
        let stats: [String: Any] = [
            "Device Utilization %": 42,
            "VRAM,totalMB": 8192,
            "VRAM,freeMB": 6144
        ]

        let parsed = GPUPerformanceParser.parse(ioClass: "AMDAccelerator", statistics: stats)

        #expect(parsed.name == "AMD GPU")
        #expect(parsed.utilization == 0.42)
        #expect(parsed.memoryUsedBytes == 2_147_483_648)
        #expect(parsed.memoryLabel == "VRAM")
    }

    @Test("Parses GPU client PID from IOUserClientCreator")
    func creatorPIDParsing() {
        #expect(GPUProcessEnumerator.parsePID(from: "pid 452, WindowServer") == 452)
        #expect(GPUProcessEnumerator.parsePID(from: "pid 944, Brave Browser He") == 944)
        #expect(GPUProcessEnumerator.parsePID(from: "no pid here") == nil)
    }

    @Test("Parses GPU client name from IOUserClientCreator")
    func creatorNameParsing() {
        #expect(GPUProcessEnumerator.parseCreatorName(from: "pid 452, WindowServer") == "WindowServer")
        #expect(GPUProcessEnumerator.parseCreatorName(from: "pid 465, runningboardd") == "runningboardd")
        #expect(GPUProcessEnumerator.parseCreatorName(from: "pid 452") == nil)
    }

    @Test("Selects the busiest accelerator")
    func primarySelection() {
        let low = ParsedAccelerator(
            ioClass: "IntelAccelerator",
            name: "Intel GPU",
            utilization: 0.05,
            rendererUtilization: nil,
            tilerUtilization: nil,
            memoryUsedBytes: nil,
            memoryLabel: "Shared"
        )
        let high = ParsedAccelerator(
            ioClass: "AGXAcceleratorG13X",
            name: "Apple GPU",
            utilization: 0.33,
            rendererUtilization: 0.2,
            tilerUtilization: 0.1,
            memoryUsedBytes: 1000,
            memoryLabel: "Shared"
        )

        let snapshot = GPUPerformanceParser.selectPrimary(from: [low, high])

        #expect(snapshot?.name == "Apple GPU")
        #expect(snapshot?.utilization == 0.33)
    }
}