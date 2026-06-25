import Foundation
import Testing
@testable import Pulse

@Suite("Log level", .serialized)
struct LogLevelTests {
    @Test("Defaults to info when unset")
    func defaultLevel() {
        UserDefaults.standard.removeObject(forKey: LogLevel.storageKey)
        #expect(LogLevel.loadSaved() == .info)
        LogLevel.save(.info)
    }

    @Test("Round-trips through UserDefaults")
    func persistence() {
        LogLevel.save(.debug)
        #expect(LogLevel.loadSaved() == .debug)
        LogLevel.save(.info)
        #expect(LogLevel.loadSaved() == .info)
    }

    @Test("Filters messages below minimum level")
    func filtering() {
        AppLogger.minimumLevel = .info
        #expect(AppLogger.shouldLog(.debug) == false)
        #expect(AppLogger.shouldLog(.info) == true)
        #expect(AppLogger.shouldLog(.warning) == true)
        #expect(AppLogger.shouldLog(.error) == true)
        AppLogger.minimumLevel = .info
    }

    @Test("Error-only mode suppresses lower levels")
    func errorOnlyMode() {
        AppLogger.minimumLevel = .error
        #expect(AppLogger.shouldLog(.debug) == false)
        #expect(AppLogger.shouldLog(.info) == false)
        #expect(AppLogger.shouldLog(.error) == true)
        AppLogger.minimumLevel = .info
    }
}