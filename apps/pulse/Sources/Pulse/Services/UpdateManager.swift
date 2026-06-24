import Foundation

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
        let url = URL(string: "https://api.github.com/repos/\(repoOwner)/\(repoName)/releases/latest")!
        var request = URLRequest(url: url)
        request.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
        request.setValue("Pulse/1.0", forHTTPHeaderField: "User-Agent")

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard (response as? HTTPURLResponse)?.statusCode == 200 else { return nil }

            let decoder = JSONDecoder()
            let release = try decoder.decode(GitHubRelease.self, from: data)

            let version = release.tag_name.replacingOccurrences(of: "pulse-v", with: "")
            guard isNewer(version, than: currentVersion) else { return nil }

            // Find the arm64 zip asset
            guard let asset = release.assets.first(where: {
                $0.name.lowercased().contains("arm64") && $0.name.hasSuffix(".zip")
            }) else { return nil }

            return AppUpdate(
                version: version,
                downloadURL: asset.browser_download_url,
                releaseURL: URL(string: release.html_url)!
            )
        } catch {
            // Silently fail for now (rate limits, no internet, etc.)
            return nil
        }
    }

    private func isNewer(_ remote: String, than local: String) -> Bool {
        let remoteParts = remote.split(separator: ".").map { Int($0) ?? 0 }
        let localParts = local.split(separator: ".").map { Int($0) ?? 0 }

        let maxCount = max(remoteParts.count, localParts.count)
        for i in 0..<maxCount {
            let r = i < remoteParts.count ? remoteParts[i] : 0
            let l = i < localParts.count ? localParts[i] : 0
            if r > l { return true }
            if r < l { return false }
        }
        return false
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