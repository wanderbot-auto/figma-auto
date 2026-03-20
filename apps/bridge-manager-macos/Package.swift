// swift-tools-version: 5.9
import PackageDescription

let package = Package(
  name: "FigmaAutoBridgeMenu",
  platforms: [
    .macOS(.v13)
  ],
  products: [
    .executable(
      name: "FigmaAutoBridgeMenu",
      targets: ["FigmaAutoBridgeMenu"]
    )
  ],
  targets: [
    .executableTarget(
      name: "FigmaAutoBridgeMenu"
    ),
    .testTarget(
      name: "FigmaAutoBridgeMenuTests",
      dependencies: ["FigmaAutoBridgeMenu"]
    )
  ]
)
