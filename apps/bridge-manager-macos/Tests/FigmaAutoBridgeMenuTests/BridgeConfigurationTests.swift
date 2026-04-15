import XCTest
@testable import FigmaAutoBridgeMenu

final class BridgeConfigurationTests: XCTestCase {
  func testNormalizeInstanceNameMatchesShellContract() {
    XCTAssertEqual(
      BridgeConfigurationResolver.normalizeInstanceName(" Maker Portfolio "),
      "maker-portfolio"
    )
    XCTAssertEqual(
      BridgeConfigurationResolver.normalizeInstanceName("markcard"),
      "markcard"
    )
    XCTAssertEqual(
      BridgeConfigurationResolver.normalizeInstanceName("a__b"),
      "a__b"
    )
  }

  func testDeriveInstancePortMatchesCurrentHashRule() {
    XCTAssertEqual(
      BridgeConfigurationResolver.deriveInstancePort(defaultPort: 4318, instanceName: "maker-portfolio"),
      4462
    )
    XCTAssertEqual(
      BridgeConfigurationResolver.deriveInstancePort(defaultPort: 4318, instanceName: "markcard"),
      4596
    )
  }

  func testResolveBuildsVisibleManifestPath() throws {
    let tempRoot = FileManager.default.temporaryDirectory
      .appendingPathComponent(UUID().uuidString, isDirectory: true)
    try FileManager.default.createDirectory(at: tempRoot, withIntermediateDirectories: true)
    try "{}".write(to: tempRoot.appendingPathComponent("package.json"), atomically: true, encoding: .utf8)
    let bridgeDistURL = tempRoot
      .appendingPathComponent("apps/mcp-bridge/dist", isDirectory: true)
    try FileManager.default.createDirectory(at: bridgeDistURL, withIntermediateDirectories: true)
    FileManager.default.createFile(atPath: bridgeDistURL.appendingPathComponent("index.js").path, contents: Data())

    let config = BridgeInstanceConfig(slug: "maker-portfolio", displayName: "Maker Portfolio")
    let resolved = try BridgeConfigurationResolver.resolve(workspaceRoot: tempRoot, config: config)

    XCTAssertEqual(
      resolved.manifestURL.path,
      tempRoot
        .appendingPathComponent("apps/figma-plugin/instances/maker-portfolio/manifest.json")
        .path
    )
    XCTAssertEqual(resolved.bridgePort, 4462)
  }

  func testResolveRejectsOutOfRangePortOverride() throws {
    let tempRoot = FileManager.default.temporaryDirectory
      .appendingPathComponent(UUID().uuidString, isDirectory: true)
    try FileManager.default.createDirectory(at: tempRoot, withIntermediateDirectories: true)
    try "{}".write(to: tempRoot.appendingPathComponent("package.json"), atomically: true, encoding: .utf8)
    let bridgeDistURL = tempRoot
      .appendingPathComponent("apps/mcp-bridge/dist", isDirectory: true)
    try FileManager.default.createDirectory(at: bridgeDistURL, withIntermediateDirectories: true)
    FileManager.default.createFile(atPath: bridgeDistURL.appendingPathComponent("index.js").path, contents: Data())

    let config = BridgeInstanceConfig(slug: "maker-portfolio", displayName: "Maker Portfolio", portOverride: "70000")

    XCTAssertThrowsError(try BridgeConfigurationResolver.resolve(workspaceRoot: tempRoot, config: config)) { error in
      XCTAssertEqual(
        error.localizedDescription,
        "Port override must be between 1 and 65535: 70000"
      )
    }
  }

  func testDefaultProductInstancesAreBusinessFriendly() {
    let defaults = BridgeConfigurationResolver.defaultProductInstances()

    XCTAssertEqual(defaults.map(\.slug), ["marketing-landing", "product-flow", "design-system"])
    XCTAssertEqual(defaults.map(\.displayName), ["Marketing Landing", "Product Flow", "Design System"])
    XCTAssertEqual(defaults.map(\.autoBuild), [false, false, false])
  }
}
