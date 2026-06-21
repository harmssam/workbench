import SwiftUI

@main
struct SysmonApp: App {
    @StateObject private var appState = AppState()

    var body: some Scene {
        MenuBarExtra {
            PopoverView()
                .environmentObject(appState)
        } label: {
            Text(appState.menuBarLabel)
                .font(.system(size: 11, design: .monospaced))
        }
        .menuBarExtraStyle(.window)
    }
}