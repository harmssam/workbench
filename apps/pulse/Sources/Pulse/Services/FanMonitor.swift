import Foundation
import OSLog

actor FanMonitor {
    func sample() async -> FanSnapshot {
        CrashReporter.breadcrumb("FanMonitor.sample start")

        guard await SMCService.shared.isConnected else {
            AppLogger.error("SMC not connected for fan reading", category: AppLogger.monitor)
            return .unavailable
        }

        let fanCount = Int(await SMCService.shared.readUInt8(key: "FNum") ?? 0)
        AppLogger.info("SMC reported \(fanCount) fans", category: AppLogger.monitor)
        CrashReporter.breadcrumb("FanMonitor: FNum=\(fanCount)")

        var fans: [Fan] = []
        let maxToProbe = max(fanCount, 2) // probe at least a couple on machines that hide count
        for i in 0..<maxToProbe {
            let base = "F\(i)"
            CrashReporter.breadcrumb("FanMonitor: reading \(base)Ac")
            guard let rpm = await SMCService.shared.readFloat(key: "\(base)Ac") else { continue }

            let minR = await SMCService.shared.readFloat(key: "\(base)Mn")
            let maxR = await SMCService.shared.readFloat(key: "\(base)Mx")

            fans.append(Fan(
                id: i,
                currentRPM: rpm,
                minRPM: minR,
                maxRPM: maxR
            ))
        }

        if fans.isEmpty {
            AppLogger.info("No fan RPM readings from SMC", category: AppLogger.monitor)
        }
        return FanSnapshot(fans: fans)
    }
}