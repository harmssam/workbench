import Foundation

actor FanMonitor {
    private let smc = SMC()

    func sample() -> FanSnapshot {
        smc.connectIfNeeded()
        guard smc.isConnected else { return .unavailable }

        let fanCount = Int(smc.readUInt8(key: "FNum") ?? 0)

        var fans: [Fan] = []
        let maxToProbe = max(fanCount, 2) // probe at least a couple on machines that hide count
        for i in 0..<maxToProbe {
            let base = "F\(i)"
            guard let rpm = smc.readFloat(key: "\(base)Ac") else { continue }

            let minR = smc.readFloat(key: "\(base)Mn")
            let maxR = smc.readFloat(key: "\(base)Mx")

            fans.append(Fan(
                id: i,
                currentRPM: rpm,
                minRPM: minR,
                maxRPM: maxR
            ))
        }

        return FanSnapshot(fans: fans)
    }
}