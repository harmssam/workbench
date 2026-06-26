import Darwin
import Foundation

/// Manual fan speed control via AppleSMC. Serialized through SMCService alongside thermal reads.
actor FanController {
    static let shared = FanController()

    private var fanModeKeyIsLower: Bool?
    private var manualControlActive = false

    private init() {}

    var isManualControlActive: Bool { manualControlActive }

    /// Unlock SMC fan control and set every detected fan to its reported maximum RPM.
    func applyMaxSpeed() async -> Bool {
        await resolveFanModeKeyStyle()

        guard await SMCService.shared.isConnected else {
            AppLogger.error("SMC not connected for fan control", category: AppLogger.monitor)
            return false
        }

        let fanCount = max(Int(await SMCService.shared.readUInt8(key: "FNum") ?? 0), 1)
        var anySuccess = false

        for fanID in 0..<fanCount {
            guard let maxRPM = await SMCService.shared.readFloat(key: "F\(fanID)Mx"),
                  maxRPM > 0 else {
                continue
            }

            guard await unlockFanControl(fanID: fanID) else {
                AppLogger.error("Failed to unlock manual fan control for fan \(fanID)", category: AppLogger.monitor)
                continue
            }

            if await setTargetRPM(fanID: fanID, rpm: Int(maxRPM.rounded())) {
                anySuccess = true
            }
        }

        manualControlActive = anySuccess
        if anySuccess {
            AppLogger.info("Fan boost active — fans set to maximum RPM", category: AppLogger.monitor)
        }
        return anySuccess
    }

    /// Return fans to automatic thermal management.
    func restoreAutomatic() async -> Bool {
        await resolveFanModeKeyStyle()

        guard await SMCService.shared.isConnected else { return false }
        guard manualControlActive else { return true }

        var success = true

        if let ftst = await SMCService.shared.readKey(key: "Ftst"), ftst.dataSize > 0 {
            if ftst.bytes.first != 0 {
                var bytes = ftst.bytes
                bytes[0] = 0
                if await !writeWithRetry(key: "Ftst", bytes: bytes) {
                    success = false
                }
            }
        }

        let fanCount = max(Int(await SMCService.shared.readUInt8(key: "FNum") ?? 0), 2)
        for fanID in 0..<fanCount {
            let modeKey = fanModeKey(fanID)
            if let mode = await SMCService.shared.readKey(key: modeKey), mode.dataSize > 0, mode.bytes.first != 0 {
                var bytes = mode.bytes
                bytes[0] = 0
                if await !writeWithRetry(key: modeKey, bytes: bytes) {
                    success = false
                }
            }

            let targetKey = "F\(fanID)Tg"
            if let target = await SMCService.shared.readKey(key: targetKey), target.dataSize > 0 {
                let zeroBytes = zeroBytes(for: target)
                if await !writeWithRetry(key: targetKey, bytes: zeroBytes) {
                    success = false
                }
            }
        }

        manualControlActive = false
        if success {
            AppLogger.info("Fan control restored to automatic", category: AppLogger.monitor)
        } else {
            AppLogger.error("Failed to fully restore automatic fan control", category: AppLogger.monitor)
        }
        return success
    }

    // MARK: - Apple Silicon fan control

    private func fanModeKey(_ fanID: Int) -> String {
        (fanModeKeyIsLower == true) ? "F\(fanID)md" : "F\(fanID)Md"
    }

    private func resolveFanModeKeyStyle() async {
        guard fanModeKeyIsLower == nil else { return }
        if let probe = await SMCService.shared.readKey(key: "F0md"), probe.dataSize > 0 {
            fanModeKeyIsLower = true
        } else {
            fanModeKeyIsLower = false
        }
    }

    private func unlockFanControl(fanID: Int) async -> Bool {
        await resolveFanModeKeyStyle()

        let modeKey = fanModeKey(fanID)
        guard let mode = await SMCService.shared.readKey(key: modeKey), mode.dataSize > 0 else {
            return false
        }

        if mode.bytes.first == 1 {
            return true
        }

        var modeBytes = mode.bytes
        modeBytes[0] = 1
        if await writeWithRetry(key: modeKey, bytes: modeBytes, maxAttempts: 5) {
            return true
        }

        guard let ftst = await SMCService.shared.readKey(key: "Ftst"), ftst.dataSize > 0 else {
            return false
        }

        if ftst.bytes.first == 1 {
            return await retryModeWrite(fanID: fanID, maxAttempts: 20)
        }

        var ftstBytes = ftst.bytes
        ftstBytes[0] = 1
        guard await writeWithRetry(key: "Ftst", bytes: ftstBytes, maxAttempts: 100) else {
            return false
        }

        usleep(3_000_000)
        return await retryModeWrite(fanID: fanID, maxAttempts: 300)
    }

    private func retryModeWrite(fanID: Int, maxAttempts: Int) async -> Bool {
        let modeKey = fanModeKey(fanID)
        guard let mode = await SMCService.shared.readKey(key: modeKey), mode.dataSize > 0 else {
            return false
        }
        var modeBytes = mode.bytes
        modeBytes[0] = 1
        return await writeWithRetry(key: modeKey, bytes: modeBytes, maxAttempts: maxAttempts, delayMicros: 100_000)
    }

    private func setTargetRPM(fanID: Int, rpm: Int) async -> Bool {
        let targetKey = "F\(fanID)Tg"
        guard let target = await SMCService.shared.readKey(key: targetKey), target.dataSize > 0 else {
            return false
        }

        let payload = rpmBytes(for: target, rpm: rpm)
        return await writeWithRetry(key: targetKey, bytes: payload)
    }

    private func rpmBytes(for key: SMC.KeyReadResult, rpm: Int) -> [UInt8] {
        var bytes = key.bytes
        if dataTypeIs(key.dataType, "flt ") {
            let encoded = Float(rpm)
            withUnsafeBytes(of: encoded) { raw in
                for index in 0..<min(raw.count, bytes.count) {
                    bytes[index] = raw[index]
                }
            }
        } else if dataTypeIs(key.dataType, "fpe2") {
            bytes[0] = UInt8(rpm >> 6)
            bytes[1] = UInt8((rpm << 2) ^ ((rpm >> 6) << 8))
        }
        return bytes
    }

    private func zeroBytes(for key: SMC.KeyReadResult) -> [UInt8] {
        var bytes = key.bytes
        if dataTypeIs(key.dataType, "flt ") {
            withUnsafeBytes(of: Float(0)) { raw in
                for index in 0..<min(raw.count, bytes.count) {
                    bytes[index] = raw[index]
                }
            }
        } else if dataTypeIs(key.dataType, "fpe2") {
            bytes[0] = 0
            bytes[1] = 0
        } else {
            bytes = Array(repeating: 0, count: bytes.count)
        }
        return bytes
    }

    private func dataTypeIs(_ type: UInt32, _ literal: String) -> Bool {
        var code: UInt32 = 0
        for char in literal.utf8.prefix(4) {
            code = (code << 8) | UInt32(char)
        }
        return type == code
    }

    private func writeWithRetry(
        key: String,
        bytes: [UInt8],
        maxAttempts: Int = 10,
        delayMicros: UInt32 = 50_000
    ) async -> Bool {
        var lastResult: kern_return_t = KERN_SUCCESS
        for attempt in 0..<maxAttempts {
            lastResult = await SMCService.shared.writeKey(key: key, bytes: bytes)
            if lastResult == KERN_SUCCESS {
                return true
            }
            if attempt < maxAttempts - 1 {
                usleep(delayMicros)
            }
        }
        AppLogger.error(
            "SMC write failed for \(key): \(lastResult)",
            category: AppLogger.monitor
        )
        return false
    }
}