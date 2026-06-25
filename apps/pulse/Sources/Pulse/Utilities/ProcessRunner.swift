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
        private let outputHandle: FileHandle
        private let continuation: CheckedContinuation<String, Error>

        init(outputHandle: FileHandle, continuation: CheckedContinuation<String, Error>) {
            self.outputHandle = outputHandle
            self.continuation = continuation
        }

        func complete(with result: Result<String, Error>) {
            lock.lock()
            defer { lock.unlock() }
            guard !didFinish else { return }
            didFinish = true
            outputHandle.closeFile()
            switch result {
            case .success(let output):
                continuation.resume(returning: output)
            case .failure(let error):
                continuation.resume(throwing: error)
            }
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
                let data = outputHandle.readDataToEndOfFile()
                let output = String(data: data, encoding: .utf8) ?? ""
                if proc.terminationStatus == 0 {
                    state.complete(with: .success(output))
                } else {
                    state.complete(with: .failure(RunnerError.nonZeroExit(proc.terminationStatus)))
                }
            }

            do {
                try process.run()
            } catch {
                state.complete(with: .failure(RunnerError.launchFailed))
                return
            }

            DispatchQueue.global(qos: .utility).asyncAfter(deadline: .now() + timeout) {
                guard process.isRunning else { return }
                process.terminate()
                state.complete(with: .failure(RunnerError.timedOut))
            }
        }
    }
}