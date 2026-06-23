import Foundation

enum InstallLocationChecker {
    static func isApplicationsDirectory(_ path: String) -> Bool {
        let normalized = URL(fileURLWithPath: path).standardized.path
        let directories = [
            "/Applications",
            FileManager.default.homeDirectoryForCurrentUser
                .appendingPathComponent("Applications")
                .standardized
                .path
        ]
        return directories.contains(normalized)
    }

    static func shouldRecommendApplicationsInstall(bundleURL: URL?) -> Bool {
        guard let bundleURL else { return false }
        guard bundleURL.pathExtension == "app" else { return false }
        return !isApplicationsDirectory(bundleURL.deletingLastPathComponent().path)
    }
}