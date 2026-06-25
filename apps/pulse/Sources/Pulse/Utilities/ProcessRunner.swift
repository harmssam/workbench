import Foundation

enum ProcessRunner {
    enum RunnerError: Error {
        case launchFailed
        case timedOut
        case nonZeroExit(Int32)
    }

    private final class FinishState: @unchecked Sendable {
        private let lock = NSLock()
        private var didFinish = false
        private var timedOut = false
        private let outputHandle: FileHandle
        private let continuation: CheckedContinuation<String, Error>

        init(outputHandle: FileHandle, continuation: CheckedContinuation<String, Error>) {
            self.outputHandle = outputHandle
            self.continuation = continuation
        }

        func markTimedOut() {
            lock.lock()
            timedOut = true
            lock.unlock()
        }

        func finish(terminationStatus: Int32) {
            lock.lock()
            defer { lock.unlock() }
            guard !didFinish else { return }
            didFinish = true

            // readToEnd() can fail if the child exits before we read; never crash the app.
            let output = (try? outputHandle.readToEnd()).flatMap { String(data: $0, encoding: .utf8) } ?? ""
            outputHandle.closeFile()

            if timedOut {
                continuation.resume(throwing: RunnerError.timedOut)
            } else if terminationStatus == 0 {
                continuation.resume(returning: output)
            } else {
                continuation.resume(throwing: RunnerError.nonZeroExit(terminationStatus))
            }
        }

        func fail(_ error: Error) {
            lock.lock()
            defer { lock.unlock() }
            guard !didFinish else { return }
            didFinish = true
            outputHandle.closeFile()
            continuation.resume(throwing: error)
        }
    }

    static func run(
        executable: String,
        arguments: [String] = [],
        timeout: TimeInterval = 5
    ) async throws -> String {
        try await withCheckedThrowingContinuation { continuation in
            let process = Process()
            let pipe = Pipe()
            let outputHandle = pipe.fileHandleForReading

            process.executableURL = URL(fileURLWithPath: executable)
            process.arguments = arguments
            process.standardOutput = pipe
            process.standardError = FileHandle.nullDevice

            let state = FinishState(outputHandle: outputHandle, continuation: continuation)

            process.terminationHandler = { proc in
                state.finish(terminationStatus: proc.terminationStatus)
            }

            do {
                try process.run()
            } catch {
                state.fail(RunnerError.launchFailed)
                return
            }

            DispatchQueue.global(qos: .utility).asyncAfter(deadline: .now() + timeout) {
                guard process.isRunning else { return }
                state.markTimedOut()
                process.terminate()
            }
        }
    }
}