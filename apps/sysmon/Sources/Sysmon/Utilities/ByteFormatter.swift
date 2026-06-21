import Foundation

enum ByteFormatter {
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

    static func shortRate(bytesPerSecond: UInt64) -> String {
        let units = ["B", "K", "M", "G"]
        var value = Double(bytesPerSecond)
        var unitIndex = 0

        while value >= 1024, unitIndex < units.count - 1 {
            value /= 1024
            unitIndex += 1
        }

        if unitIndex == 0 {
            return String(format: "%.0f%@", value, units[unitIndex])
        }
        if value >= 100 {
            return String(format: "%.0f%@", value, units[unitIndex])
        }
        return String(format: "%.1f%@", value, units[unitIndex])
    }
}