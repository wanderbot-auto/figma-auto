import Foundation

struct BridgeProbeSessionStatus: Decodable, Equatable {
  let connected: Bool
  let host: String
  let port: Int
  let publicWsUrl: String
  let publicHttpUrl: String
  let session: BridgeProbeSession?
}

struct BridgeProbeSession: Decodable, Equatable {
  let sessionId: String
  let pluginInstanceId: String
  let fileKey: String?
  let pageId: String
  let editorType: String
  let connectedAt: String
  let lastSeenAt: String
}

enum BridgeHealthProbe {
  private static let protocolVersion = "2025-03-26"

  static func fetchSessionStatus(mcpURL: String) async throws -> BridgeProbeSessionStatus {
    guard let url = URL(string: mcpURL) else {
      throw BridgeHealthProbeError.invalidURL(mcpURL)
    }

    let sessionID = try await initializeSession(url: url)
    defer {
      Task {
        try? await closeSession(url: url, sessionID: sessionID)
      }
    }

    try await sendInitializedNotification(url: url, sessionID: sessionID)
    let response = try await sendJSONRequest(
      url: url,
      sessionID: sessionID,
      body: [
        "jsonrpc": "2.0",
        "id": "bridge-status",
        "method": "tools/call",
        "params": [
          "name": "figma.get_session_status",
          "arguments": [String: Any]()
        ]
      ]
    )

    guard
      let result = response["result"] as? [String: Any],
      let content = result["content"] as? [[String: Any]],
      let firstContent = content.first,
      let text = firstContent["text"] as? String
    else {
      throw BridgeHealthProbeError.invalidToolResponse
    }

    let data = Data(text.utf8)
    return try JSONDecoder().decode(BridgeProbeSessionStatus.self, from: data)
  }

  private static func initializeSession(url: URL) async throws -> String {
    let response = try await sendJSONRequest(
      url: url,
      sessionID: nil,
      body: [
        "jsonrpc": "2.0",
        "id": "bridge-init",
        "method": "initialize",
        "params": [
          "protocolVersion": protocolVersion,
          "capabilities": [String: Any](),
          "clientInfo": [
            "name": "figma-auto-bridge-menu",
            "version": Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.0"
          ]
        ]
      ]
    )

    guard let sessionID = response["mcpSessionId"] as? String else {
      throw BridgeHealthProbeError.missingSessionHeader
    }

    return sessionID
  }

  private static func sendInitializedNotification(url: URL, sessionID: String) async throws {
    _ = try await sendJSONRequest(
      url: url,
      sessionID: sessionID,
      body: [
        "jsonrpc": "2.0",
        "method": "notifications/initialized"
      ]
    )
  }

  private static func closeSession(url: URL, sessionID: String) async throws {
    var request = URLRequest(url: url)
    request.httpMethod = "DELETE"
    request.setValue(sessionID, forHTTPHeaderField: "mcp-session-id")

    let (_, response) = try await URLSession.shared.data(for: request)
    guard let httpResponse = response as? HTTPURLResponse, (200...299).contains(httpResponse.statusCode) else {
      return
    }
  }

  private static func sendJSONRequest(
    url: URL,
    sessionID: String?,
    body: [String: Any]
  ) async throws -> [String: Any] {
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "content-type")
    request.setValue("application/json, text/event-stream", forHTTPHeaderField: "accept")
    if let sessionID {
      request.setValue(sessionID, forHTTPHeaderField: "mcp-session-id")
    }
    request.httpBody = try JSONSerialization.data(withJSONObject: body, options: [])

    let (data, response) = try await URLSession.shared.data(for: request)
    guard let httpResponse = response as? HTTPURLResponse else {
      throw BridgeHealthProbeError.invalidHTTPResponse
    }

    guard (200...299).contains(httpResponse.statusCode) else {
      throw BridgeHealthProbeError.httpStatus(httpResponse.statusCode)
    }

    if data.isEmpty {
      return [
        "mcpSessionId": httpResponse.value(forHTTPHeaderField: "mcp-session-id") as Any
      ]
    }

    guard let payload = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
      throw BridgeHealthProbeError.invalidJSONPayload
    }

    var enrichedPayload = payload
    if let sessionHeader = httpResponse.value(forHTTPHeaderField: "mcp-session-id") {
      enrichedPayload["mcpSessionId"] = sessionHeader
    }
    return enrichedPayload
  }
}

enum BridgeHealthProbeError: LocalizedError {
  case invalidURL(String)
  case invalidHTTPResponse
  case httpStatus(Int)
  case invalidJSONPayload
  case missingSessionHeader
  case invalidToolResponse

  var errorDescription: String? {
    switch self {
    case let .invalidURL(url):
      return "Invalid MCP URL: \(url)"
    case .invalidHTTPResponse:
      return "Bridge health check received an invalid HTTP response."
    case let .httpStatus(statusCode):
      return "Bridge health check failed with HTTP \(statusCode)."
    case .invalidJSONPayload:
      return "Bridge health check returned malformed JSON."
    case .missingSessionHeader:
      return "Bridge health check could not open an MCP session."
    case .invalidToolResponse:
      return "Bridge health check returned an unexpected MCP payload."
    }
  }
}
