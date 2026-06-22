import Foundation

enum PercentFormatter {
    static func format(_ fraction: Double) -> String {
        guard fraction.isFinite else { return "—" }
        return String(format: "%.0f%%", fraction * 100)
    }

    static func formatDetailed(_ fraction: Double) -> String {
        guard fraction.isFinite else { return "—" }
        if fraction >= 0.1 {
            return String(format: "%.0f%%", fraction * 100)
        }
        return String(format: "%.1f%%", fraction * 100)
    }
}