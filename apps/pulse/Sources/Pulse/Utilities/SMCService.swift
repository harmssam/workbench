import Darwin
import Foundation

/// Single shared gateway for AppleSMC IOKit access.
/// Multiple concurrent connections to AppleSMC can destabilize reads; serialize here.
actor SMCService {
    static let shared = SMCService()

    private let smc = SMC()

    private init() {}

    func readUInt8(key: String) -> UInt8? {
        smc.connectIfNeeded()
        guard smc.isConnected else { return nil }
        return smc.readUInt8(key: key)
    }

    func readFloat(key: String) -> Double? {
        smc.connectIfNeeded()
        guard smc.isConnected else { return nil }
        return smc.readFloat(key: key)
    }

    func readKey(key: String) -> SMC.KeyReadResult? {
        smc.connectIfNeeded()
        guard smc.isConnected else { return nil }
        return smc.readKey(key: key)
    }

    func writeKey(key: String, bytes: [UInt8]) -> kern_return_t {
        smc.connectIfNeeded()
        guard smc.isConnected else { return KERN_FAILURE }
        return smc.writeKey(key: key, bytes: bytes)
    }

    var isConnected: Bool {
        smc.connectIfNeeded()
        return smc.isConnected
    }
}