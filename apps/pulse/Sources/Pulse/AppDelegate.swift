import AppKit

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private var appState: AppState?
    private var statusBarController: StatusBarController?

    func applicationDidFinishLaunching(_ notification: Notification) {
        terminateDuplicateInstances()
        NSApp.setActivationPolicy(.accessory)

        let appState = AppState()
        self.appState = appState
        statusBarController = StatusBarController(appState: appState)
        InstallPrompt.presentIfNeeded()
    }

    func applicationWillTerminate(_ notification: Notification) {
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