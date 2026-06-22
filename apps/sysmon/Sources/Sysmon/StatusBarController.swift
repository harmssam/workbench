import AppKit
import Combine
import SwiftUI

@MainActor
final class StatusBarController: NSObject {
    private let appState: AppState
    private let statusItem: NSStatusItem
    private let popover: NSPopover
    private var cancellables = Set<AnyCancellable>()

    private let popoverWidth: CGFloat = 320
    private let popoverHeight: CGFloat = 534

    init(appState: AppState) {
        self.appState = appState
        self.statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        self.popover = NSPopover()
        super.init()
        configureStatusItem()
        configurePopover()
        bindAppState()
        updateLabel(download: appState.downloadRate, upload: appState.uploadRate)
    }

    func teardown() {
        if popover.isShown {
            popover.performClose(self)
        }
        NSStatusBar.system.removeStatusItem(statusItem)
    }

    private func configureStatusItem() {
        guard let button = statusItem.button else { return }

        button.action = #selector(togglePopover)
        button.target = self
        button.sendAction(on: [.leftMouseUp, .rightMouseUp])
        button.imagePosition = .imageOnly
        button.toolTip = "Sysmon"
        button.appearsDisabled = false
    }

    private func configurePopover() {
        popover.behavior = .transient
        popover.animates = true
        popover.contentSize = NSSize(width: popoverWidth, height: popoverHeight)
        popover.contentViewController = NSHostingController(
            rootView: PopoverView(appState: appState)
                .frame(width: popoverWidth, height: popoverHeight)
        )
    }

    private func bindAppState() {
        appState.$downloadRate
            .combineLatest(appState.$uploadRate)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] download, upload in
                self?.updateLabel(download: download, upload: upload)
            }
            .store(in: &cancellables)
    }

    private func updateLabel(download: UInt64, upload: UInt64) {
        guard let button = statusItem.button else { return }

        button.image = MenuBarLabelRenderer.render(download: download, upload: upload)
    }

    @objc private func togglePopover() {
        guard let button = statusItem.button else { return }

        if popover.isShown {
            popover.performClose(self)
            return
        }

        NSApp.activate(ignoringOtherApps: true)
        popover.show(relativeTo: button.bounds, of: button, preferredEdge: .minY)
        popover.contentViewController?.view.window?.makeKey()
    }
}