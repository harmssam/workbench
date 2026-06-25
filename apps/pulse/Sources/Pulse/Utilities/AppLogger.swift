import Foundation
import OSLog

enum AppLogger {
    static let subsystem = "ca.harms.pulse"

    static let general = Logger(subsystem: subsystem, category: "general")
    static let update = Logger(subsystem: subsystem, category: "update")
    static let monitor = Logger(subsystem: subsystem, category: "monitor")

    static let logFileURL: URL = {
        let logsDir = FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Logs/Pulse", isDirectory: true)
        try? FileManager.default.createDirectory(at: logsDir, withIntermediateDirectories: true)
        return logsDir.appendingPathComponent("pulse.log")
    }()

    private static let levelLock = OSAllocatedUnfairLock(initialState: LogLevel.loadSaved())

    static var minimumLevel: LogLevel {
        get { levelLock.withLock { $0 } }
        set {
            levelLock.withLock { $0 = newValue }
            LogLevel.save(newValue)
        }
    }

    static var isDebugEnabled: Bool {
        minimumLevel <= .debug
    }

    static func configure() {
        minimumLevel = LogLevel.loadSaved()
    }

    static func shouldLog(_ level: LogLevel) -> Bool {
        if level == .error { return true }
        return level >= minimumLevel
    }

    static func log(_ message: String, category: Logger = general, level: LogLevel) {
        guard shouldLog(level) else { return }

        let osLevel: OSLogType = switch level {
        case .debug: .debug
        case .info: .info
        case .warning: .default
        case .error: .error
        }

        category.log(level: osLevel, "\(message)")
        appendToFile(message)
    }

    static func debug(_ message: String, category: Logger = general) {
        log(message, category: category, level: .debug)
    }

    static func info(_ message: String, category: Logger = general) {
        log(message, category: category, level: .info)
    }

    static func warning(_ message: String, category: Logger = general) {
        log(message, category: category, level: .warning)
    }

    static func error(_ message: String, category: Logger = general) {
        log(message, category: category, level: .error)
    }

    private static func appendToFile(_ message: String) {
        let timestamp = ISO8601DateFormatter().string(from: Date())
        let line = "[\(timestamp)] \(message)\n"
        guard let data = line.data(using: .utf8) else { return }

        if let handle = try? FileHandle(forWritingTo: logFileURL) {
            handle.seekToEndOfFile()
            handle.write(data)
            try? handle.close()
        } else {
            try? data.write(to: logFileURL, options: .atomic)
        }
    }
}