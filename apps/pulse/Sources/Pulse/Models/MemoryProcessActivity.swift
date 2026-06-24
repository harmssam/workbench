import Foundation

struct MemoryProcessActivity: Identifiable, Sendable {
    let id: Int32
    let name: String
    let memoryBytes: UInt64
}
