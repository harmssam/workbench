import Foundation

enum SafeNumeric {
    static func roundedInt(_ value: Double, default defaultValue: Int = 0) -> Int {
        guard value.isFinite else { return defaultValue }
        return Int(value.rounded())
    }

    static func sanitized(_ value: Double, minimum: Double = 0) -> Double {
        guard value.isFinite else { return minimum }
        return max(minimum, value)
    }
}