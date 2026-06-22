import Foundation
import IOKit

actor GPUMonitor {
    func sample() -> GPUSnapshot {
        let accelerators = readAccelerators()
        return GPUPerformanceParser.selectPrimary(from: accelerators) ?? .unavailable
    }

    private func readAccelerators() -> [ParsedAccelerator] {
        let match = IOServiceMatching("IOAccelerator")
        var iterator: io_iterator_t = 0
        guard IOServiceGetMatchingServices(kIOMainPortDefault, match, &iterator) == KERN_SUCCESS else {
            return []
        }
        defer { IOObjectRelease(iterator) }

        var accelerators: [ParsedAccelerator] = []

        var service = IOIteratorNext(iterator)
        while service != 0 {
            defer {
                IOObjectRelease(service)
                service = IOIteratorNext(iterator)
            }

            guard let ioClass = ioRegistryString(service, key: "IOClass") else { continue }
            guard let statistics = ioRegistryDictionary(service, key: "PerformanceStatistics") else { continue }

            accelerators.append(GPUPerformanceParser.parse(ioClass: ioClass, statistics: statistics))
        }

        return accelerators
    }

    private func ioRegistryString(_ service: io_registry_entry_t, key: String) -> String? {
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

    private func ioRegistryDictionary(_ service: io_registry_entry_t, key: String) -> [String: Any]? {
        guard let value = IORegistryEntryCreateCFProperty(
            service,
            key as CFString,
            kCFAllocatorDefault,
            0
        )?.takeRetainedValue() else {
            return nil
        }
        return value as? [String: Any]
    }
}