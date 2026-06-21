import Foundation

enum ByteFormatter {
    /// Bytes per second → megabits per second (decimal Mbps).
    static func megabitsPerSecond(from bytesPerSecond: UInt64) -> Double {
        Double(bytesPerSecond) * 8.0 / 1_000_000.0
    }

    static func formatMbps(bytesPerSecond: UInt64) -> String {
        let mbps = megabitsPerSecond(from: bytesPerSecond)
        if mbps < 0.05 { return "0.0" }
        if mbps >= 100 { return String(format: "%.0f", mbps) }
        return String(format: "%.1f", mbps)
    }

    /// Shortest Mbps string for the menu bar (max ~3 chars).
    static func formatMenuBarMbps(bytesPerSecond: UInt64) -> String {
        let mbps = megabitsPerSecond(from: bytesPerSecond)
        if mbps < 0.05 { return "0" }
        if mbps >= 100 { return String(format: "%.0f", min(mbps, 999)) }
        if mbps >= 10 { return String(format: "%.0f", mbps) }
        return String(format: "%.1f", mbps)
    }

    static func formatRate(bytesPerSecond: UInt64) -> String {
        let units = ["B/s", "KB/s", "MB/s", "GB/s"]
        var value = Double(bytesPerSecond)
        var unitIndex = 0

        while value >= 1024, unitIndex < units.count - 1 {
            value /= 1024
            unitIndex += 1
        }

        if unitIndex == 0 {
            return String(format: "%.0f %@", value, units[unitIndex])
        }
        return String(format: "%.1f %@", value, units[unitIndex])
    }
}