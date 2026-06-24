import Foundation

enum ProcessRunner {
    enum RunnerError: Error {
        case launchFailed
        case timedOut
        case nonZeroExit(Int32)
    }

    private class ResumeState: @unchecked Sendable {
        private let lock = NSLock()
        private var didResume = false

        func resumeOnce(_ action: () -> Void) {
            lock.lock()
            defer { lock.unlock() }
            if !didResume {
                didResume = true
                action()
            }
        }
    }

    static func run(
        executable: String,
        arguments: [String] = [],
        timeout: TimeInterval = 5
    ) async throws -> String {
        let process = Process()
        let pipe = Pipe()

        process.executableURL = URL(fileURLWithPath: executable)
        process.arguments = arguments
        process.standardOutput = pipe
        process.standardError = FileHandle.nullDevice

        try process.run()

        return try await withCheckedThrowingContinuation { continuation in
            let deadline = DispatchTime.now() + timeout

            let state = ResumeState()

            DispatchQueue.global(qos: .utility).asyncAfter(deadline: deadline) {
                if process.isRunning {
                    process.terminate()
                    state.resumeOnce {
                        continuation.resume(throwing: RunnerError.timedOut)
                    }
                }
            }

            process.terminationHandler = { proc in
                if proc.terminationStatus == 0 {
                    let data = pipe.fileHandleForReading.readDataToEndOfFile()
                    let output = String(data: data, encoding: .utf8) ?? ""
                    state.resumeOnce {
                        continuation.resume(returning: output)
                    }
                } else {
                    state.resumeOnce {
                        continuation.resume(throwing: RunnerError.nonZeroExit(proc.terminationStatus))
                    }
                }
            }
        }
    }
}