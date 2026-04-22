import XCTest
@testable import FigmaAutoBridgeMenu

final class BridgeStoreTests: XCTestCase {
  @MainActor
  func testSaveConfigurationPersistsBridgeNameAndPortOverride() async throws {
    let fileManager = FileManager.default
    let tempRoot = fileManager.temporaryDirectory
      .appendingPathComponent(UUID().uuidString, isDirectory: true)
    try fileManager.createDirectory(at: tempRoot, withIntermediateDirectories: true)
    defer { try? fileManager.removeItem(at: tempRoot) }

    try makeWorkspaceRoot(at: tempRoot, fileManager: fileManager)

    let stateURL = tempRoot
      .appendingPathComponent("state", isDirectory: true)
      .appendingPathComponent("state.json")
    let config = BridgeInstanceConfig(slug: "design-file", displayName: "New Bridge")
    let state = BridgeManagerState(workspaceRootPath: tempRoot.path, instances: [config])
    let store = BridgeStore(
      fileManager: fileManager,
      stateURLOverride: stateURL,
      workspaceRootOverride: tempRoot,
      initialStateOverride: state,
      shouldStartHealthRefreshLoop: false
    )

    let instance = try XCTUnwrap(store.instances.first)

    let didChange = try await store.saveConfiguration(
      for: instance,
      bridgeName: "marketing-site",
      portOverride: "4500"
    )

    XCTAssertTrue(didChange)
    XCTAssertEqual(instance.slug, "marketing-site")
    XCTAssertEqual(instance.portOverride, "4500")
    XCTAssertEqual(try store.resolvedConfiguration(for: instance).bridgePort, 4500)

    let savedData = try Data(contentsOf: stateURL)
    let savedState = try JSONDecoder().decode(BridgeManagerState.self, from: savedData)
    XCTAssertEqual(savedState.instances.first?.slug, "marketing-site")
    XCTAssertEqual(savedState.instances.first?.portOverride, "4500")
  }

  @MainActor
  func testDeleteRemovesGeneratedPluginAndLogDirectories() throws {
    let fileManager = FileManager.default
    let tempRoot = fileManager.temporaryDirectory
      .appendingPathComponent(UUID().uuidString, isDirectory: true)
    try fileManager.createDirectory(at: tempRoot, withIntermediateDirectories: true)
    defer { try? fileManager.removeItem(at: tempRoot) }

    try makeWorkspaceRoot(at: tempRoot, fileManager: fileManager)

    let stateURL = tempRoot
      .appendingPathComponent("state", isDirectory: true)
      .appendingPathComponent("state.json")
    let config = BridgeInstanceConfig(slug: "design-file", displayName: "New Bridge")
    let state = BridgeManagerState(workspaceRootPath: tempRoot.path, instances: [config])
    let store = BridgeStore(
      fileManager: fileManager,
      stateURLOverride: stateURL,
      workspaceRootOverride: tempRoot,
      initialStateOverride: state,
      shouldStartHealthRefreshLoop: false
    )

    let instance = try XCTUnwrap(store.instances.first)
    let resolved = try store.resolvedConfiguration(for: instance)
    try makeGeneratedArtifacts(for: resolved, fileManager: fileManager)

    XCTAssertTrue(fileManager.fileExists(atPath: resolved.pluginRootURL.path))
    XCTAssertTrue(fileManager.fileExists(atPath: resolved.bridgeLogURL.deletingLastPathComponent().path))

    store.delete(instance)

    XCTAssertFalse(fileManager.fileExists(atPath: resolved.pluginRootURL.path))
    XCTAssertFalse(fileManager.fileExists(atPath: resolved.bridgeLogURL.deletingLastPathComponent().path))
    XCTAssertTrue(store.instances.isEmpty)
    XCTAssertNil(store.globalErrorMessage)
  }

  private func makeWorkspaceRoot(at rootURL: URL, fileManager: FileManager) throws {
    try "{}".write(to: rootURL.appendingPathComponent("package.json"), atomically: true, encoding: .utf8)
    let bridgeDistURL = rootURL
      .appendingPathComponent("apps/mcp-bridge/dist", isDirectory: true)
    try fileManager.createDirectory(at: bridgeDistURL, withIntermediateDirectories: true)
    fileManager.createFile(atPath: bridgeDistURL.appendingPathComponent("index.js").path, contents: Data())
  }

  private func makeGeneratedArtifacts(
    for resolved: ResolvedBridgeConfiguration,
    fileManager: FileManager
  ) throws {
    try fileManager.createDirectory(at: resolved.pluginDistURL, withIntermediateDirectories: true)
    fileManager.createFile(atPath: resolved.manifestURL.path, contents: Data("{}".utf8))
    fileManager.createFile(atPath: resolved.pluginDistURL.appendingPathComponent("code.js").path, contents: Data())
    fileManager.createFile(atPath: resolved.pluginDistURL.appendingPathComponent("ui.html").path, contents: Data())

    let logRootURL = resolved.bridgeLogURL.deletingLastPathComponent()
    try fileManager.createDirectory(at: logRootURL, withIntermediateDirectories: true)
    fileManager.createFile(atPath: resolved.bridgeLogURL.path, contents: Data())
    fileManager.createFile(atPath: resolved.auditLogURL.path, contents: Data())
  }
}
