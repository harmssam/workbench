import Darwin
import Foundation

@_silgen_name("proc_pid_rusage")
private func proc_pid_rusage(_ pid: Int32, _ flavor: Int32, _ buffer: UnsafeMutablePointer<rusage_info_v4>) -> Int32

actor DiskMonitor {
    private var previousBytes: (read: UInt64, write: UInt64)?
    private var previousTimestamp: Date?
    private var previousProcessStats: [Int32: (read: UInt64, write: UInt64)] = [:]
    private var cachedProcesses: [ProcessActivity] = []
    private var lastProcessSampleTime: Date?
    private var processSampleInFlight = false
    private let processSampleInterval: TimeInterval = 3

    func sampleRates() async -> (read: UInt64, write: UInt64) {
        let current = await readCumulativeBytes()
        let now = Date()

        defer {
            previousBytes = current
            previousTimestamp = now
        }

        guard let previous = previousBytes, let previousTime = previousTimestamp else {
            return (0, 0)
        }

        let elapsed = now.timeIntervalSince(previousTime)
        guard elapsed > 0 else { return (0, 0) }

        let readDelta = current.read >= previous.read ? current.read - previous.read : current.read
        let writeDelta = current.write >= previous.write ? current.write - previous.write : current.write

        return (
            UInt64(Double(readDelta) / elapsed),
            UInt64(Double(writeDelta) / elapsed)
        )
    }

    func sampleProcesses(limit: Int = 5) async -> [ProcessActivity] {
        let now = Date()
        if let lastSample = lastProcessSampleTime,
           now.timeIntervalSince(lastSample) < processSampleInterval {
            return cachedProcesses
        }
        if processSampleInFlight {
            return cachedProcesses
        }

        processSampleInFlight = true
        defer {
            processSampleInFlight = false
            lastProcessSampleTime = Date()
        }

        guard let output = try? await ProcessRunner.run(
            executable: "/bin/ps",
            arguments: ["-Aceo", "pid,comm"]
        ) else {
            return cachedProcesses
        }

        let elapsed = lastProcessSampleTime.map { max(now.timeIntervalSince($0), 0.001) } ?? 1.0

        var activities: [ProcessActivity] = []

        for line in output.components(separatedBy: "\n") {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if trimmed.isEmpty || trimmed.hasPrefix("PID") { continue }

            let parts = trimmed.split(separator: " ", maxSplits: 1, omittingEmptySubsequences: true)
            guard parts.count == 2, let pid = Int32(parts[0]) else { continue }

            let name = (String(parts[1]) as NSString).lastPathComponent
            guard let current = readProcessIO(pid: pid) else { continue }

            guard let previous = previousProcessStats[pid] else {
                previousProcessStats[pid] = current
                continue
            }

            let readDelta = current.read >= previous.read ? current.read - previous.read : current.read
            let writeDelta = current.write >= previous.write ? current.write - previous.write : current.write
            previousProcessStats[pid] = current

            let readRate = UInt64(Double(readDelta) / elapsed)
            let writeRate = UInt64(Double(writeDelta) / elapsed)

            if readRate > 0 || writeRate > 0 {
                activities.append(ProcessActivity(id: pid, name: name, readRate: readRate, writeRate: writeRate))
            }
        }

        cachedProcesses = activities
            .sorted { $0.totalRate > $1.totalRate }
            .prefix(limit)
            .map { $0 }
        return cachedProcesses
    }

    private func readCumulativeBytes() async -> (read: UInt64, write: UInt64) {
        guard let output = try? await ProcessRunner.run(
            executable: "/usr/sbin/ioreg",
            arguments: ["-r", "-c", "IOBlockStorageDriver", "-d", "1"]
        ) else {
            return (0, 0)
        }

        var totalRead: UInt64 = 0
        var totalWrite: UInt64 = 0

        for line in output.components(separatedBy: "\n") where line.contains("Statistics") {
            totalRead += parseStatisticValue(in: line, key: "Bytes (Read)")
            totalWrite += parseStatisticValue(in: line, key: "Bytes (Write)")
        }

        return (totalRead, totalWrite)
    }

    func parseStatisticValue(in line: String, key: String) -> UInt64 {
        let pattern = "\"\(NSRegularExpression.escapedPattern(for: key))\"=(\\d+)"
        guard let regex = try? NSRegularExpression(pattern: pattern),
              let match = regex.firstMatch(in: line, range: NSRange(line.startIndex..., in: line)),
              let valueRange = Range(match.range(at: 1), in: line),
              let value = UInt64(line[valueRange]) else {
            return 0
        }
        return value
    }

    private func readProcessIO(pid: Int32) -> (read: UInt64, write: UInt64)? {
        var usage = rusage_info_v4()
        guard proc_pid_rusage(pid, RUSAGE_INFO_V4, &usage) == 0 else {
            return nil
        }

        let readBytes = usage.ri_diskio_bytesread
        let writeBytes = max(usage.ri_diskio_byteswritten, usage.ri_logical_writes)
        return (readBytes, writeBytes)
    }
}