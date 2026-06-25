import Foundation
import OSLog

actor TempMonitor {
    // Broad probe list of likely Apple Silicon temperature keys (from widely used references).
    // We take the highest plausible reading in each category.
    private let cpuKeys: [String] = [
        // M1/M2 style efficiency/performance (Tp*)
        "Tp09", "Tp0T", "Tp01", "Tp05", "Tp0D", "Tp0H", "Tp0L", "Tp0P", "Tp0X", "Tp0b",
        "Tp1h", "Tp1t", "Tp1p", "Tp1l",
        // Pro/Max/Ultra style (TCxx clusters)
        "TC10", "TC11", "TC12", "TC13", "TC20", "TC21", "TC22", "TC23",
        "TC30", "TC31", "TC32", "TC33", "TC40", "TC41", "TC42", "TC43",
        "TC50", "TC51", "TC52", "TC53",
        // Broader common
        "TC0D", "TC0E", "TC0F", "TC0P", "TCAD", "TCXC",
        "Te05", "Te0L", "Te0P", "Te0S",
        "Tf04", "Tf09", "Tf0A", "Tf0B", "Tf0D", "Tf0E", "Tf44", "Tf49", "Tf4A", "Tf4B"
    ]

    private let gpuKeys: [String] = [
        "Tg05", "Tg0D", "Tg0L", "Tg0T",
        "Tg0f", "Tg0j",
        "Tg04", "Tg05", "Tg0C", "Tg0D", "Tg0K", "Tg0L", "Tg0S", "Tg0T",
        "Tf14", "Tf18", "Tf19", "Tf1A", "Tf24", "Tf28", "Tf29", "Tf2A",
        "Tg0G", "Tg0H", "Tg1U", "Tg1k", "Tg0K", "Tg0L", "Tg0d", "Tg0e", "Tg0j", "Tg0k",
        "TG0D", "TG0P", "TG0H"
    ]

    func sample() async -> TempSnapshot {
        CrashReporter.breadcrumb("TempMonitor.sample start")

        guard await SMCService.shared.isConnected else {
            AppLogger.error("SMC not connected for temperature reading", category: AppLogger.monitor)
            return .unavailable
        }

        let cpu = await readMaxTemperature(from: cpuKeys)
        let gpu = await readMaxTemperature(from: gpuKeys)

        // Only accept plausible temps
        let cpuC = cpu.flatMap { (20.0...130.0).contains($0) ? $0 : nil }
        let gpuC = gpu.flatMap { (20.0...130.0).contains($0) ? $0 : nil }

        if cpuC == nil && gpuC == nil {
            AppLogger.debug("No valid temperature readings from SMC", category: AppLogger.monitor)
            return .unavailable
        }
        return TempSnapshot(cpuTemperature: cpuC, gpuTemperature: gpuC)
    }

    private func readMaxTemperature(from keys: [String]) async -> Double? {
        var maxValue: Double = 0
        for key in keys {
            if let v = await SMCService.shared.readFloat(key: key), v > maxValue {
                maxValue = v
            }
        }
        return maxValue > 0 ? maxValue : nil
    }
}