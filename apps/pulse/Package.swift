// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "Pulse",
    platforms: [
        .macOS(.v14)
    ],
    products: [
        .executable(name: "Pulse", targets: ["Pulse"])
    ],
    targets: [
        .executableTarget(
            name: "Pulse",
            path: "Sources/Pulse",
            exclude: ["Info.plist"]
        ),
        .testTarget(
            name: "PulseTests",
            dependencies: ["Pulse"],
            path: "Tests/PulseTests"
        )
    ]
)