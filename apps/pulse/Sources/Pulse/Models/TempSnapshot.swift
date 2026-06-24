import Foundation

struct TempSnapshot: Sendable {
    let cpuTemperature: Double? // Celsius
    let gpuTemperature: Double? // Celsius

    var isAvailable: Bool {
        cpuTemperature != nil || gpuTemperature != nil
    }

    static let unavailable = TempSnapshot(cpuTemperature: nil, gpuTemperature: nil)
}