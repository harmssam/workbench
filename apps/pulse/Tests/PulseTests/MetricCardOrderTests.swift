import Foundation
import Testing
@testable import Pulse

@Suite("Metric card order")
struct MetricCardOrderTests {
    @Test("Default order includes all cards")
    func defaultOrder() {
        #expect(MetricCardKind.defaultOrder.count == MetricCardKind.allCases.count)
        #expect(Set(MetricCardKind.defaultOrder) == Set(MetricCardKind.allCases))
    }

    @Test("Saved order round-trips through UserDefaults")
    func saveAndLoad() {
        let key = "metricCardOrder"
        let original = UserDefaults.standard.data(forKey: key)
        defer {
            if let original {
                UserDefaults.standard.set(original, forKey: key)
            } else {
                UserDefaults.standard.removeObject(forKey: key)
            }
        }

        let custom: [MetricCardKind] = [.memory, .cpu, .network, .disk, .gpu, .thermal]
        MetricCardKind.saveOrder(custom)
        #expect(MetricCardKind.loadSavedOrder() == custom)
    }

    @Test("Normalized order merges newly added card kinds")
    func mergesNewKinds() {
        let partial: [MetricCardKind] = [.network, .cpu]
        let loaded = MetricCardKind.normalizedOrder(from: partial)
        #expect(loaded.starts(with: partial))
        #expect(Set(loaded) == Set(MetricCardKind.allCases))
    }
}