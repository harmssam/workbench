import Foundation

enum ProcessRunner {
    enum RunnerError: Error {
        case launchFailed
        case timedOut
        case nonZeroExit(Int32)
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

            DispatchQueue.global(qos: .utility).asyncAfter(deadline: deadline) {
                if process.isRunning {
                    process.terminate()
                    continuation.resume(throwing: RunnerError.timedOut)
                }
            }

            process.terminationHandler = { proc in
                guard proc.terminationStatus == 0 else {
                    continuation.resume(throwing: RunnerError.nonZeroExit(proc.terminationStatus))
                    return
                }

                let data = pipe.fileHandleForReading.readDataToEndOfFile()
                let output = String(data: data, encoding: .utf8) ?? ""
                continuation.resume(returning: output)
            }
        }
    }
}