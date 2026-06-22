import Darwin
import Foundation

actor CPUMonitor {
    private var previousTicks: CPUTicks?
    private var cachedProcesses: [CPUProcessActivity] = []
    private var lastProcessSampleTime: Date?

    private let processSampleInterval: TimeInterval = 3

    func sampleUsage() -> CPUUsageSample {
        guard let current = readHostCPULoad() else {
            return .invalid
        }

        defer { previousTicks = current }

        guard let previous = previousTicks else {
            return .invalid
        }

        return CPUUsageCalculator.usage(current: current, previous: previous)
    }

    func sampleProcesses(limit: Int = 5) async -> [CPUProcessActivity] {
        let now = Date()
        if let lastSample = lastProcessSampleTime,
           now.timeIntervalSince(lastSample) < processSampleInterval {
            return cachedProcesses
        }

        guard let output = try? await ProcessRunner.run(
            executable: "/bin/ps",
            arguments: ["-Aceo", "pid,pcpu,comm", "-r"]
        ) else {
            return cachedProcesses
        }

        let processes = parseProcessOutput(output, limit: limit)
        cachedProcesses = processes
        lastProcessSampleTime = now
        return processes
    }

    func parseProcessOutput(_ output: String, limit: Int) -> [CPUProcessActivity] {
        var processes: [CPUProcessActivity] = []

        for line in output.components(separatedBy: "\n").dropFirst() {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if trimmed.isEmpty { continue }

            let parts = trimmed.split(separator: " ", omittingEmptySubsequences: true)
            guard parts.count >= 3,
                  let pid = Int32(parts[0]),
                  let usage = Double(parts[1].replacingOccurrences(of: ",", with: ".")) else {
                continue
            }

            let name = (String(parts[2]) as NSString).lastPathComponent
            guard usage > 0 else { continue }

            processes.append(CPUProcessActivity(id: pid, name: name, usage: usage / 100))
            if processes.count >= limit { break }
        }

        return processes
    }

    private func readHostCPULoad() -> CPUTicks? {
        let count = MemoryLayout<host_cpu_load_info>.stride / MemoryLayout<integer_t>.stride
        var size = mach_msg_type_number_t(count)
        var info = host_cpu_load_info()

        let result = withUnsafeMutablePointer(to: &info) {
            $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
                host_statistics(mach_host_self(), HOST_CPU_LOAD_INFO, $0, &size)
            }
        }

        guard result == KERN_SUCCESS else { return nil }

        return CPUTicks(
            user: info.cpu_ticks.0,
            system: info.cpu_ticks.1,
            idle: info.cpu_ticks.2,
            nice: info.cpu_ticks.3
        )
    }
}