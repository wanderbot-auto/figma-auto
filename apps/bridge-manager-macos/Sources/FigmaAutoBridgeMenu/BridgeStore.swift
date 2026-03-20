import AppKit
import Combine
import Darwin
import Foundation

@MainActor
final class BridgeStore: ObservableObject {
  @Published var workspaceRootURL: URL?
  @Published var instances: [BridgeInstance] = []
  @Published var globalErrorMessage: String?

  var runningCount: Int {
    instances.reduce(into: 0) { count, instance in
      if instance.status.isRunning {
        count += 1
      }
    }
  }

  var busyCount: Int {
    instances.reduce(into: 0) { count, instance in
      if instance.status.isBusy {
        count += 1
      }
    }
  }

  var failedCount: Int {
    instances.reduce(into: 0) { count, instance in
      if case .failed = instance.status {
        count += 1
      }
    }
  }

  var stoppedCount: Int {
    max(instances.count - runningCount, 0)
  }

  private let fileManager: FileManager
  private let stateURL: URL
  private var cancellables: Set<AnyCancellable> = []

  init(fileManager: FileManager = .default) {
    self.fileManager = fileManager
    stateURL = Self.resolveStateURL(fileManager: fileManager)

    let loadedState = Self.loadState(from: stateURL)
    workspaceRootURL = loadedState.workspaceRootPath.flatMap { URL(fileURLWithPath: $0, isDirectory: true) }
      ?? Self.detectWorkspaceRoot(fileManager: fileManager)

    let configs: [BridgeInstanceConfig]
    if loadedState.instances.isEmpty {
      configs = Self.discoverInitialInstances(workspaceRootURL: workspaceRootURL, fileManager: fileManager)
    } else {
      configs = loadedState.instances
    }

    instances = configs.map(BridgeInstance.init(config:))
    observeInstances()
    saveState()

    NotificationCenter.default.addObserver(
      forName: NSApplication.willTerminateNotification,
      object: nil,
      queue: nil
    ) { [weak self] _ in
      Task { @MainActor in
        self?.stopAllProcesses()
      }
    }
  }

  func addInstance() {
    let baseName = "bridge-\(instances.count + 1)"
    let instance = BridgeInstance(config: BridgeInstanceConfig(name: baseName))
    instances.append(instance)
    observeInstances()
    saveState()
  }

  func removeInstance(_ instance: BridgeInstance) {
    stop(instance)
    instances.removeAll { $0.id == instance.id }
    observeInstances()
    saveState()
  }

  func chooseWorkspaceRoot() {
    let panel = NSOpenPanel()
    panel.canChooseDirectories = true
    panel.canChooseFiles = false
    panel.allowsMultipleSelection = false
    panel.prompt = "Choose Workspace"
    panel.message = "Select the figma-auto repository root."

    if panel.runModal() == .OK, let selectedURL = panel.url {
      workspaceRootURL = selectedURL
      globalErrorMessage = nil
      if instances.isEmpty {
        instances = Self.discoverInitialInstances(workspaceRootURL: selectedURL, fileManager: fileManager).map(BridgeInstance.init(config:))
        observeInstances()
      }
      saveState()
    }
  }

  func revealWorkspaceRoot() {
    guard let workspaceRootURL else {
      return
    }
    NSWorkspace.shared.activateFileViewerSelecting([workspaceRootURL])
  }

  func resolvedConfiguration(for instance: BridgeInstance) throws -> ResolvedBridgeConfiguration {
    try BridgeConfigurationResolver.resolve(workspaceRoot: workspaceRootURL, config: instance.config)
  }

  func openManifest(for instance: BridgeInstance) {
    do {
      let resolved = try resolvedConfiguration(for: instance)
      openFileOrParent(resolved.manifestURL)
    } catch {
      instance.setStatus(.failed(error.localizedDescription), errorMessage: error.localizedDescription)
    }
  }

  func openLogs(for instance: BridgeInstance) {
    do {
      let resolved = try resolvedConfiguration(for: instance)
      openFileOrParent(resolved.bridgeLogURL)
    } catch {
      instance.setStatus(.failed(error.localizedDescription), errorMessage: error.localizedDescription)
    }
  }

  func start(_ instance: BridgeInstance) {
    Task {
      await startInstance(instance)
    }
  }

  func build(_ instance: BridgeInstance) {
    Task {
      await buildInstance(instance)
    }
  }

