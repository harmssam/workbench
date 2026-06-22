import Darwin
import Foundation
import IOKit

@_silgen_name("proc_pid_rusage")
private func proc_pid_rusage(_ pid: Int32, _ flavor: Int32, _ buffer: UnsafeMutablePointer<rusage_info_v4>) -> Int32

@_silgen_name("proc_pidpath")
private func proc_pidpath(_ pid: Int32, _ buffer: UnsafeMutablePointer<CChar>, _ bufsize: UInt32) -> Int32

enum GPUProcessEnumerator {
    private static let acceleratorClasses = [
        "AGXAcceleratorG13X",
        "AGXAcceleratorG14X",
        "AGXAcceleratorG15X",
        "AGXAccelerator",
        "AMDAccelerator",
        "IntelAccelerator",
        "NVAccelerator",
        "IOAccelerator"
    ]

    static func collectProcesses(limit: Int = 5) -> [GPUProcessActivity] {
        let clients = gpuClientEntries()
        guard !clients.isEmpty else { return [] }

        var activities = clients.map { client in
            GPUProcessActivity(
                id: client.pid,
                name: processName(pid: client.pid, fallback: client.creatorName),
                usage: 0,
                memoryBytes: physicalFootprint(pid: client.pid)
            )
        }

        let totalMemory = activities.reduce(UInt64(0)) { $0 + $1.memoryBytes }
        if totalMemory > 0 {
            activities = activities.map { activity in
                GPUProcessActivity(
                    id: activity.id,
                    name: activity.name,
                    usage: Double(activity.memoryBytes) / Double(totalMemory),
                    memoryBytes: activity.memoryBytes
                )
            }
        }

        return activities
            .sorted { lhs, rhs in
                if lhs.memoryBytes == rhs.memoryBytes {
                    return lhs.name.localizedCaseInsensitiveCompare(rhs.name) == .orderedAscending
                }
                return lhs.memoryBytes > rhs.memoryBytes
            }
            .prefix(limit)
            .map { $0 }
    }

    static func parsePID(from creator: String) -> Int32? {
        guard let range = creator.range(of: "pid ") else { return nil }
        let digits = creator[range.upperBound...].prefix(while: \.isNumber)
        guard let pid = Int32(digits) else { return nil }
        return pid > 0 ? pid : nil
    }

    static func parseCreatorName(from creator: String) -> String? {
        guard let range = creator.range(of: ", ") else { return nil }
        let name = String(creator[range.upperBound...]).trimmingCharacters(in: .whitespaces)
        return name.isEmpty ? nil : name
    }

    private struct GPUClientEntry {
        let pid: Int32
        let creatorName: String?
    }

    private static func gpuClientEntries() -> [GPUClientEntry] {
        var entries: [GPUClientEntry] = []

        for className in acceleratorClasses {
            let found = clientEntries(forAcceleratorClass: className)
            if !found.isEmpty {
                entries = found
                break
            }
        }

        var seen: Set<Int32> = []
        return entries.filter { entry in
            guard seen.insert(entry.pid).inserted else { return false }
            return true
        }
    }

    private static func clientEntries(forAcceleratorClass className: String) -> [GPUClientEntry] {
        let match = IOServiceMatching(className)
        var iterator: io_iterator_t = 0
        guard IOServiceGetMatchingServices(kIOMainPortDefault, match, &iterator) == KERN_SUCCESS else {
            return []
        }
        defer { IOObjectRelease(iterator) }

        var entries: [GPUClientEntry] = []

        var accelerator = IOIteratorNext(iterator)
        while accelerator != 0 {
            defer {
                IOObjectRelease(accelerator)
                accelerator = IOIteratorNext(iterator)
            }

            entries.append(contentsOf: childClientEntries(for: accelerator))
        }

        return entries
    }

    private static func childClientEntries(for service: io_registry_entry_t) -> [GPUClientEntry] {
        var childIterator: io_iterator_t = 0
        guard IORegistryEntryGetChildIterator(service, kIOServicePlane, &childIterator) == KERN_SUCCESS else {
            return []
        }
        defer { IOObjectRelease(childIterator) }

        var entries: [GPUClientEntry] = []

        var child = IOIteratorNext(childIterator)
        while child != 0 {
            defer {
                IOObjectRelease(child)
                child = IOIteratorNext(childIterator)
            }

            guard let creator = ioRegistryString(child, key: "IOUserClientCreator"),
                  let pid = parsePID(from: creator) else {
                continue
            }

            entries.append(GPUClientEntry(pid: pid, creatorName: parseCreatorName(from: creator)))
        }

        return entries
    }

    private static func ioRegistryString(_ service: io_registry_entry_t, key: String) -> String? {
        guard let value = IORegistryEntryCreateCFProperty(
            service,
            key as CFString,
            kCFAllocatorDefault,
            0
        )?.takeRetainedValue() as? String else {
            return nil
        }
        return value
    }

    private static func physicalFootprint(pid: Int32) -> UInt64 {
        var usage = rusage_info_v4()
        guard proc_pid_rusage(pid, RUSAGE_INFO_V4, &usage) == 0 else { return 0 }
        return usage.ri_phys_footprint
    }

    private static func processName(pid: Int32, fallback: String?) -> String {
        var buffer = [CChar](repeating: 0, count: 4096)
        let length = proc_pidpath(pid, &buffer, UInt32(buffer.count))
        if length > 0 {
            let bytes = buffer.prefix(Int(length)).map { UInt8(bitPattern: $0) }
            let path = String(decoding: bytes, as: UTF8.self)
            return (path as NSString).lastPathComponent
        }

        if let fallback, !fallback.isEmpty {
            return fallback
        }

        return "pid \(pid)"
    }
}