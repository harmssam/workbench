import AppKit
import Combine
import SwiftUI

@MainActor
final class StatusBarController: NSObject {
    private let appState: AppState
    private let statusItem: NSStatusItem
    private let popover: NSPopover
    private var cancellables = Set<AnyCancellable>()

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
        NSStatusBar.system.removeStatusItem(statusItem)
    }

    private func configureStatusItem() {
        guard let button = statusItem.button else { return }

        button.action = #selector(togglePopover)
        button.target = self
        button.image = nil
        button.imagePosition = .noImage
        button.toolTip = "Sysmon"
        button.appearsDisabled = false
    }

    private func configurePopover() {
        popover.behavior = .transient
        popover.animates = true
        popover.contentSize = NSSize(width: 300, height: 360)
        popover.contentViewController = NSHostingController(
            rootView: PopoverView().environmentObject(appState)
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

        let down = ByteFormatter.formatMenuBarMbps(bytesPerSecond: download)
        let up = ByteFormatter.formatMenuBarMbps(bytesPerSecond: upload)

        let font = NSFont.monospacedDigitSystemFont(ofSize: 6, weight: .medium)
        let paragraph = NSMutableParagraphStyle()
        paragraph.alignment = .right
        paragraph.lineSpacing = -1
        paragraph.maximumLineHeight = 8
        paragraph.minimumLineHeight = 8

        let title = NSAttributedString(
            string: "↓\(down)\n↑\(up)",
            attributes: [
                .font: font,
                .foregroundColor: NSColor.labelColor,
                .paragraphStyle: paragraph
            ]
        )

        button.attributedTitle = title
        statusItem.length = max(28, title.size().width + 6)
    }

    @objc private func togglePopover() {
        guard let button = statusItem.button else { return }

        if popover.isShown {
            popover.performClose(self)
            return
        }

        popover.show(relativeTo: button.bounds, of: button, preferredEdge: .minY)
        popover.contentViewController?.view.window?.makeKey()
    }
}