  func stop(_ instance: BridgeInstance) {
    instance.stopRequested = true
    instance.setStatus(.stopping)

    if let buildProcess = instance.buildProcess {
      terminate(process: buildProcess)
      return
    }

    guard let bridgeProcess = instance.bridgeProcess else {
      instance.setStatus(.stopped(lastExitCode: nil))
      return
    }

    terminate(process: bridgeProcess)
  }

  func startAll() {
    Task {
      for instance in instances {
        await startInstance(instance)
      }
    }
  }

  func stopAll() {
    for instance in instances {
      stop(instance)
    }
  }

  func buildAll() {
    Task {
      for instance in instances {
        await buildInstance(instance)
      }
    }
  }

  private func startInstance(_ instance: BridgeInstance) async {
    if instance.status.isBusy || instance.status.isRunning {
      return
    }

    do {
      let resolved = try resolvedConfiguration(for: instance)
      if instance.autoBuild {
        try await runBuild(for: instance, resolved: resolved)
      }
      try startBridgeProcess(for: instance, resolved: resolved)
    } catch is CancellationError {
      instance.setStatus(.stopped(lastExitCode: nil))
    } catch {
      instance.bridgeProcess = nil
      instance.buildProcess = nil
      closeLogHandle(for: instance)
      instance.setStatus(.failed(error.localizedDescription), errorMessage: error.localizedDescription)
    }
  }

  private func buildInstance(_ instance: BridgeInstance) async {
    if instance.status.isBusy {
      return
    }

    do {
      let resolved = try resolvedConfiguration(for: instance)
      try await runBuild(for: instance, resolved: resolved)
      instance.setStatus(.stopped(lastExitCode: nil))
    } catch is CancellationError {
      instance.setStatus(.stopped(lastExitCode: nil))
    } catch {
      instance.buildProcess = nil
      instance.setStatus(.failed(error.localizedDescription), errorMessage: error.localizedDescription)
    }
  }

