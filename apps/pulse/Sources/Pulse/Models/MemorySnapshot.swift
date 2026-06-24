import Foundation

struct MemorySnapshot: Sendable {
    let total: UInt64
    let free: UInt64
    let used: UInt64
    let active: UInt64
    let wired: UInt64
    let compressed: UInt64
    let isValid: Bool

    var usedPercent: Double {
        guard total > 0 else { return 0 }
        return Double(used) / Double(total)
    }

    static let unavailable = MemorySnapshot(
        total: 0,
        free: 0,
        used: 0,
        active: 0,
        wired: 0,
        compressed: 0,
        isValid: false
    )
}