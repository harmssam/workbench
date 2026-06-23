import Foundation
import Testing
@testable import Pulse

@Suite("Install location")
struct InstallLocationCheckerTests {
    @Test("Recognizes system and user Applications folders")
    func applicationsDirectories() {
        let userApplications = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Applications")
            .standardized
            .path

        #expect(InstallLocationChecker.isApplicationsDirectory("/Applications"))
        #expect(InstallLocationChecker.isApplicationsDirectory(userApplications))
        #expect(!InstallLocationChecker.isApplicationsDirectory("/Users/sam/dist"))
        #expect(!InstallLocationChecker.isApplicationsDirectory("/Users/sam/_github_repos/workbench/apps/pulse/dist"))
    }

    @Test("Recommends install when app bundle is outside Applications")
    func recommendsInstallOutsideApplications() {
        let distURL = URL(fileURLWithPath: "/Users/sam/workbench/apps/pulse/dist/Pulse.app")
        #expect(InstallLocationChecker.shouldRecommendApplicationsInstall(bundleURL: distURL))

        let installedURL = URL(fileURLWithPath: "/Applications/Pulse.app")
        #expect(!InstallLocationChecker.shouldRecommendApplicationsInstall(bundleURL: installedURL))
    }

    @Test("Skips recommendation for non-app bundles")
    func skipsNonAppBundles() {
        let binaryURL = URL(fileURLWithPath: "/Users/sam/.build/debug/Pulse")
        #expect(!InstallLocationChecker.shouldRecommendApplicationsInstall(bundleURL: binaryURL))
    }
}