  private func runBuild(
    for instance: BridgeInstance,
    resolved: ResolvedBridgeConfiguration
  ) async throws {
    instance.stopRequested = false
    instance.setStatus(.building)
    try ensureLogDirectories(for: resolved)
    try appendLogDivider(
      to: resolved.bridgeLogURL,
      title: "Build \(instance.name)"
    )

    let process = try configuredShellProcess(
      command: "npm run build",
      environment: buildEnvironment(for: resolved),
      currentDirectoryURL: workspaceRootURL ?? resolved.bridgeEntryURL.deletingLastPathComponent(),
      logURL: resolved.bridgeLogURL
    )
    instance.buildProcess = process

    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      process.terminationHandler = { [weak self, weak instance] process in
        Task { @MainActor in
          guard let instance else {
            continuation.resume(throwing: CancellationError())
            return
          }

          self?.instanceBuildDidFinish(instance: instance, process: process, continuation: continuation)
        }
      }

      do {
        try process.run()
      } catch {
        instance.buildProcess = nil
        continuation.resume(throwing: error)
      }
    }
  }

  private func instanceBuildDidFinish(
    instance: BridgeInstance,
    process: Process,
    continuation: CheckedContinuation<Void, Error>
  ) {
    instance.buildProcess = nil

    if instance.stopRequested {
      instance.stopRequested = false
      continuation.resume(throwing: CancellationError())
      return
    }

    if process.terminationReason == .exit, process.terminationStatus == 0 {
      continuation.resume()
      return
    }

    continuation.resume(throwing: NSError(
      domain: "FigmaAutoBridgeMenu",
      code: Int(process.terminationStatus),
      userInfo: [NSLocalizedDescriptionKey: "Build failed with exit code \(process.terminationStatus)."]
    ))
  }

  private func startBridgeProcess(
    for instance: BridgeInstance,
    resolved: ResolvedBridgeConfiguration
  ) throws {
    instance.stopRequested = false
    instance.setStatus(.starting)
    try ensureLogDirectories(for: resolved)
    try appendLogDivider(
      to: resolved.bridgeLogURL,
      title: "Bridge \(instance.name)"
    )

    let logHandle = try logFileHandle(for: resolved.bridgeLogURL)
    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/bin/zsh")
    process.arguments = ["-lc", "node apps/mcp-bridge/dist/index.js"]
    process.currentDirectoryURL = workspaceRootURL
    process.environment = bridgeEnvironment(for: resolved)
    process.standardOutput = logHandle
    process.standardError = logHandle
    process.terminationHandler = { [weak self, weak instance] process in
      Task { @MainActor in
        self?.instanceBridgeDidFinish(instance: instance, process: process)
      }
    }

    do {
      try process.run()
      instance.bridgeLogHandle = logHandle
      instance.bridgeProcess = process
      instance.setStatus(.running(pid: process.processIdentifier))
    } catch {
      closeLogHandle(for: instance)
      throw error
    }
  }

  private func instanceBridgeDidFinish(instance: BridgeInstance?, process: Process) {
    guard let instance else {
      return
    }

    instance.bridgeProcess = nil
    closeLogHandle(for: instance)

    if instance.stopRequested {
      instance.stopRequested = false
      instance.setStatus(.stopped(lastExitCode: process.terminationStatus))
      return
    }

    if process.terminationReason == .exit, process.terminationStatus == 0 {
      instance.setStatus(.stopped(lastExitCode: 0))
    } else {
      instance.setStatus(
        .failed("Bridge exited with code \(process.terminationStatus)."),
        errorMessage: "Bridge exited with code \(process.terminationStatus)."
      )
    }
  }

  private func buildEnvironment(for resolved: ResolvedBridgeConfiguration) -> [String: String] {
    var environment = ProcessInfo.processInfo.environment
    environment["FIGMA_AUTO_LOCAL_INSTANCE"] = resolved.instanceName
    environment["FIGMA_AUTO_BRIDGE_PORT"] = String(resolved.bridgePort)
    environment["FIGMA_AUTO_BRIDGE_WS_URL"] = resolved.bridgeWsURL
    environment["FIGMA_AUTO_BRIDGE_HTTP_URL"] = resolved.bridgeHTTPURL
    return environment
  }

  private func bridgeEnvironment(for resolved: ResolvedBridgeConfiguration) -> [String: String] {
    var environment = ProcessInfo.processInfo.environment
    environment["FIGMA_AUTO_LOCAL_INSTANCE"] = resolved.instanceName
    environment["FIGMA_AUTO_BRIDGE_PORT"] = String(resolved.bridgePort)
    environment["FIGMA_AUTO_BRIDGE_HOST"] = resolved.bridgeHost
    environment["FIGMA_AUTO_BRIDGE_PUBLIC_WS_URL"] = resolved.bridgeWsURL
    environment["FIGMA_AUTO_BRIDGE_PUBLIC_HTTP_URL"] = resolved.bridgeHTTPURL
    environment["FIGMA_AUTO_AUDIT_LOG_PATH"] = resolved.auditLogURL.path
    environment["FIGMA_AUTO_BRIDGE_LOG_PATH"] = resolved.bridgeLogURL.path
    return environment
  }

  private func configuredShellProcess(
    command: String,
    environment: [String: String],
    currentDirectoryURL: URL,
    logURL: URL
  ) throws -> Process {
    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/bin/zsh")
    process.arguments = ["-lc", command]
    process.currentDirectoryURL = currentDirectoryURL
    process.environment = environment
    let handle = try logFileHandle(for: logURL)
    process.standardOutput = handle
    process.standardError = handle
    process.terminationHandler = { _ in
      try? handle.close()
    }
    return process
  }

  private func ensureLogDirectories(for resolved: ResolvedBridgeConfiguration) throws {
    try fileManager.createDirectory(at: resolved.bridgeLogURL.deletingLastPathComponent(), withIntermediateDirectories: true)
    try fileManager.createDirectory(at: resolved.auditLogURL.deletingLastPathComponent(), withIntermediateDirectories: true)
  }

  private func logFileHandle(for url: URL) throws -> FileHandle {
    if !fileManager.fileExists(atPath: url.path) {
      fileManager.createFile(atPath: url.path, contents: nil)
    }
    let handle = try FileHandle(forWritingTo: url)
    try handle.seekToEnd()
    return handle
  }

  private func appendLogDivider(to url: URL, title: String) throws {
    let timestamp = ISO8601DateFormatter().string(from: Date())
    let line = "\n[\(timestamp)] \(title)\n"
    let handle = try logFileHandle(for: url)
    handle.write(Data(line.utf8))
    try handle.close()
  }

  private func closeLogHandle(for instance: BridgeInstance) {
    try? instance.bridgeLogHandle?.close()
    instance.bridgeLogHandle = nil
  }

  private func terminate(process: Process) {
    guard process.isRunning else {
      return
    }

    process.terminate()

    let pid = process.processIdentifier
    DispatchQueue.global().asyncAfter(deadline: .now() + 2) {
      if process.isRunning {
        kill(pid, SIGKILL)
      }
    }
  }

  private func stopAllProcesses() {
    for instance in instances {
      instance.stopRequested = true
      instance.buildProcess?.terminate()
      instance.bridgeProcess?.terminate()
      closeLogHandle(for: instance)
    }
  }

  private func openFileOrParent(_ url: URL) {
    if fileManager.fileExists(atPath: url.path) {
      NSWorkspace.shared.activateFileViewerSelecting([url])
    } else {
      NSWorkspace.shared.activateFileViewerSelecting([url.deletingLastPathComponent()])
    }
  }

  private func observeInstances() {
    cancellables.removeAll()
    for instance in instances {
      attachObservers(to: instance)
    }
  }

  private func attachObservers(to instance: BridgeInstance) {
    instance.objectWillChange
      .sink { [weak self] _ in
        self?.saveState()
      }
      .store(in: &cancellables)
  }

  private func saveState() {
    let state = BridgeManagerState(
      workspaceRootPath: workspaceRootURL?.path,
      instances: instances.map(\.config)
    )

    do {
      try fileManager.createDirectory(at: stateURL.deletingLastPathComponent(), withIntermediateDirectories: true)
      let data = try JSONEncoder().encode(state)
      try data.write(to: stateURL, options: .atomic)
    } catch {
      globalErrorMessage = "Failed to save app state: \(error.localizedDescription)"
    }
  }

  private static func loadState(from url: URL) -> BridgeManagerState {
    guard
      let data = try? Data(contentsOf: url),
      let state = try? JSONDecoder().decode(BridgeManagerState.self, from: data)
    else {
      return BridgeManagerState(workspaceRootPath: nil, instances: [])
    }

    return state
  }

  private static func resolveStateURL(fileManager: FileManager) -> URL {
    let appSupport = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
      ?? URL(fileURLWithPath: NSString(string: "~/Library/Application Support").expandingTildeInPath, isDirectory: true)
    return appSupport
      .appendingPathComponent("figma-auto", isDirectory: true)
      .appendingPathComponent("bridge-manager", isDirectory: true)
      .appendingPathComponent("state.json")
  }

  private static func detectWorkspaceRoot(fileManager: FileManager) -> URL? {
    let candidateURLs = [
      URL(fileURLWithPath: fileManager.currentDirectoryPath, isDirectory: true),
      URL(fileURLWithPath: Bundle.main.bundleURL.deletingLastPathComponent().path, isDirectory: true),
      URL(fileURLWithPath: Bundle.main.executableURL?.deletingLastPathComponent().path ?? fileManager.currentDirectoryPath, isDirectory: true)
    ]

    for candidate in candidateURLs {
      if let resolved = walkUpForWorkspaceRoot(startingAt: candidate, fileManager: fileManager) {
        return resolved
      }
    }

    return nil
  }

  private static func walkUpForWorkspaceRoot(startingAt url: URL, fileManager: FileManager) -> URL? {
    var currentURL = url.resolvingSymlinksInPath()
    while true {
      let packageURL = currentURL.appendingPathComponent("package.json")
      let bridgeURL = currentURL
        .appendingPathComponent("apps", isDirectory: true)
        .appendingPathComponent("mcp-bridge", isDirectory: true)
        .appendingPathComponent("src", isDirectory: true)
        .appendingPathComponent("index.ts")

      if fileManager.fileExists(atPath: packageURL.path), fileManager.fileExists(atPath: bridgeURL.path) {
        return currentURL
      }

      let parentURL = currentURL.deletingLastPathComponent()
      if parentURL.path == currentURL.path {
        return nil
      }
      currentURL = parentURL
    }
  }

  private static func discoverInitialInstances(
    workspaceRootURL: URL?,
    fileManager: FileManager
  ) -> [BridgeInstanceConfig] {
    guard let workspaceRootURL else {
      return []
    }

    let instancesURL = workspaceRootURL
      .appendingPathComponent("apps", isDirectory: true)
      .appendingPathComponent("figma-plugin", isDirectory: true)
      .appendingPathComponent("instances", isDirectory: true)

    guard let contents = try? fileManager.contentsOfDirectory(at: instancesURL, includingPropertiesForKeys: [.isDirectoryKey]) else {
      return []
    }

    let names = contents
      .filter { url in
        (try? url.resourceValues(forKeys: [.isDirectoryKey]).isDirectory) == true
      }
      .map(\.lastPathComponent)
      .sorted()

    return names.map { BridgeInstanceConfig(name: $0) }
  }
}
