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

    let config = BridgeInstanceConfig(name: "maker-portfolio")
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

    let config = BridgeInstanceConfig(name: "maker-portfolio", portOverride: "70000")

    XCTAssertThrowsError(try BridgeConfigurationResolver.resolve(workspaceRoot: tempRoot, config: config)) { error in
      XCTAssertEqual(
        error.localizedDescription,
        "Port override must be between 1 and 65535: 70000"
      )
    }
  }
}
