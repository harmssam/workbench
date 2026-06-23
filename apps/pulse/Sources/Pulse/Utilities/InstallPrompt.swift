import AppKit

enum InstallPrompt {
    @MainActor
    static func presentIfNeeded() {
        guard InstallLocationChecker.shouldRecommendApplicationsInstall(
            bundleURL: Bundle.main.bundleURL
        ) else {
            return
        }

        let alert = NSAlert()
        alert.messageText = "Install Pulse to Applications"
        alert.informativeText = """
        Pulse is running from a build folder. For Login Items and everyday use, copy Pulse.app to /Applications first:

        cp -r "\(Bundle.main.bundleURL.path)" /Applications/
        """
        alert.alertStyle = .informational
        alert.addButton(withTitle: "Show in Finder")
        alert.addButton(withTitle: "OK")

        NSApp.setActivationPolicy(.regular)
        NSApp.activate(ignoringOtherApps: true)

        let response = alert.runModal()
        NSApp.setActivationPolicy(.accessory)

        if response == .alertFirstButtonReturn {
            NSWorkspace.shared.activateFileViewerSelecting([Bundle.main.bundleURL])
        }
    }
}