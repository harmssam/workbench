import AppKit
import OSLog

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private var appState: AppState?
    private var statusBarController: StatusBarController?

    func applicationDidFinishLaunching(_ notification: Notification) {
        AppLogger.configure()
        CrashReporter.install()

        let ver = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0.2.14"
        AppLogger.info("Pulse launched (version \(ver))", category: AppLogger.general)
        terminateDuplicateInstances()
        NSApp.setActivationPolicy(.accessory)

        let appState = AppState()
        self.appState = appState

        // Start monitoring immediately on launch so metrics/histories begin collecting
        // and the menu bar label can start updating right away (before any popover).
        appState.start()

        statusBarController = StatusBarController(appState: appState)
        InstallPrompt.presentIfNeeded()
    }

    func applicationWillTerminate(_ notification: Notification) {
        AppLogger.info("Pulse is terminating", category: AppLogger.general)

        let restoreGroup = DispatchGroup()
        restoreGroup.enter()
        Task {
            await appState?.restoreFanControlOnExit()
            restoreGroup.leave()
        }
        _ = restoreGroup.wait(timeout: .now() + 3)

        CrashReporter.markCleanShutdown()
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