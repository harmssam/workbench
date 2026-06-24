import AppKit
import SwiftUI

enum MenuBarLabelRenderer {
    static func render(download: UInt64, upload: UInt64) -> NSImage {
        let down = ByteFormatter.formatMenuBarMbps(bytesPerSecond: download)
        let up = ByteFormatter.formatMenuBarMbps(bytesPerSecond: upload)

        let scale: CGFloat = 2
        let height: CGFloat = 12

        let font = NSFont.monospacedDigitSystemFont(ofSize: 6, weight: .medium)
        let attributes: [NSAttributedString.Key: Any] = [
            .font: font,
            .foregroundColor: NSColor.labelColor
        ]

        let downRow = "\(down)↓"
        let upRow = "\(up)↑"
        let contentWidth = max(
            (downRow as NSString).size(withAttributes: attributes).width,
            (upRow as NSString).size(withAttributes: attributes).width
        )
        let width = ceil(contentWidth)

        let size = NSSize(width: width * scale, height: height * scale)
        let image = NSImage(size: size)
        image.lockFocus()

        NSGraphicsContext.current?.imageInterpolation = .high
        if let ctx = NSGraphicsContext.current?.cgContext {
            ctx.scaleBy(x: scale, y: scale)
        }

        drawRow(upRow, y: 5.5, width: width, attributes: attributes)
        drawRow(downRow, y: 0, width: width, attributes: attributes)

        image.unlockFocus()
        image.isTemplate = false
        return image
    }

    private static func drawRow(
        _ text: String,
        y: CGFloat,
        width: CGFloat,
        attributes: [NSAttributedString.Key: Any]
    ) {
        let string = text as NSString
        let textWidth = string.size(withAttributes: attributes).width
        string.draw(at: NSPoint(x: width - textWidth, y: y), withAttributes: attributes)
    }
}

struct MenuBarLabelImageView: View {
    let downloadRate: UInt64
    let uploadRate: UInt64

    var body: some View {
        Image(nsImage: MenuBarLabelRenderer.render(download: downloadRate, upload: uploadRate))
            .interpolation(.high)
    }
}