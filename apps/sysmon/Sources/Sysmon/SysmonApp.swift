import SwiftUI

@main
struct SysmonApp: App {
    @StateObject private var appState = AppState()

    var body: some Scene {
        MenuBarExtra {
            PopoverView()
                .environmentObject(appState)
        } label: {
            MenuBarLabelImageView(
                downloadRate: appState.downloadRate,
                uploadRate: appState.uploadRate
            )
        }
        .menuBarExtraStyle(.window)
    }
}