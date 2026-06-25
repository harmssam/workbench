import Foundation
import OSLog

struct AppUpdate: Sendable, Equatable {
    let version: String
    let downloadURL: URL
    let releaseURL: URL
}

actor UpdateManager {
    private let repoOwner = "harmssam"
    private let repoName = "workbench"
    private let currentVersion: String

    init(currentVersion: String) {
        self.currentVersion = currentVersion
    }

    func checkForUpdate() async -> AppUpdate? {
        AppLogger.debug("Querying GitHub for latest release...", category: AppLogger.update)
        let url = URL(string: "https://api.github.com/repos/\(repoOwner)/\(repoName)/releases/latest")!
        var request = URLRequest(url: url)
        request.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
        request.setValue("Pulse/1.0", forHTTPHeaderField: "User-Agent")

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let httpResponse = response as? HTTPURLResponse else {
                AppLogger.error("Non-HTTP response from GitHub", category: AppLogger.update)
                return nil
            }
            
            guard httpResponse.statusCode == 200 else {
                AppLogger.error("GitHub returned status \(httpResponse.statusCode)", category: AppLogger.update)
                return nil
            }

            let decoder = JSONDecoder()
            let release = try decoder.decode(GitHubRelease.self, from: data)

            let version = release.tag_name.replacingOccurrences(of: "pulse-v", with: "")
            AppLogger.debug("Latest tag: \(release.tag_name) (parsed \(version))", category: AppLogger.update)
            
            guard VersionComparator.isNewer(version, than: currentVersion) else {
                AppLogger.debug("Current version \(currentVersion) is up to date", category: AppLogger.update)
                return nil
            }

            // Find the arm64 zip asset
            guard let asset = release.assets.first(where: {
                $0.name.lowercased().contains("arm64") && $0.name.hasSuffix(".zip")
            }) else {
                AppLogger.error("No suitable arm64 zip found in release assets", category: AppLogger.update)
                return nil
            }

            AppLogger.debug("Found update asset: \(asset.name)", category: AppLogger.update)
            return AppUpdate(
                version: version,
                downloadURL: asset.browser_download_url,
                releaseURL: URL(string: release.html_url)!
            )
        } catch {
            AppLogger.error("Failed to check for update: \(error)", category: AppLogger.update)
            return nil
        }
    }

}

private struct GitHubRelease: Decodable {
    let tag_name: String
    let html_url: String
    let assets: [GitHubAsset]
}

private struct GitHubAsset: Decodable {
    let name: String
    let browser_download_url: URL
}