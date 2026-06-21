import AppKit

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private var appState: AppState?
    private var statusBarController: StatusBarController?

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)

        let appState = AppState()
        self.appState = appState
        statusBarController = StatusBarController(appState: appState)
    }

    func applicationWillTerminate(_ notification: Notification) {
        statusBarController?.teardown()
    }
}