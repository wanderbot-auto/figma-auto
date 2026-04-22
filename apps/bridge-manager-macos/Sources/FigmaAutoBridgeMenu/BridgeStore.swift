import AppKit
import Combine
import Darwin
import Foundation

@MainActor
final class BridgeStore: ObservableObject {
  private static let minimumAutoAssignedPort = 30000
  static let recommendedWorkspaceDisplayPath = "Bundled Figma Auto Runtime"
  static let recommendedWorkspaceHint = "This app ships with a bundled runtime. You only need Choose Workspace when developing from the repository."

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
  private var assignedBridgePorts: [UUID: Int] = [:]
  private var healthRefreshTask: Task<Void, Never>?

  var usingBundledRuntime: Bool {
    guard let workspaceRootURL else {
      return false
    }
    return Self.bundledRuntimeRoot(fileManager: fileManager)?.path == workspaceRootURL.path
  }

  private var managedLogsRootURL: URL {
    stateURL.deletingLastPathComponent().appendingPathComponent("runtime-logs", isDirectory: true)
  }

  init(
    fileManager: FileManager = .default,
    stateURLOverride: URL? = nil,
    workspaceRootOverride: URL? = nil,
    initialStateOverride: BridgeManagerState? = nil,
    shouldStartHealthRefreshLoop: Bool = true
  ) {
    self.fileManager = fileManager
    stateURL = stateURLOverride ?? Self.resolveStateURL(fileManager: fileManager)

    let loadedState = initialStateOverride ?? Self.loadState(from: stateURL)
    if let workspaceRootOverride {
      workspaceRootURL = workspaceRootOverride
    } else {
      let persistedWorkspaceRoot = loadedState.workspaceRootPath.flatMap { URL(fileURLWithPath: $0, isDirectory: true) }
      if let persistedWorkspaceRoot,
         Self.isWorkspaceRootCandidate(persistedWorkspaceRoot, fileManager: fileManager) {
        workspaceRootURL = persistedWorkspaceRoot
      } else {
        workspaceRootURL = Self.detectWorkspaceRoot(fileManager: fileManager)
      }
    }

    let configs: [BridgeInstanceConfig]
    if loadedState.instances.isEmpty {
      configs = Self.bootstrapInstanceConfigs(workspaceRootURL: workspaceRootURL, fileManager: fileManager)
    } else {
      configs = loadedState.instances
    }

    instances = configs.map(BridgeInstance.init(config:))
    observeInstances()
    saveState()
    if shouldStartHealthRefreshLoop {
      startHealthRefreshLoop()
    }

    NotificationCenter.default.addObserver(
      forName: NSApplication.willTerminateNotification,
      object: nil,
      queue: nil
    ) { [weak self] _ in
      Task { @MainActor in
        self?.shutdownForTermination()
      }
    }
  }

  func chooseWorkspaceRoot() {
    let panel = NSOpenPanel()
    panel.canChooseDirectories = true
    panel.canChooseFiles = false
    panel.allowsMultipleSelection = false
    panel.prompt = "Choose Workspace"
    panel.message = "Select the figma-auto repository root. Recommended: \(Self.recommendedWorkspaceDisplayPath). Avoid hidden folders."
    panel.directoryURL = preferredWorkspacePickerURL()

    if panel.runModal() == .OK, let selectedURL = panel.url {
      workspaceRootURL = selectedURL
      globalErrorMessage = nil
      if instances.isEmpty {
        instances = Self.bootstrapInstanceConfigs(workspaceRootURL: selectedURL, fileManager: fileManager).map(BridgeInstance.init(config:))
        observeInstances()
      }
      saveState()
    }
  }

  private func preferredWorkspacePickerURL() -> URL {
    if let bundledRuntimeURL = Self.bundledRuntimeRoot(fileManager: fileManager) {
      return bundledRuntimeURL
    }

    let recommendedURL = fileManager.homeDirectoryForCurrentUser
      .appendingPathComponent("Documents", isDirectory: true)
      .appendingPathComponent("figma-auto", isDirectory: true)

    if fileManager.fileExists(atPath: recommendedURL.path) {
      return recommendedURL
    }

    let documentsURL = fileManager.homeDirectoryForCurrentUser
      .appendingPathComponent("Documents", isDirectory: true)
    if fileManager.fileExists(atPath: documentsURL.path) {
      return documentsURL
    }

    return fileManager.homeDirectoryForCurrentUser
  }

