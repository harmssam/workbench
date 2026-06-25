import Foundation

enum LogLevel: Int, CaseIterable, Comparable, Codable, Sendable {
    case debug = 0
    case info = 1
    case warning = 2
    case error = 3

    static let storageKey = "logLevel"
    static let `default`: LogLevel = .info

    var label: String {
        switch self {
        case .debug: return "Debug"
        case .info: return "Info"
        case .warning: return "Warning"
        case .error: return "Error"
        }
    }

    var detail: String {
        switch self {
        case .debug: return "Verbose diagnostics, breadcrumbs, and monitor traces"
        case .info: return "Launches, updates, and notable events"
        case .warning: return "Warnings only"
        case .error: return "Errors and crashes only"
        }
    }

    static func < (lhs: LogLevel, rhs: LogLevel) -> Bool {
        lhs.rawValue < rhs.rawValue
    }

    static func loadSaved() -> LogLevel {
        guard UserDefaults.standard.object(forKey: storageKey) != nil else {
            return .default
        }
        let raw = UserDefaults.standard.integer(forKey: storageKey)
        return LogLevel(rawValue: raw) ?? .default
    }

    static func save(_ level: LogLevel) {
        UserDefaults.standard.set(level.rawValue, forKey: storageKey)
    }
}