import Foundation

struct BridgeManagerState: Codable {
  var workspaceRootPath: String?
  var instances: [BridgeInstanceConfig]
}

struct BridgeInstanceConfig: Codable, Identifiable, Equatable {
  var id: UUID
  var name: String
  var portOverride: String
  var autoBuild: Bool

  init(
    id: UUID = UUID(),
    name: String,
    portOverride: String = "",
    autoBuild: Bool = true
  ) {
    self.id = id
    self.name = name
    self.portOverride = portOverride
    self.autoBuild = autoBuild
  }
}

struct ResolvedBridgeConfiguration: Equatable {
  let instanceName: String
  let bridgePort: Int
  let bridgeHost: String
  let bridgeWsURL: String
  let bridgeHTTPURL: String
  let manifestURL: URL
  let pluginDistURL: URL
  let bridgeEntryURL: URL
  let bridgeLogURL: URL
  let auditLogURL: URL
}

enum BridgeConfigurationError: LocalizedError {
  case missingWorkspaceRoot
  case invalidWorkspaceRoot(URL)
  case invalidInstanceName
  case invalidPort(String)
  case outOfRangePort(Int)

  var errorDescription: String? {
    switch self {
    case .missingWorkspaceRoot:
      return "Workspace root is not configured."
    case let .invalidWorkspaceRoot(url):
      return "Workspace root is invalid: \(url.path)"
    case .invalidInstanceName:
      return "Instance name is empty after normalization."
    case let .invalidPort(rawValue):
      return "Invalid port override: \(rawValue)"
    case let .outOfRangePort(port):
      return "Port override must be between 1 and 65535: \(port)"
    }
  }
}

enum BridgeConfigurationResolver {
  static func normalizeInstanceName(_ rawValue: String) -> String {
    let allowed = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyz0123456789._-")
    let lowercased = rawValue.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    var scalars: [UnicodeScalar] = []
    var lastWasHyphen = false

    for scalar in lowercased.unicodeScalars {
      if allowed.contains(scalar) {
        scalars.append(scalar)
        lastWasHyphen = false
      } else if !lastWasHyphen {
        scalars.append(UnicodeScalar(UInt8(ascii: "-")))
        lastWasHyphen = true
      }
    }

    let normalized = String(String.UnicodeScalarView(scalars)).trimmingCharacters(in: CharacterSet(charactersIn: "-"))
    return normalized
  }

  static func deriveInstancePort(defaultPort: Int, instanceName: String) -> Int {
    var hashValue = 0
    for scalar in instanceName.unicodeScalars {
      hashValue = (hashValue * 31 + Int(scalar.value)) % 1000
    }
    return defaultPort + 1 + hashValue
  }

  static func resolveDefaultBridgePort(workspaceRoot: URL) -> Int {
    let protocolFileURL = workspaceRoot
      .appendingPathComponent("packages", isDirectory: true)
      .appendingPathComponent("protocol", isDirectory: true)
      .appendingPathComponent("src", isDirectory: true)
      .appendingPathComponent("messages.ts")

    guard
      let source = try? String(contentsOf: protocolFileURL, encoding: .utf8),
      let regex = try? NSRegularExpression(pattern: #"export const BRIDGE_PORT = ([0-9]+);"#),
      let match = regex.firstMatch(in: source, range: NSRange(source.startIndex..., in: source)),
      let portRange = Range(match.range(at: 1), in: source),
      let port = Int(source[portRange])
    else {
      return 4318
    }

    return port
  }

  static func resolve(
    workspaceRoot: URL?,
    config: BridgeInstanceConfig
  ) throws -> ResolvedBridgeConfiguration {
    guard let workspaceRoot else {
      throw BridgeConfigurationError.missingWorkspaceRoot
    }

    guard FileManager.default.fileExists(atPath: workspaceRoot.appendingPathComponent("package.json").path) else {
      throw BridgeConfigurationError.invalidWorkspaceRoot(workspaceRoot)
    }

    let instanceName = normalizeInstanceName(config.name)
    guard !instanceName.isEmpty else {
      throw BridgeConfigurationError.invalidInstanceName
    }

    let defaultPort = resolveDefaultBridgePort(workspaceRoot: workspaceRoot)
    let bridgePort: Int
    if config.portOverride.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      bridgePort = deriveInstancePort(defaultPort: defaultPort, instanceName: instanceName)
    } else if let overridePort = Int(config.portOverride) {
      guard (1...65535).contains(overridePort) else {
        throw BridgeConfigurationError.outOfRangePort(overridePort)
      }
      bridgePort = overridePort
    } else {
      throw BridgeConfigurationError.invalidPort(config.portOverride)
    }

    let bridgeHost = "localhost"
    let bridgeWsURL = "ws://\(bridgeHost):\(bridgePort)"
    let bridgeHTTPURL = "http://\(bridgeHost):\(bridgePort)"
    let pluginRoot = workspaceRoot
      .appendingPathComponent("apps", isDirectory: true)
      .appendingPathComponent("figma-plugin", isDirectory: true)
    let instanceRoot = pluginRoot
      .appendingPathComponent("instances", isDirectory: true)
      .appendingPathComponent(instanceName, isDirectory: true)
    let logsRoot = workspaceRoot
      .appendingPathComponent("logs", isDirectory: true)
      .appendingPathComponent(instanceName, isDirectory: true)

    return ResolvedBridgeConfiguration(
      instanceName: instanceName,
      bridgePort: bridgePort,
      bridgeHost: bridgeHost,
      bridgeWsURL: bridgeWsURL,
      bridgeHTTPURL: bridgeHTTPURL,
      manifestURL: instanceRoot.appendingPathComponent("manifest.json"),
      pluginDistURL: instanceRoot.appendingPathComponent("dist", isDirectory: true),
      bridgeEntryURL: workspaceRoot
        .appendingPathComponent("apps", isDirectory: true)
        .appendingPathComponent("mcp-bridge", isDirectory: true)
        .appendingPathComponent("dist", isDirectory: true)
        .appendingPathComponent("index.js"),
      bridgeLogURL: logsRoot.appendingPathComponent("bridge.log"),
      auditLogURL: logsRoot.appendingPathComponent("audit.ndjson")
    )
  }
}
