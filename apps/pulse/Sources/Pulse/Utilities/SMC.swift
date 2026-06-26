import Darwin
import Foundation
import IOKit

// Shared SMC (System Management Controller) reader for temperatures, fans, etc.
// Uses the private AppleSMC IOKit user client. No root required.
final class SMC {
    private var connection: io_connect_t = 0
    private(set) var isConnected = false

    func connectIfNeeded() {
        guard !isConnected else { return }
        connect()
    }

    private func connect() {
        let matching = IOServiceMatching("AppleSMC")
        var iterator: io_iterator_t = 0
        guard IOServiceGetMatchingServices(kIOMainPortDefault, matching, &iterator) == KERN_SUCCESS else {
            return
        }
        defer { IOObjectRelease(iterator) }

        let service = IOIteratorNext(iterator)
        guard service != 0 else { return }
        defer { IOObjectRelease(service) }

        let result = IOServiceOpen(service, mach_task_self_, 0, &connection)
        isConnected = (result == KERN_SUCCESS)
    }

    func readUInt8(key: String) -> UInt8? {
        guard isConnected else { return nil }

        var input = SMCKeyData()
        var output = SMCKeyData()

        input.key = fourCharCode(from: key)
        input.data8 = 9 // kSMCReadKeyInfo

        guard callStruct(input: &input, output: &output) == KERN_SUCCESS else { return nil }

        let dataSize = output.keyInfo.dataSize
        guard dataSize >= 1 else { return nil }

        input.keyInfo.dataSize = dataSize
        input.data8 = 5 // kSMCReadBytes

        guard callStruct(input: &input, output: &output) == KERN_SUCCESS else { return nil }

        return output.bytes.0
    }

    struct KeyReadResult {
        let dataSize: UInt32
        let dataType: UInt32
        let bytes: [UInt8]
    }

    func readKey(key: String) -> KeyReadResult? {
        guard isConnected else { return nil }

        var input = SMCKeyData()
        var output = SMCKeyData()

        input.key = fourCharCode(from: key)
        input.data8 = 9 // kSMCReadKeyInfo

        guard callStruct(input: &input, output: &output) == KERN_SUCCESS else { return nil }

        let dataSize = output.keyInfo.dataSize
        guard dataSize > 0 else { return nil }

        input.keyInfo.dataSize = dataSize
        input.data8 = 5 // kSMCReadBytes

        guard callStruct(input: &input, output: &output) == KERN_SUCCESS else { return nil }

        return KeyReadResult(
            dataSize: dataSize,
            dataType: output.keyInfo.dataType,
            bytes: byteTupleToArray(output.bytes, count: Int(dataSize))
        )
    }

    func writeKey(key: String, bytes: [UInt8]) -> kern_return_t {
        guard isConnected else { return KERN_FAILURE }

        var input = SMCKeyData()
        var output = SMCKeyData()

        input.key = fourCharCode(from: key)
        input.data8 = 9 // kSMCReadKeyInfo

        guard callStruct(input: &input, output: &output) == KERN_SUCCESS else {
            return KERN_FAILURE
        }

        let dataSize = output.keyInfo.dataSize
        guard dataSize > 0 else { return KERN_FAILURE }

        input = SMCKeyData()
        input.key = fourCharCode(from: key)
        input.keyInfo.dataSize = dataSize
        input.data8 = 6 // kSMCWriteBytes
        setBytes(&input.bytes, from: bytes, count: Int(dataSize))

        return callStruct(input: &input, output: &output)
    }

    func readFloat(key: String) -> Double? {
        guard isConnected else { return nil }

        var input = SMCKeyData()
        var output = SMCKeyData()

        input.key = fourCharCode(from: key)
        input.data8 = 9 // kSMCReadKeyInfo

        guard callStruct(input: &input, output: &output) == KERN_SUCCESS else { return nil }

        let dataSize = output.keyInfo.dataSize
        guard dataSize == 4 || dataSize == 2 else { return nil }

        input.keyInfo.dataSize = dataSize
        input.data8 = 5 // kSMCReadBytes

        guard callStruct(input: &input, output: &output) == KERN_SUCCESS else { return nil }

        if dataSize == 4 {
            // flt (little-endian float bits) — common on Apple Silicon
            let bits = UInt32(output.bytes.0)
                | (UInt32(output.bytes.1) << 8)
                | (UInt32(output.bytes.2) << 16)
                | (UInt32(output.bytes.3) << 24)
            let f = Float(bitPattern: bits)
            let d = Double(f)
            return d.isFinite ? d : nil
        } else {
            // fpe2 fallback (older style)
            let raw = (UInt16(output.bytes.0) << 8) | UInt16(output.bytes.1)
            return Double(raw) / 4.0
        }
    }

    private func byteTupleToArray(
        _ tuple: (UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8,
                  UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8,
                  UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8,
                  UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8),
        count: Int
    ) -> [UInt8] {
        withUnsafeBytes(of: tuple) { raw in
            Array(raw.prefix(count))
        }
    }

    private func setBytes(
        _ tuple: inout (UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8,
                        UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8,
                        UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8,
                        UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8),
        from bytes: [UInt8],
        count: Int
    ) {
        withUnsafeMutableBytes(of: &tuple) { raw in
            let limit = min(count, bytes.count, raw.count)
            for index in 0..<limit {
                raw[index] = bytes[index]
            }
        }
    }

    private func fourCharCode(from string: String) -> UInt32 {
        var result: UInt32 = 0
        for c in string.utf8.prefix(4) {
            result = (result << 8) | UInt32(c)
        }
        return result
    }

    private func callStruct(input: inout SMCKeyData, output: inout SMCKeyData) -> kern_return_t {
        var outputSize = MemoryLayout<SMCKeyData>.stride
        return IOConnectCallStructMethod(
            connection,
            2,
            &input,
            MemoryLayout<SMCKeyData>.stride,
            &output,
            &outputSize
        )
    }
}

// MARK: - SMC data structures (minimal, for AppleSMC user client)

struct SMCKeyData {
    struct KeyInfo {
        var dataSize: IOByteCount32 = 0
        var dataType: UInt32 = 0
        var dataAttributes: UInt8 = 0
    }

    var key: UInt32 = 0
    var vers: (UInt8, UInt8, UInt8, UInt8, UInt16) = (0, 0, 0, 0, 0)
    var pLimitData: (UInt16, UInt16, UInt32, UInt32, UInt32) = (0, 0, 0, 0, 0)
    var keyInfo = KeyInfo()
    var padding: UInt16 = 0
    var result: UInt8 = 0
    var status: UInt8 = 0
    var data8: UInt8 = 0
    var data32: UInt32 = 0
    var bytes: (UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8,
                UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8,
                UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8,
                UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8) =
        (0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0)
}