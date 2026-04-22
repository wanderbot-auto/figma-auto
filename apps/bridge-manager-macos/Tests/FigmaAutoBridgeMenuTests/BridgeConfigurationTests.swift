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
      "a-b"
    )
    XCTAssertEqual(
      BridgeConfigurationResolver.normalizeInstanceName("Bridge.Name"),
      "bridge-name"
    )
  }

  func testBridgeNameValidationAllowsKebabCaseOnly() {
    XCTAssertTrue(BridgeConfigurationResolver.isValidBridgeName("bridge-name"))
    XCTAssertTrue(BridgeConfigurationResolver.isValidBridgeName("bridge-name-2"))
    XCTAssertFalse(BridgeConfigurationResolver.isValidBridgeName("Bridge Name"))
    XCTAssertFalse(BridgeConfigurationResolver.isValidBridgeName("bridge_name"))
    XCTAssertFalse(BridgeConfigurationResolver.isValidBridgeName(""))
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

  func testDefaultProductInstancesUseBridgeNames() {
    let defaults = BridgeConfigurationResolver.defaultProductInstances()

    XCTAssertEqual(defaults.map(\.slug), ["marketing-landing", "product-flow", "design-system"])
    XCTAssertEqual(defaults.map(\.displayName), ["marketing-landing", "product-flow", "design-system"])
    XCTAssertEqual(defaults.map(\.figmaFileLabel), ["marketing-landing", "product-flow", "design-system"])
    XCTAssertEqual(defaults.map(\.autoBuild), [false, false, false])
  }

  func testMakeCustomInstanceConfigGeneratesUniqueBridgeNames() {
    let existing = [
      BridgeInstanceConfig(slug: "bridge-name", displayName: "bridge-name"),
      BridgeInstanceConfig(slug: "bridge-name-2", displayName: "bridge-name-2")
    ]

    let generated = BridgeConfigurationResolver.makeCustomInstanceConfig(existingConfigs: existing)

    XCTAssertEqual(generated.slug, "bridge-name-3")
    XCTAssertEqual(generated.displayName, "bridge-name-3")
    XCTAssertEqual(generated.figmaFileLabel, "bridge-name-3")
  }

  func testConfigCanonicalizesBridgeNameAcrossDisplayAndLabel() {
    let config = BridgeInstanceConfig(
      slug: "",
      displayName: "Maker Portfolio",
      figmaFileLabel: "Custom Label"
    )

    XCTAssertEqual(config.slug, "maker-portfolio")
    XCTAssertEqual(config.displayName, "maker-portfolio")
    XCTAssertEqual(config.figmaFileLabel, "maker-portfolio")
  }

  func testPluginAssetsExistRequiresManifestAndRuntimeFiles() throws {
    let tempRoot = FileManager.default.temporaryDirectory
      .appendingPathComponent(UUID().uuidString, isDirectory: true)
    try FileManager.default.createDirectory(at: tempRoot, withIntermediateDirectories: true)
    try "{}".write(to: tempRoot.appendingPathComponent("package.json"), atomically: true, encoding: .utf8)
    let bridgeDistURL = tempRoot
      .appendingPathComponent("apps/mcp-bridge/dist", isDirectory: true)
    try FileManager.default.createDirectory(at: bridgeDistURL, withIntermediateDirectories: true)
    FileManager.default.createFile(atPath: bridgeDistURL.appendingPathComponent("index.js").path, contents: Data())

    let config = BridgeInstanceConfig(slug: "design-file", displayName: "New Bridge")
    let resolved = try BridgeConfigurationResolver.resolve(workspaceRoot: tempRoot, config: config)

    XCTAssertFalse(resolved.pluginAssetsExist(fileManager: .default))

    try FileManager.default.createDirectory(at: resolved.pluginDistURL, withIntermediateDirectories: true)
    FileManager.default.createFile(atPath: resolved.manifestURL.path, contents: Data("{}".utf8))
    FileManager.default.createFile(atPath: resolved.pluginDistURL.appendingPathComponent("code.js").path, contents: Data())
    FileManager.default.createFile(atPath: resolved.pluginDistURL.appendingPathComponent("ui.html").path, contents: Data())

    XCTAssertTrue(resolved.pluginAssetsExist(fileManager: .default))
  }
}
