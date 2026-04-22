import Foundation

struct BridgeManagerState: Codable {
  var workspaceRootPath: String?
  var instances: [BridgeInstanceConfig]
}

struct BridgeInstanceConfig: Codable, Identifiable, Equatable {
  var id: UUID
  var slug: String
  var displayName: String
  var figmaFileLabel: String
  var portOverride: String
  var autoBuild: Bool

  init(
    id: UUID = UUID(),
    slug: String,
    displayName: String,
    figmaFileLabel: String = "",
    portOverride: String = "",
    autoBuild: Bool = false
  ) {
    let bridgeName = BridgeConfigurationResolver.canonicalBridgeName(
      candidates: [slug, displayName, figmaFileLabel]
    )
    self.id = id
    self.slug = bridgeName
    self.displayName = bridgeName
    self.figmaFileLabel = bridgeName
    self.portOverride = portOverride
    self.autoBuild = autoBuild
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    id = try container.decodeIfPresent(UUID.self, forKey: .id) ?? UUID()

    let legacyName = try container.decodeIfPresent(String.self, forKey: .name) ?? ""
    let decodedSlug = try container.decodeIfPresent(String.self, forKey: .slug) ?? legacyName
    let decodedDisplayName = try container.decodeIfPresent(String.self, forKey: .displayName)
      ?? ""
    let decodedFileLabel = try container.decodeIfPresent(String.self, forKey: .figmaFileLabel)
      ?? ""
    let bridgeName = BridgeConfigurationResolver.canonicalBridgeName(
      candidates: [decodedSlug, decodedDisplayName, decodedFileLabel, legacyName]
    )
    slug = bridgeName
    displayName = bridgeName
    figmaFileLabel = bridgeName

    portOverride = try container.decodeIfPresent(String.self, forKey: .portOverride) ?? ""
    autoBuild = try container.decodeIfPresent(Bool.self, forKey: .autoBuild) ?? false
  }

