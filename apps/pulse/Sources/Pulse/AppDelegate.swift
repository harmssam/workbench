import AppKit
import OSLog

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private var appState: AppState?
    private var statusBarController: StatusBarController?

    func applicationDidFinishLaunching(_ notification: Notification) {
        AppLogger.info("Pulse launched (version \(Bundle.main.infoDictionary?["CFBundleShortVersionString"] ?? "unknown"))", category: AppLogger.general)
        terminateDuplicateInstances()
        NSApp.setActivationPolicy(.accessory)

        let appState = AppState()
        self.appState = appState
        statusBarController = StatusBarController(appState: appState)
        InstallPrompt.presentIfNeeded()
    }

    func applicationWillTerminate(_ notification: Notification) {
        AppLogger.info("Pulse is terminating", category: AppLogger.general)
        statusBarController?.teardown()
    }

    private func terminateDuplicateInstances() {
        let bundleID = Bundle.main.bundleIdentifier ?? "ca.harms.pulse"
        let currentPID = ProcessInfo.processInfo.processIdentifier

        for app in NSRunningApplication.runningApplications(withBundleIdentifier: bundleID) {
            if app.processIdentifier != currentPID {
                app.terminate()
            }
        }
    }
}