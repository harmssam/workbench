import Darwin
import Foundation
import os

enum CrashReporter {
    private static let crashLogPath: String = {
        let logsDir = FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Logs/Pulse", isDirectory: true)
        try? FileManager.default.createDirectory(at: logsDir, withIntermediateDirectories: true)
        return logsDir.appendingPathComponent("pulse.log").path
    }()

    private static let sessionMarkerPath: String = {
        let logsDir = FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Logs/Pulse", isDirectory: true)
        return logsDir.appendingPathComponent(".last-session").path
    }()

    private static let breadcrumbLock = OSAllocatedUnfairLock(initialState: "startup")

    /// Fixed buffer copied on each breadcrumb for async-signal-safe reads in the handler.
    private static let crashBreadcrumbCapacity = 512
    nonisolated(unsafe) private static var crashBreadcrumb = [UInt8](repeating: 0, count: crashBreadcrumbCapacity)

    nonisolated(unsafe) private static var installed = false

    static func breadcrumb(_ message: String) {
        breadcrumbLock.withLock { state in
            state = message
        }
        updateCrashBreadcrumbBuffer(message)
        appendBreadcrumbToLog(message)
    }

    static func install() {
        guard !installed else { return }
        installed = true

        logAbnormalPreviousSessionIfNeeded()
        markSessionStart()

        NSSetUncaughtExceptionHandler(exceptionHandler)
        installSignalHandler(SIGABRT)
        installSignalHandler(SIGSEGV)
        installSignalHandler(SIGBUS)
        installSignalHandler(SIGILL)
        installSignalHandler(SIGFPE)
        installSignalHandler(SIGTRAP)
    }

    static func markCleanShutdown() {
        try? FileManager.default.removeItem(atPath: sessionMarkerPath)
    }

    private static func updateCrashBreadcrumbBuffer(_ message: String) {
        let utf8 = Array(message.utf8.prefix(crashBreadcrumbCapacity - 1))
        crashBreadcrumb.withUnsafeMutableBufferPointer { buffer in
            guard let base = buffer.baseAddress else { return }
            for i in 0..<buffer.count {
                base[i] = 0
            }
            for (i, byte) in utf8.enumerated() {
                base[i] = byte
            }
        }
    }

    private static func appendBreadcrumbToLog(_ message: String) {
        guard AppLogger.isDebugEnabled else { return }
        AppLogger.debug("BC: \(message)")
    }

    private static func logAbnormalPreviousSessionIfNeeded() {
        guard FileManager.default.fileExists(atPath: sessionMarkerPath) else { return }
        AppLogger.error(
            "Previous Pulse session ended abnormally (no clean shutdown). The app may have crashed or been force-quit.",
            category: AppLogger.general
        )
    }

    private static func markSessionStart() {
        let marker = "started:\(ISO8601DateFormatter().string(from: Date()))\n"
        try? marker.write(toFile: sessionMarkerPath, atomically: true, encoding: .utf8)
    }

    private static let exceptionHandler: @convention(c) (NSException) -> Void = { exception in
        let stack = exception.callStackSymbols.joined(separator: "\n")
        let message = """
        FATAL: Uncaught exception \(exception.name.rawValue)
        Reason: \(exception.reason ?? "unknown")
        User info: \(exception.userInfo ?? [:])
        Stack trace:
        \(stack)
        """
        AppLogger.error(message, category: AppLogger.general)
        CrashReporter.signalSafeWrite(message)
    }

    private static func installSignalHandler(_ sig: Int32) {
        signal(sig, signalHandler)
    }

    private static let signalHandler: @convention(c) (Int32) -> Void = { sig in
        let name = signalName(sig)
        let context = CrashReporter.signalSafeBreadcrumb()
        CrashReporter.signalSafeWrite(
            "FATAL: Signal \(name) (\(sig)) received\nLast breadcrumb: \(context)\n"
        )
        signal(sig, SIG_DFL)
        raise(sig)
    }

    private static func signalSafeBreadcrumb() -> String {
        crashBreadcrumb.withUnsafeBufferPointer { buffer in
            guard let base = buffer.baseAddress else { return "unknown" }
            let length = strnlen(base, buffer.count)
            let bytes = UnsafeRawBufferPointer(start: base, count: length)
            return String(decoding: bytes, as: UTF8.self)
        }
    }

    private static func signalName(_ sig: Int32) -> String {
        switch sig {
        case SIGABRT: return "SIGABRT"
        case SIGSEGV: return "SIGSEGV"
        case SIGBUS: return "SIGBUS"
        case SIGILL: return "SIGILL"
        case SIGFPE: return "SIGFPE"
        case SIGTRAP: return "SIGTRAP"
        default: return "SIGNAL"
        }
    }

    /// Async-signal-safe write for use from signal handlers.
    private static func signalSafeWrite(_ message: String) {
        let timestamp = ISO8601DateFormatter().string(from: Date())
        let line = "[\(timestamp)] \(message)\n"
        guard let data = line.data(using: .utf8) else { return }

        let fd = open(crashLogPath, O_WRONLY | O_CREAT | O_APPEND, S_IRUSR | S_IWUSR)
        guard fd >= 0 else { return }
        defer { close(fd) }

        data.withUnsafeBytes { buffer in
            guard let base = buffer.baseAddress else { return }
            _ = write(fd, base, buffer.count)
        }
        fsync(fd)
    }
}