import Foundation

enum UpdateExtractor {
    enum ExtractError: LocalizedError {
        case extractionFailed(Int32)
        case appNotFound

        var errorDescription: String? {
            switch self {
            case .extractionFailed(let code):
                return "Failed to extract update (exit \(code))"
            case .appNotFound:
                return "Extracted app not found"
            }
        }
    }

    private static let extractTimeout: TimeInterval = 120

    static func extract(zipURL: URL, to directory: URL) async throws -> URL {
        AppLogger.info("Extracting \(zipURL.path) to \(directory.path)", category: AppLogger.update)

        // ditto handles archives created by ditto -c -k in CI; more reliable than unzip here.
        _ = try await ProcessRunner.run(
            executable: "/usr/bin/ditto",
            arguments: ["-x", "-k", zipURL.path, directory.path],
            timeout: extractTimeout
        )

        if let appURL = findAppBundle(named: "Pulse.app", in: directory) {
            AppLogger.info("Found extracted app at \(appURL.path)", category: AppLogger.update)
            return appURL
        }

        let listing = (try? FileManager.default.contentsOfDirectory(atPath: directory.path)) ?? []
        AppLogger.error("Extracted app not found. Directory contents: \(listing.joined(separator: ", "))", category: AppLogger.update)
        throw ExtractError.appNotFound
    }

    static func findAppBundle(named name: String, in directory: URL) -> URL? {
        let direct = directory.appendingPathComponent(name)
        if FileManager.default.fileExists(atPath: direct.path) {
            return direct
        }

        guard let enumerator = FileManager.default.enumerator(
            at: directory,
            includingPropertiesForKeys: [.isDirectoryKey],
            options: [.skipsHiddenFiles]
        ) else {
            return nil
        }

        for case let url as URL in enumerator {
            guard url.lastPathComponent == name else { continue }
            var isDirectory = ObjCBool(false)
            guard FileManager.default.fileExists(atPath: url.path, isDirectory: &isDirectory), isDirectory.boolValue else {
                continue
            }
            return url
        }

        return nil
    }
}