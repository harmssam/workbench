import Foundation
import os

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
        try await ProcessRunnerGate.shared.run(
            executable: executable,
            arguments: arguments,
            timeout: timeout
        )
    }
}

/// Serializes all subprocess I/O. Concurrent `Process` + `Pipe` usage intermittently SIGTRAP'd
/// when long-running tools like nettop completed alongside short `ps`/`netstat` invocations.
private actor ProcessRunnerGate {
    static let shared = ProcessRunnerGate()

    private var permitAvailable = true
    private var waitQueue: [CheckedContinuation<Void, Never>] = []

    func run(
        executable: String,
        arguments: [String],
        timeout: TimeInterval
    ) async throws -> String {
        await acquirePermit()
        defer { releasePermit() }
        return try await execute(
            executable: executable,
            arguments: arguments,
            timeout: timeout
        )
    }

    private func acquirePermit() async {
        if permitAvailable {
            permitAvailable = false
            return
        }
        await withCheckedContinuation { continuation in
            waitQueue.append(continuation)
        }
    }

    private func releasePermit() {
        if let next = waitQueue.first {
            waitQueue.removeFirst()
            next.resume()
        } else {
            permitAvailable = true
        }
    }

    private func execute(
        executable: String,
        arguments: [String],
        timeout: TimeInterval
    ) async throws -> String {
        try await withCheckedThrowingContinuation { continuation in
            let process = Process()
            let pipe = Pipe()
            let outputHandle = pipe.fileHandleForReading
            let output = OutputCollector()

            let state = RunState(
                outputHandle: outputHandle,
                output: output,
                continuation: continuation
            )

            process.executableURL = URL(fileURLWithPath: executable)
            process.arguments = arguments
            process.standardOutput = pipe
            process.standardError = FileHandle.nullDevice

            outputHandle.readabilityHandler = { handle in
                let chunk = handle.availableData
                guard !chunk.isEmpty else { return }
                output.append(chunk)
            }

            process.terminationHandler = { proc in
                proc.terminationHandler = nil
                state.finish(terminationStatus: proc.terminationStatus)
            }

            do {
                try process.run()
            } catch {
                state.fail(ProcessRunner.RunnerError.launchFailed)
                return
            }

            let work = DispatchWorkItem {
                guard process.isRunning else { return }
                state.markTimedOut()
                process.terminate()
            }
            state.setTimeoutWork(work)
            DispatchQueue.global(qos: .utility).asyncAfter(deadline: .now() + timeout, execute: work)
        }
    }
}

private struct FinishRecord {
    var didFinish = false
    var timedOut = false
}

private final class RunState: @unchecked Sendable {
    private let finishLock = OSAllocatedUnfairLock(initialState: FinishRecord())
    private let outputHandle: FileHandle
    private let output: OutputCollector
    private let continuation: CheckedContinuation<String, Error>
    private var timeoutWork: DispatchWorkItem?

    init(
        outputHandle: FileHandle,
        output: OutputCollector,
        continuation: CheckedContinuation<String, Error>
    ) {
        self.outputHandle = outputHandle
        self.output = output
        self.continuation = continuation
    }

    func setTimeoutWork(_ work: DispatchWorkItem) {
        timeoutWork = work
    }

    func markTimedOut() {
        finishLock.withLock { $0.timedOut = true }
    }

    func finish(terminationStatus: Int32) {
        let context = finishLock.withLock { state -> (Bool, Bool) in
            guard !state.didFinish else { return (false, state.timedOut) }
            state.didFinish = true
            return (true, state.timedOut)
        }
        guard context.0 else { return }

        timeoutWork?.cancel()
        outputHandle.readabilityHandler = nil
        if let remaining = try? outputHandle.readToEnd(), !remaining.isEmpty {
            output.append(remaining)
        }
        outputHandle.closeFile()

        if context.1 {
            continuation.resume(throwing: ProcessRunner.RunnerError.timedOut)
        } else if terminationStatus == 0 {
            continuation.resume(returning: output.stringValue)
        } else {
            continuation.resume(throwing: ProcessRunner.RunnerError.nonZeroExit(terminationStatus))
        }
    }

    func fail(_ error: Error) {
        let shouldResume = finishLock.withLock { state -> Bool in
            guard !state.didFinish else { return false }
            state.didFinish = true
            return true
        }
        guard shouldResume else { return }

        timeoutWork?.cancel()
        outputHandle.readabilityHandler = nil
        outputHandle.closeFile()
        continuation.resume(throwing: error)
    }
}

private final class OutputCollector: @unchecked Sendable {
    private let lock = NSLock()
    private var data = Data()

    func append(_ chunk: Data) {
        lock.lock()
        defer { lock.unlock() }
        data.append(chunk)
    }

    var stringValue: String {
        lock.lock()
        defer { lock.unlock() }
        return String(data: data, encoding: .utf8) ?? ""
    }
}