import SwiftUI

@main
struct SysmonApp: App {
    @StateObject private var appState = AppState()

    private let popoverSize = CGSize(width: 320, height: 534)

    var body: some Scene {
        MenuBarExtra {
            PopoverView(appState: appState)
                .frame(width: popoverSize.width, height: popoverSize.height)
                .fixedSize()
        } label: {
            MenuBarLabelImageView(
                downloadRate: appState.downloadRate,
                uploadRate: appState.uploadRate
            )
        }
        .menuBarExtraStyle(.window)
    }
}