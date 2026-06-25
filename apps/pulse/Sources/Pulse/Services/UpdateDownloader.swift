import Foundation

enum UpdateDownloader {
    enum DownloadError: LocalizedError {
        case badHTTPStatus(Int)
        case emptyFile
        case invalidArchive

        var errorDescription: String? {
            switch self {
            case .badHTTPStatus(let code):
                return "Download failed (HTTP \(code))"
            case .emptyFile:
                return "Downloaded file is empty"
            case .invalidArchive:
                return "Downloaded file is not a valid zip archive"
            }
        }
    }

    private static let downloadTimeout: TimeInterval = 600
    private static let chunkSize = 65_536

    static func download(
        from url: URL,
        to destination: URL,
        onProgress: @escaping @Sendable (Double?) async -> Void
    ) async throws {
        var request = URLRequest(url: url)
        request.timeoutInterval = downloadTimeout
        let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "unknown"
        request.setValue("Pulse/\(version)", forHTTPHeaderField: "User-Agent")

        let (bytes, response) = try await URLSession.shared.bytes(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw DownloadError.badHTTPStatus(-1)
        }
        guard (200...299).contains(httpResponse.statusCode) else {
            throw DownloadError.badHTTPStatus(httpResponse.statusCode)
        }

        let expectedSize = httpResponse.value(forHTTPHeaderField: "Content-Length").flatMap(Int64.init)
        if let expectedSize {
            AppLogger.debug("Download size: \(expectedSize) bytes", category: AppLogger.update)
        } else {
            AppLogger.debug("Download size unknown (no Content-Length)", category: AppLogger.update)
        }

        if FileManager.default.fileExists(atPath: destination.path) {
            try FileManager.default.removeItem(at: destination)
        }

        FileManager.default.createFile(atPath: destination.path, contents: nil)
        let handle = try FileHandle(forWritingTo: destination)
        defer { try? handle.close() }

        var received: Int64 = 0
        var buffer = [UInt8]()
        buffer.reserveCapacity(chunkSize)

        for try await byte in bytes {
            try Task.checkCancellation()
            buffer.append(byte)
            received += 1

            if buffer.count >= chunkSize {
                try handle.write(contentsOf: buffer)
                buffer.removeAll(keepingCapacity: true)
            }

            if let expectedSize, expectedSize > 0, received % max(expectedSize / 50, 1) == 0 {
                await onProgress(Double(received) / Double(expectedSize))
            }
        }

        if !buffer.isEmpty {
            try handle.write(contentsOf: buffer)
        }

        if received == 0 {
            throw DownloadError.emptyFile
        }

        try validateZip(at: destination)
        await onProgress(1.0)
        AppLogger.debug("Download complete: \(received) bytes written to \(destination.path)", category: AppLogger.update)
    }

    static func validateZip(at url: URL) throws {
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }

        guard let header = try handle.read(upToCount: 4), header.count == 4 else {
            throw DownloadError.invalidArchive
        }

        // ZIP local file header signature: PK\x03\x04
        guard header[0] == 0x50, header[1] == 0x4B, header[2] == 0x03, header[3] == 0x04 else {
            AppLogger.error("Invalid zip header: \(header.map { String(format: "%02x", $0) }.joined())", category: AppLogger.update)
            throw DownloadError.invalidArchive
        }
    }
}