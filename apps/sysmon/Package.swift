// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "Sysmon",
    platforms: [
        .macOS(.v14)
    ],
    products: [
        .executable(name: "Sysmon", targets: ["Sysmon"])
    ],
    targets: [
        .executableTarget(
            name: "Sysmon",
            path: "Sources/Sysmon",
            exclude: ["Info.plist"]
        ),
        .testTarget(
            name: "SysmonTests",
            dependencies: ["Sysmon"],
            path: "Tests/SysmonTests"
        )
    ]
)