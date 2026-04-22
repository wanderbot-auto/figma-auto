import Combine
import Foundation
import SwiftUI

enum BridgeRuntimeStatus: Equatable {
  case stopped(lastExitCode: Int32?)
  case building
  case starting
  case running(pid: Int32)
  case stopping
  case failed(String)

  var summary: String {
    switch self {
    case let .stopped(lastExitCode):
      if let lastExitCode {
        return "Stopped (\(lastExitCode))"
      }
      return "Stopped"
    case .building:
      return "Building"
    case .starting:
      return "Starting"
    case let .running(pid):
      return "Running (pid \(pid))"
    case .stopping:
      return "Stopping"
    case let .failed(message):
      return "Failed: \(message)"
    }
  }

  var isBusy: Bool {
    switch self {
    case .building, .starting, .stopping:
      return true
    case .stopped, .running, .failed:
      return false
    }
  }

  var isRunning: Bool {
    if case .running = self {
      return true
    }
    return false
  }

  var badgeTitle: String {
    switch self {
    case .stopped:
      return "Stopped"
    case .building:
      return "Building"
    case .starting:
      return "Starting"
    case .running:
      return "Running"
    case .stopping:
      return "Stopping"
    case .failed:
      return "Failed"
    }
  }

  var tint: Color {
    switch self {
    case .running:
      return BridgePalette.success100
    case .building, .starting:
      return BridgePalette.primary100
    case .stopping, .stopped:
      return BridgePalette.text300
    case .failed:
      return BridgePalette.accent200
    }
  }

  var symbolName: String {
    switch self {
    case .running:
      return "bolt.horizontal.circle.fill"
    case .building:
      return "hammer.circle.fill"
    case .starting:
      return "play.circle.fill"
    case .stopping:
      return "stop.circle.fill"
    case .stopped:
      return "pause.circle.fill"
    case .failed:
      return "exclamationmark.triangle.fill"
    }
  }
}

struct BridgeSessionDetails: Equatable {
  let fileKey: String?
  let pageId: String
  let lastSeenAt: String
}

enum BridgeConnectionState: Equatable {
  case idle
  case checking
  case waitingForPlugin
  case connected(BridgeSessionDetails)
  case unreachable(String)

  var badgeTitle: String {
    switch self {
    case .idle:
      return "Idle"
    case .checking:
      return "Checking"
    case .waitingForPlugin:
      return "Run Plugin"
    case .connected:
      return "Connected"
    case .unreachable:
      return "Unavailable"
    }
  }

  var guidance: String {
    switch self {
    case .idle:
      return "Start the local bridge to make this MCP endpoint available."
    case .checking:
      return "Checking bridge health and Figma session status."
    case .waitingForPlugin:
      return "Bridge is ready. Open the matching Figma file and run this plugin instance."
    case let .connected(details):
      if let fileKey = details.fileKey, !fileKey.isEmpty {
        return "Plugin connected. fileKey \(fileKey)"
      }
      return "Plugin connected. Local draft or unpublished file."
    case let .unreachable(message):
      return message
    }
  }
}

@MainActor
final class BridgeInstance: ObservableObject, Identifiable {
  let id: UUID

  @Published var slug: String
  @Published var displayName: String
  @Published var figmaFileLabel: String
  @Published var portOverride: String
  @Published var autoBuild: Bool
  @Published private(set) var status: BridgeRuntimeStatus = .stopped(lastExitCode: nil)
  @Published private(set) var connectionState: BridgeConnectionState = .idle
  @Published private(set) var lastErrorMessage: String?

  var bridgeProcess: Process?
  var buildProcess: Process?
  var bridgeLogHandle: FileHandle?
  var stopRequested = false

  init(config: BridgeInstanceConfig) {
    let bridgeName = BridgeConfigurationResolver.canonicalBridgeName(
      candidates: [config.slug, config.displayName, config.figmaFileLabel]
    )
    id = config.id
    slug = bridgeName
    displayName = bridgeName
    figmaFileLabel = bridgeName
    portOverride = config.portOverride
    autoBuild = config.autoBuild
  }

  var config: BridgeInstanceConfig {
    BridgeInstanceConfig(
      id: id,
      slug: slug,
      displayName: slug,
      figmaFileLabel: slug,
      portOverride: portOverride,
      autoBuild: autoBuild
    )
  }

  var normalizedName: String {
    BridgeConfigurationResolver.normalizeInstanceName(slug)
  }

  func updateBridgeName(_ rawValue: String) {
    let normalized = BridgeConfigurationResolver.normalizeInstanceName(rawValue)
    slug = normalized
    displayName = normalized
    figmaFileLabel = normalized
  }

  func setStatus(_ newStatus: BridgeRuntimeStatus, errorMessage: String? = nil) {
    if status == newStatus && lastErrorMessage == errorMessage {
      return
    }

    status = newStatus
    lastErrorMessage = errorMessage
    if !newStatus.isRunning && !newStatus.isBusy {
      connectionState = .idle
    }
  }

  func setConnectionState(_ newState: BridgeConnectionState) {
    if connectionState == newState {
      return
    }
    connectionState = newState
  }
}
