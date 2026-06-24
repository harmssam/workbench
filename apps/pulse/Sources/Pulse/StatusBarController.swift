import AppKit
import Combine
import SwiftUI

@MainActor
final class StatusBarController: NSObject, NSPopoverDelegate {
    private let appState: AppState
    private let statusItem: NSStatusItem
    private let popover: NSPopover
    private var cancellables = Set<AnyCancellable>()

    private var lastDisplayedDown = ""
    private var lastDisplayedUp = ""
    private var pendingDownload: UInt64?
    private var pendingUpload: UInt64?

    init(appState: AppState) {
        self.appState = appState
        self.statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        self.popover = NSPopover()
        super.init()
        configureStatusItem()
        configurePopover()
        bindAppState()
        applyLabel(download: appState.downloadRate, upload: appState.uploadRate)
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
        button.toolTip = "Pulse"
        button.appearsDisabled = false
    }

    private func configurePopover() {
        popover.behavior = .transient
        popover.animates = true
        popover.delegate = self

        let rootView = PopoverView(appState: appState)
            .frame(width: PopoverLayout.width)
        let hosting = NSHostingController(rootView: rootView)
        let fittingSize = hosting.sizeThatFits(
            in: NSSize(width: PopoverLayout.width, height: CGFloat.greatestFiniteMagnitude)
        )
        popover.contentViewController = hosting
        popover.contentSize = NSSize(width: PopoverLayout.width, height: fittingSize.height)
    }

    private func bindAppState() {
        appState.$downloadRate
            .combineLatest(appState.$uploadRate)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] download, upload in
                self?.scheduleLabelUpdate(download: download, upload: upload)
            }
            .store(in: &cancellables)
    }

    private func scheduleLabelUpdate(download: UInt64, upload: UInt64) {
        if popover.isShown {
            pendingDownload = download
            pendingUpload = upload
            return
        }
        applyLabel(download: download, upload: upload)
    }

    private func applyLabel(download: UInt64, upload: UInt64) {
        guard statusItem.button != nil else { return }

        let down = ByteFormatter.formatMenuBarMbps(bytesPerSecond: download)
        let up = ByteFormatter.formatMenuBarMbps(bytesPerSecond: upload)
        guard down != lastDisplayedDown || up != lastDisplayedUp else { return }

        lastDisplayedDown = down
        lastDisplayedUp = up
        statusItem.button?.image = MenuBarLabelRenderer.render(download: download, upload: upload)

        // Force the status item to recalculate its width. This ensures the menu bar
        // label visibly updates/resizes immediately when values change (e.g. from "0"
        // to real Mbps). Without this, updates can appear stuck until the popover
        // is opened (which triggers menu bar re-layout).
        statusItem.length = NSStatusItem.variableLength
    }

    private func flushPendingLabelUpdate() {
        guard let download = pendingDownload, let upload = pendingUpload else { return }
        pendingDownload = nil
        pendingUpload = nil
        applyLabel(download: download, upload: upload)
    }

    func popoverDidClose(_ notification: Notification) {
        flushPendingLabelUpdate()
    }

    @objc private func togglePopover() {
        guard let button = statusItem.button else { return }

        if popover.isShown {
            popover.performClose(self)
            return
        }

        NSApp.activate(ignoringOtherApps: true)
        appState.checkForUpdatesIfStale()
        popover.show(relativeTo: button.bounds, of: button, preferredEdge: .minY)
    }
}