  func revealWorkspaceRoot() {
    guard let workspaceRootURL else {
      return
    }
    NSWorkspace.shared.activateFileViewerSelecting([workspaceRootURL])
  }

  func refreshConnectionHealth() {
    Task {
      await refreshAllConnectionHealth()
    }
  }

  func resolvedConfiguration(for instance: BridgeInstance) throws -> ResolvedBridgeConfiguration {
    let resolved = try BridgeConfigurationResolver.resolve(workspaceRoot: workspaceRootURL, config: instance.config)
    guard usingBundledRuntime else {
      return resolved
    }

    let logRoot = managedLogsRootURL.appendingPathComponent(resolved.instanceName, isDirectory: true)
    return ResolvedBridgeConfiguration(
      instanceName: resolved.instanceName,
      bridgePort: resolved.bridgePort,
      bridgeHost: resolved.bridgeHost,
      bridgeWsURL: resolved.bridgeWsURL,
      bridgeHTTPURL: resolved.bridgeHTTPURL,
      manifestURL: resolved.manifestURL,
      pluginDistURL: resolved.pluginDistURL,
      bridgeEntryURL: resolved.bridgeEntryURL,
      bridgeLogURL: logRoot.appendingPathComponent("bridge.log"),
      auditLogURL: logRoot.appendingPathComponent("audit.ndjson")
    )
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

  func openAuditLog(for instance: BridgeInstance) {
    do {
      let resolved = try resolvedConfiguration(for: instance)
      openFileOrParent(resolved.auditLogURL)
    } catch {
      instance.setStatus(.failed(error.localizedDescription), errorMessage: error.localizedDescription)
    }
  }

  func openPluginFolder(for instance: BridgeInstance) {
    do {
      let resolved = try resolvedConfiguration(for: instance)
      openFileOrParent(resolved.pluginDistURL)
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
      releaseAssignedPort(for: instance)
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

  @discardableResult
  func addInstance() -> BridgeInstance {
    let instance = BridgeInstance(
      config: BridgeConfigurationResolver.makeCustomInstanceConfig(existingConfigs: instances.map(\.config))
    )
    instances.append(instance)
    observeInstances()
    saveState()
    return instance
  }

  func delete(_ instance: BridgeInstance) {
    instance.stopRequested = true

    if let buildProcess = instance.buildProcess {
      terminateAndWait(process: buildProcess)
      instance.buildProcess = nil
    }

    if let bridgeProcess = instance.bridgeProcess {
      terminateAndWait(process: bridgeProcess)
      instance.bridgeProcess = nil
    }

    closeLogHandle(for: instance)
    releaseAssignedPort(for: instance)

    let cleanupError = cleanupGeneratedArtifacts(for: instance)

    guard let index = instances.firstIndex(where: { $0.id == instance.id }) else {
      return
    }

    instances.remove(at: index)
    observeInstances()
    saveState()

    if let cleanupError {
      let instanceName = instance.slug.isEmpty ? "this bridge" : instance.slug
      globalErrorMessage = "Removed \(instanceName), but failed to delete its generated plugin or log files: \(cleanupError.localizedDescription)"
    }
  }

  func buildAll() {
    Task {
      for instance in instances {
        await buildInstance(instance)
      }
    }
  }

  func saveConfiguration(
    for instance: BridgeInstance,
    bridgeName rawBridgeName: String,
    portOverride rawPortOverride: String
  ) async throws -> Bool {
    guard !instance.status.isBusy else {
      throw NSError(
        domain: "FigmaAutoBridgeMenu",
        code: 2,
        userInfo: [NSLocalizedDescriptionKey: "Wait for the current bridge action to finish before saving."]
      )
    }

    let bridgeName = rawBridgeName.trimmingCharacters(in: .whitespacesAndNewlines)
    guard BridgeConfigurationResolver.isValidBridgeName(bridgeName) else {
      throw BridgeConfigurationError.invalidInstanceName
    }

    let normalizedPortOverride = try normalizePortOverride(rawPortOverride)
    let currentPortOverride = instance.portOverride.trimmingCharacters(in: .whitespacesAndNewlines)
    let didChange = instance.slug != bridgeName || currentPortOverride != normalizedPortOverride
    guard didChange else {
      return false
    }

    let shouldRestart = instance.status.isRunning
    if shouldRestart {
      stop(instance)
      try await waitForInstanceToStop(instance)
    }

    instance.updateBridgeName(bridgeName)
    instance.portOverride = normalizedPortOverride
    clearInstanceError(for: instance)
    saveState()

    if shouldRestart {
      await startInstance(instance)
    }

    return true
  }

  private func startInstance(_ instance: BridgeInstance) async {
    if instance.status.isBusy || instance.status.isRunning {
      return
    }

    do {
      let resolved = try prepareResolvedConfigurationForStart(for: instance)
      if instance.autoBuild || !resolved.pluginAssetsExist(fileManager: fileManager) {
        try await runBuild(for: instance, resolved: resolved)
      }
      try startBridgeProcess(for: instance, resolved: resolved)
      await refreshConnectionHealth(for: instance)
    } catch is CancellationError {
      releaseAssignedPort(for: instance)
      instance.setStatus(.stopped(lastExitCode: nil))
    } catch {
      instance.bridgeProcess = nil
      instance.buildProcess = nil
      closeLogHandle(for: instance)
      releaseAssignedPort(for: instance)
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
      title: "Build \(instance.slug)"
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
    instance.setConnectionState(.checking)
    try ensureLogDirectories(for: resolved)
    try appendLogDivider(
      to: resolved.bridgeLogURL,
      title: "Bridge \(instance.slug)"
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
    releaseAssignedPort(for: instance)

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

  private func shutdownForTermination() {
    healthRefreshTask?.cancel()
    for instance in instances {
      instance.stopRequested = true
      if let buildProcess = instance.buildProcess {
        terminateAndWait(process: buildProcess)
        instance.buildProcess = nil
      }
      if let bridgeProcess = instance.bridgeProcess {
        terminateAndWait(process: bridgeProcess)
        instance.bridgeProcess = nil
      }
      closeLogHandle(for: instance)
      releaseAssignedPort(for: instance)
    }
  }

  private func prepareResolvedConfigurationForStart(
    for instance: BridgeInstance
  ) throws -> ResolvedBridgeConfiguration {
    guard let workspaceRootURL else {
      throw BridgeConfigurationError.missingWorkspaceRoot
    }

    let normalizedName = BridgeConfigurationResolver.normalizeInstanceName(instance.slug)
    guard !normalizedName.isEmpty else {
      throw BridgeConfigurationError.invalidInstanceName
    }

    let rawOverride = instance.portOverride.trimmingCharacters(in: .whitespacesAndNewlines)
    let preferredPort: Int
    if rawOverride.isEmpty {
      preferredPort = Self.minimumAutoAssignedPort
    } else if let overridePort = Int(rawOverride) {
      guard (1...65535).contains(overridePort) else {
        throw BridgeConfigurationError.outOfRangePort(overridePort)
      }
      preferredPort = max(overridePort, Self.minimumAutoAssignedPort)
    } else {
      throw BridgeConfigurationError.invalidPort(rawOverride)
    }

    let reservedPort = try reserveAvailablePort(
      startingAt: preferredPort,
      for: instance
    )
    let reservedPortText = String(reservedPort)
    if instance.portOverride != reservedPortText {
      instance.portOverride = reservedPortText
    }

    return try BridgeConfigurationResolver.resolve(
      workspaceRoot: workspaceRootURL,
      config: instance.config
    )
  }

  private func reserveAvailablePort(
    startingAt preferredPort: Int,
    for instance: BridgeInstance
  ) throws -> Int {
    for port in preferredPort...65535 {
      guard isPortAvailable(port, for: instance.id) else {
        continue
      }
      assignedBridgePorts[instance.id] = port
      return port
    }

    throw NSError(
      domain: "FigmaAutoBridgeMenu",
      code: 1,
      userInfo: [NSLocalizedDescriptionKey: "No available port was found between \(preferredPort) and 65535."]
    )
  }

  private func releaseAssignedPort(for instance: BridgeInstance) {
    assignedBridgePorts.removeValue(forKey: instance.id)
  }

  private func isPortAvailable(_ port: Int, for instanceID: UUID) -> Bool {
    for (assignedInstanceID, assignedPort) in assignedBridgePorts where assignedInstanceID != instanceID {
      if assignedPort == port {
        return false
      }
    }

    return canBindIPv4(port) && canBindIPv6(port)
  }

  private func canBindIPv4(_ port: Int) -> Bool {
    let descriptor = socket(AF_INET, SOCK_STREAM, 0)
    guard descriptor >= 0 else {
      return false
    }
    defer { close(descriptor) }

    var address = sockaddr_in()
    address.sin_len = UInt8(MemoryLayout<sockaddr_in>.stride)
    address.sin_family = sa_family_t(AF_INET)
    address.sin_port = UInt16(port).bigEndian
    address.sin_addr = in_addr(s_addr: inet_addr("127.0.0.1"))

    return withUnsafePointer(to: &address) { pointer in
      pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { socketAddress in
        bind(descriptor, socketAddress, socklen_t(MemoryLayout<sockaddr_in>.stride)) == 0
      }
    }
  }

  private func canBindIPv6(_ port: Int) -> Bool {
    let descriptor = socket(AF_INET6, SOCK_STREAM, 0)
    guard descriptor >= 0 else {
      return false
    }
    defer { close(descriptor) }

    var value: Int32 = 1
    _ = withUnsafePointer(to: &value) { pointer in
      setsockopt(descriptor, IPPROTO_IPV6, IPV6_V6ONLY, pointer, socklen_t(MemoryLayout<Int32>.stride))
    }

    var address = sockaddr_in6()
    address.sin6_len = UInt8(MemoryLayout<sockaddr_in6>.stride)
    address.sin6_family = sa_family_t(AF_INET6)
    address.sin6_port = UInt16(port).bigEndian
    address.sin6_addr = in6addr_loopback

    return withUnsafePointer(to: &address) { pointer in
      pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { socketAddress in
        bind(descriptor, socketAddress, socklen_t(MemoryLayout<sockaddr_in6>.stride)) == 0
      }
    }
  }

  private func terminateAndWait(process: Process) {
    guard process.isRunning else {
      return
    }

    process.terminate()

    let deadline = Date().addingTimeInterval(2)
    while process.isRunning && Date() < deadline {
      RunLoop.current.run(mode: .default, before: Date().addingTimeInterval(0.05))
    }

    if process.isRunning {
      kill(process.processIdentifier, SIGKILL)
      process.waitUntilExit()
    }
  }

  private func openFileOrParent(_ url: URL) {
    if fileManager.fileExists(atPath: url.path) {
      NSWorkspace.shared.activateFileViewerSelecting([url])
    } else {
      NSWorkspace.shared.activateFileViewerSelecting([url.deletingLastPathComponent()])
    }
  }

  private func cleanupGeneratedArtifacts(for instance: BridgeInstance) -> Error? {
    guard let resolved = try? resolvedConfiguration(for: instance) else {
      return nil
    }

    do {
      try removeGeneratedArtifacts(for: resolved)
      return nil
    } catch {
      return error
    }
  }

  private func removeGeneratedArtifacts(for resolved: ResolvedBridgeConfiguration) throws {
    for directoryURL in resolved.artifactDirectoryURLs {
      guard fileManager.fileExists(atPath: directoryURL.path) else {
        continue
      }
      try fileManager.removeItem(at: directoryURL)
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
        self?.objectWillChange.send()
      }
      .store(in: &cancellables)

    instance.$slug
      .sink { [weak self] _ in
        self?.saveState()
      }
      .store(in: &cancellables)

    instance.$displayName
      .sink { [weak self] _ in
        self?.saveState()
      }
      .store(in: &cancellables)

    instance.$figmaFileLabel
      .sink { [weak self] _ in
        self?.saveState()
      }
      .store(in: &cancellables)

    instance.$portOverride
      .sink { [weak self] _ in
        self?.saveState()
      }
      .store(in: &cancellables)

    instance.$autoBuild
      .sink { [weak self] _ in
        self?.saveState()
      }
      .store(in: &cancellables)
  }

  private func startHealthRefreshLoop() {
    healthRefreshTask?.cancel()
    healthRefreshTask = Task { [weak self] in
      while !Task.isCancelled {
        guard let self else {
          return
        }

        await self.refreshAllConnectionHealth()

        do {
          try await Task.sleep(for: .seconds(2))
        } catch {
          return
        }
      }
    }
  }

  private func normalizePortOverride(_ rawValue: String) throws -> String {
    let trimmed = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else {
      return ""
    }

    guard let port = Int(trimmed) else {
      throw BridgeConfigurationError.invalidPort(trimmed)
    }

    guard (1...65535).contains(port) else {
      throw BridgeConfigurationError.outOfRangePort(port)
    }

    return String(port)
  }

  private func waitForInstanceToStop(_ instance: BridgeInstance) async throws {
    for _ in 0..<120 {
      if !instance.status.isBusy && !instance.status.isRunning && instance.bridgeProcess == nil && instance.buildProcess == nil {
        return
      }

      try await Task.sleep(for: .milliseconds(50))
    }

    throw NSError(
      domain: "FigmaAutoBridgeMenu",
      code: 3,
      userInfo: [NSLocalizedDescriptionKey: "Timed out while waiting for the bridge to restart."]
    )
  }

  private func clearInstanceError(for instance: BridgeInstance) {
    switch instance.status {
    case let .stopped(lastExitCode):
      instance.setStatus(.stopped(lastExitCode: lastExitCode))
    case .failed:
      instance.setStatus(.stopped(lastExitCode: nil))
    case let .running(pid):
      instance.setStatus(.running(pid: pid))
    case .building, .starting, .stopping:
      break
    }
  }

  private func refreshAllConnectionHealth() async {
    for instance in instances {
      await refreshConnectionHealth(for: instance)
    }
  }

  private func refreshConnectionHealth(for instance: BridgeInstance) async {
    guard instance.status.isRunning else {
      if instance.connectionState != .idle {
        instance.setConnectionState(.idle)
      }
      return
    }

    do {
      let resolved = try resolvedConfiguration(for: instance)
      let result = try await BridgeHealthProbe.fetchSessionStatus(mcpURL: resolved.mcpURL)
      if result.connected, let session = result.session {
        instance.setConnectionState(.connected(BridgeSessionDetails(
          fileKey: session.fileKey,
          pageId: session.pageId,
          lastSeenAt: session.lastSeenAt
        )))
      } else {
        instance.setConnectionState(.waitingForPlugin)
      }
    } catch {
      instance.setConnectionState(.unreachable(error.localizedDescription))
    }
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
    if let bundledRuntimeURL = bundledRuntimeRoot(fileManager: fileManager) {
      return bundledRuntimeURL
    }

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

  private static func bundledRuntimeRoot(fileManager: FileManager) -> URL? {
    guard let resourceURL = Bundle.main.resourceURL else {
      return nil
    }

    let bundledRuntimeURL = resourceURL.appendingPathComponent("figma-auto-runtime", isDirectory: true)
    guard isWorkspaceRootCandidate(bundledRuntimeURL, fileManager: fileManager) else {
      return nil
    }

    return bundledRuntimeURL
  }

  private static func walkUpForWorkspaceRoot(startingAt url: URL, fileManager: FileManager) -> URL? {
    var currentURL = url.resolvingSymlinksInPath()
    while true {
      if isWorkspaceRootCandidate(currentURL, fileManager: fileManager) {
        return currentURL
      }

      let parentURL = currentURL.deletingLastPathComponent()
      if parentURL.path == currentURL.path {
        return nil
      }
      currentURL = parentURL
    }
  }

  private static func isWorkspaceRootCandidate(_ url: URL, fileManager: FileManager) -> Bool {
    let packageURL = url.appendingPathComponent("package.json")
    let bridgeSourceURL = url
      .appendingPathComponent("apps", isDirectory: true)
      .appendingPathComponent("mcp-bridge", isDirectory: true)
      .appendingPathComponent("src", isDirectory: true)
      .appendingPathComponent("index.ts")
    let bridgeDistURL = url
      .appendingPathComponent("apps", isDirectory: true)
      .appendingPathComponent("mcp-bridge", isDirectory: true)
      .appendingPathComponent("dist", isDirectory: true)
      .appendingPathComponent("index.js")

    guard fileManager.fileExists(atPath: packageURL.path) else {
      return false
    }

    return fileManager.fileExists(atPath: bridgeSourceURL.path) || fileManager.fileExists(atPath: bridgeDistURL.path)
  }

  private static func bootstrapInstanceConfigs(
    workspaceRootURL: URL?,
    fileManager: FileManager
  ) -> [BridgeInstanceConfig] {
    guard let workspaceRootURL else {
      return BridgeConfigurationResolver.defaultProductInstances()
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

    if names.isEmpty {
      return BridgeConfigurationResolver.defaultProductInstances()
    }

    let preferred = BridgeConfigurationResolver.defaultProductInstances()
    let preferredBySlug = Dictionary(uniqueKeysWithValues: preferred.map { ($0.slug, $0) })
    return names.map { slug in
      if let preferredConfig = preferredBySlug[slug] {
        return preferredConfig
      }

      return BridgeInstanceConfig(
        slug: slug,
        displayName: slug,
        figmaFileLabel: slug
      )
    }
  }
}
