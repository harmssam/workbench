import AppKit
import Combine
import SwiftUI

@MainActor
final class StatusBarController: NSObject {
    private let appState: AppState
    private let statusItem: NSStatusItem
    private let popover: NSPopover
    private let labelView = MenuBarLabelNSView()
    private var cancellables = Set<AnyCancellable>()

    init(appState: AppState) {
        self.appState = appState
        self.statusItem = NSStatusItem()
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
        statusItem.length = NSStatusItem.variableLength

        guard let button = statusItem.button else { return }

        labelView.translatesAutoresizingMaskIntoConstraints = false
        button.addSubview(labelView)
        NSLayoutConstraint.activate([
            labelView.leadingAnchor.constraint(equalTo: button.leadingAnchor, constant: 2),
            labelView.trailingAnchor.constraint(equalTo: button.trailingAnchor, constant: -2),
            labelView.topAnchor.constraint(equalTo: button.topAnchor, constant: 2),
            labelView.bottomAnchor.constraint(equalTo: button.bottomAnchor, constant: -2),
            labelView.widthAnchor.constraint(equalToConstant: 26),
            labelView.heightAnchor.constraint(equalToConstant: 16)
        ])

        button.action = #selector(togglePopover)
        button.target = self
        button.image = nil
        button.imagePosition = .noImage
        button.toolTip = "Sysmon"
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
        labelView.downloadText = ByteFormatter.formatMenuBarMbps(bytesPerSecond: download)
        labelView.uploadText = ByteFormatter.formatMenuBarMbps(bytesPerSecond: upload)
        labelView.needsDisplay = true
        statusItem.length = 30
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

/// AppKit-drawn label — MenuBarExtra ignores SwiftUI font sizing.
final class MenuBarLabelNSView: NSView {
    var downloadText = "0"
    var uploadText = "0"

    private let font = NSFont.monospacedDigitSystemFont(ofSize: 5, weight: .medium)
    private let rowHeight: CGFloat = 7

    override var intrinsicContentSize: NSSize {
        NSSize(width: 26, height: 16)
    }

    override func draw(_ dirtyRect: NSRect) {
        super.draw(dirtyRect)

        let attributes: [NSAttributedString.Key: Any] = [
            .font: font,
            .foregroundColor: NSColor.labelColor
        ]

        drawRow(arrow: "↓", value: downloadText, y: rowHeight, attributes: attributes)
        drawRow(arrow: "↑", value: uploadText, y: 0, attributes: attributes)
    }

    private func drawRow(arrow: String, value: String, y: CGFloat, attributes: [NSAttributedString.Key: Any]) {
        let text = "\(arrow)\(value)" as NSString
        let size = text.size(withAttributes: attributes)
        let x = bounds.width - size.width
        text.draw(at: NSPoint(x: x, y: y), withAttributes: attributes)
    }
}