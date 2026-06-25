import Foundation

enum InstallLocationChecker {
    static let updatingLaunchArgument = "--pulse-updating"

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

    static func isUpdateStagingBundle(_ bundleURL: URL) -> Bool {
        let parent = bundleURL.deletingLastPathComponent().standardized.path
        let tempRoot = FileManager.default.temporaryDirectory.standardized.path
        guard parent.hasPrefix(tempRoot) else { return false }
        return parent.contains("PulseUpdate-")
    }

    static func shouldRecommendApplicationsInstall(bundleURL: URL?) -> Bool {
        guard let bundleURL else { return false }
        guard bundleURL.pathExtension == "app" else { return false }
        if ProcessInfo.processInfo.arguments.contains(updatingLaunchArgument) {
            return false
        }
        if isUpdateStagingBundle(bundleURL) {
            return false
        }
        return !isApplicationsDirectory(bundleURL.deletingLastPathComponent().path)
    }
}