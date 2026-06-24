import Foundation

enum MetricCardKind: String, CaseIterable, Codable, Identifiable, Sendable {
    case network
    case disk
    case cpu
    case gpu
    case memory
    case thermal

    var id: String { rawValue }

    static let defaultOrder: [MetricCardKind] = [
        .network, .disk, .cpu, .gpu, .memory, .thermal
    ]

    private static let storageKey = "metricCardOrder"

    static func loadSavedOrder() -> [MetricCardKind] {
        guard let data = UserDefaults.standard.data(forKey: storageKey),
              let saved = try? JSONDecoder().decode([MetricCardKind].self, from: data) else {
            return defaultOrder
        }
        return normalizedOrder(from: saved)
    }

    static func normalizedOrder(from saved: [MetricCardKind]) -> [MetricCardKind] {
        var order = saved.filter { allCases.contains($0) }
        for kind in defaultOrder where !order.contains(kind) {
            order.append(kind)
        }
        return order
    }

    static func saveOrder(_ order: [MetricCardKind]) {
        guard let data = try? JSONEncoder().encode(order) else { return }
        UserDefaults.standard.set(data, forKey: storageKey)
    }
}