  func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(id, forKey: .id)
    try container.encode(slug, forKey: .slug)
    try container.encode(displayName, forKey: .displayName)
    try container.encode(figmaFileLabel, forKey: .figmaFileLabel)
    try container.encode(portOverride, forKey: .portOverride)
    try container.encode(autoBuild, forKey: .autoBuild)
  }

  private enum CodingKeys: String, CodingKey {
    case id
    case slug
    case displayName
    case figmaFileLabel
    case portOverride
    case autoBuild
    case name
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

  var mcpURL: String {
    "\(bridgeHTTPURL)/mcp"
  }

  var pluginRootURL: URL {
    manifestURL.deletingLastPathComponent()
  }

  var artifactDirectoryURLs: [URL] {
    var urls = [pluginRootURL]

    let logRootURLs = [bridgeLogURL, auditLogURL]
      .map { $0.deletingLastPathComponent() }
      .filter { url in
        !urls.contains { $0.path == url.path }
      }
    urls.append(contentsOf: logRootURLs)

    return urls
  }

  func pluginAssetsExist(fileManager: FileManager = .default) -> Bool {
    let requiredPaths = [
      manifestURL.path,
      pluginDistURL.appendingPathComponent("code.js").path,
      pluginDistURL.appendingPathComponent("ui.html").path
    ]

    return requiredPaths.allSatisfy { fileManager.fileExists(atPath: $0) }
  }
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
  private static let wordsToKeepUppercase = Set(["mcp", "api", "ios", "web"])

  static func normalizeInstanceName(_ rawValue: String) -> String {
    let allowed = CharacterSet.alphanumerics
    let lowercased = rawValue.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    var scalars: [UnicodeScalar] = []
    var lastWasHyphen = false

    for scalar in lowercased.unicodeScalars {
      if allowed.contains(scalar) {
        scalars.append(scalar)
        lastWasHyphen = false
      } else if !scalars.isEmpty && !lastWasHyphen {
        scalars.append(UnicodeScalar(UInt8(ascii: "-")))
        lastWasHyphen = true
      }
    }

    let normalized = String(String.UnicodeScalarView(scalars)).trimmingCharacters(in: CharacterSet(charactersIn: "-"))
    return normalized
  }

  static func isValidBridgeName(_ rawValue: String) -> Bool {
    let trimmed = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else {
      return false
    }

    return normalizeInstanceName(trimmed) == trimmed
  }

  static func canonicalBridgeName(candidates: [String]) -> String {
    for candidate in candidates {
      let normalized = normalizeInstanceName(candidate)
      if !normalized.isEmpty {
        return normalized
      }
    }

    return "bridge-name"
  }

  static func displayName(for slug: String) -> String {
    let normalizedSlug = normalizeInstanceName(slug)
    guard !normalizedSlug.isEmpty else {
      return "Untitled Instance"
    }

    return normalizedSlug
      .split(separator: "-", omittingEmptySubsequences: true)
      .map { segment in
        let value = String(segment)
        if wordsToKeepUppercase.contains(value) {
          return value.uppercased()
        }
        return value.prefix(1).uppercased() + value.dropFirst()
      }
      .joined(separator: " ")
  }

  static func fallbackSlug(for rawValue: String) -> String {
    let fallback = normalizeInstanceName(rawValue)
    if !fallback.isEmpty {
      return fallback
    }
    return "bridge-name"
  }

  static func defaultProductInstances() -> [BridgeInstanceConfig] {
    [
      BridgeInstanceConfig(
        slug: "marketing-landing",
        displayName: "marketing-landing",
        figmaFileLabel: "marketing-landing"
      ),
      BridgeInstanceConfig(
        slug: "product-flow",
        displayName: "product-flow",
        figmaFileLabel: "product-flow"
      ),
      BridgeInstanceConfig(
        slug: "design-system",
        displayName: "design-system",
        figmaFileLabel: "design-system"
      )
    ]
  }

  static func makeCustomInstanceConfig(existingConfigs: [BridgeInstanceConfig]) -> BridgeInstanceConfig {
    let existingSlugs = Set(existingConfigs.map { normalizeInstanceName($0.slug) })
    let slug = makeUniqueSlug(base: "bridge-name", existingSlugs: existingSlugs)
    return BridgeInstanceConfig(
      slug: slug,
      displayName: slug,
      figmaFileLabel: slug
    )
  }

  private static func makeUniqueSlug(base: String, existingSlugs: Set<String>) -> String {
    let normalizedBase = normalizeInstanceName(base)
    guard !existingSlugs.contains(normalizedBase) else {
      var suffix = 2
      while existingSlugs.contains("\(normalizedBase)-\(suffix)") {
        suffix += 1
      }
      return "\(normalizedBase)-\(suffix)"
    }

    return normalizedBase
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

    let fileManager = FileManager.default
    let packageURL = workspaceRoot.appendingPathComponent("package.json")
    let bridgeSourceURL = workspaceRoot
      .appendingPathComponent("apps", isDirectory: true)
      .appendingPathComponent("mcp-bridge", isDirectory: true)
      .appendingPathComponent("src", isDirectory: true)
      .appendingPathComponent("index.ts")
    let bridgeDistURL = workspaceRoot
      .appendingPathComponent("apps", isDirectory: true)
      .appendingPathComponent("mcp-bridge", isDirectory: true)
      .appendingPathComponent("dist", isDirectory: true)
      .appendingPathComponent("index.js")

    guard
      fileManager.fileExists(atPath: packageURL.path),
      fileManager.fileExists(atPath: bridgeSourceURL.path) || fileManager.fileExists(atPath: bridgeDistURL.path)
    else {
      throw BridgeConfigurationError.invalidWorkspaceRoot(workspaceRoot)
    }

    let instanceName = normalizeInstanceName(config.slug)
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
