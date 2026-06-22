import Testing
@testable import Sysmon

@Suite("CPU monitor")
struct CPUMonitorTests {
    @Test("Computes usage from tick deltas")
    func tickDeltaMath() {
        let previous = CPUTicks(user: 1_000, system: 500, idle: 8_000, nice: 200)
        let current = CPUTicks(user: 1_100, system: 550, idle: 8_040, nice: 200)

        let sample = CPUUsageCalculator.usage(current: current, previous: previous)

        #expect(sample.isValid)
        #expect(abs(sample.total - (150.0 / 190.0)) < 0.0001)
        #expect(abs(sample.user - (100.0 / 190.0)) < 0.0001)
        #expect(abs(sample.system - (50.0 / 190.0)) < 0.0001)
        #expect(abs(sample.idle - (40.0 / 190.0)) < 0.0001)
    }

    @Test("Returns invalid when no elapsed ticks")
    func zeroTicks() {
        let ticks = CPUTicks(user: 10, system: 10, idle: 10, nice: 10)
        let sample = CPUUsageCalculator.usage(current: ticks, previous: ticks)

        #expect(!sample.isValid)
    }

    @Test("Parses ps output for top processes")
    func processParsing() async {
        let monitor = CPUMonitor()
        let output = """
          PID  %CPU COMM
          452  44.0 WindowServer
          765  23.2 Terminal
          100   0.0 idle
        """

        let processes = await monitor.parseProcessOutput(output, limit: 5)

        #expect(processes.count == 2)
        #expect(processes[0].name == "WindowServer")
        #expect(processes[0].usage == 0.44)
        #expect(processes[1].name == "Terminal")
    }
}