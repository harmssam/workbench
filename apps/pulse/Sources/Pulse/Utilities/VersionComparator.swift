import Foundation

enum VersionComparator {
    static func isNewer(_ remote: String, than local: String) -> Bool {
        let cleanRemote = remote
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "v", with: "", options: .caseInsensitive)
        let cleanLocal = local
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "v", with: "", options: .caseInsensitive)

        let remoteParts = cleanRemote.split(separator: ".").map { Int($0) ?? 0 }
        let localParts = cleanLocal.split(separator: ".").map { Int($0) ?? 0 }

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