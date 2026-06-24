import Foundation

struct HistoryBuffer: Sendable {
    private(set) var values: [Double] = []
    let capacity: Int

    init(capacity: Int = 45) {
        self.capacity = capacity
    }

    mutating func append(_ value: Double) {
        guard value.isFinite else { return }
        values.append(max(0, value))
        if values.count > capacity {
            values.removeFirst(values.count - capacity)
        }
    }
}