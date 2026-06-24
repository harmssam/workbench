import Foundation
import OSLog

enum AppLogger {
    static let subsystem = "ca.harms.pulse"
    
    static let general = Logger(subsystem: subsystem, category: "general")
    static let update = Logger(subsystem: subsystem, category: "update")
    static let monitor = Logger(subsystem: subsystem, category: "monitor")
    
    private static let logFileURL: URL = {
        let logsDir = FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Logs/Pulse", isDirectory: true)
        try? FileManager.default.createDirectory(at: logsDir, withIntermediateDirectories: true)
        return logsDir.appendingPathComponent("pulse.log")
    }()
    
    static func log(_ message: String, category: Logger = general, level: OSLogType = .default) {
        category.log(level: level, "\(message)")
        
        // Also append to file for easier user access
        let timestamp = ISO8601DateFormatter().string(from: Date())
        let line = "[\(timestamp)] \(message)\n"
        if let data = line.data(using: .utf8) {
            if let handle = try? FileHandle(forWritingTo: logFileURL) {
                handle.seekToEndOfFile()
                handle.write(data)
                try? handle.close()
            } else {
                try? data.write(to: logFileURL, options: .atomic)
            }
        }
    }
    
    static func error(_ message: String, category: Logger = general) {
        log(message, category: category, level: .error)
    }
    
    static func info(_ message: String, category: Logger = general) {
        log(message, category: category, level: .info)
    }
}