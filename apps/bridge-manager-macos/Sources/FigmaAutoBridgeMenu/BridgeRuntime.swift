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
      return BridgePalette.primary100
    case .building, .starting:
      return BridgePalette.accent100
    case .stopping, .stopped:
      return BridgePalette.bg300
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

@MainActor
final class BridgeInstance: ObservableObject, Identifiable {
  let id: UUID

  @Published var name: String
  @Published var portOverride: String
  @Published var autoBuild: Bool
  @Published private(set) var status: BridgeRuntimeStatus = .stopped(lastExitCode: nil)
  @Published private(set) var lastErrorMessage: String?

  var bridgeProcess: Process?
  var buildProcess: Process?
  var bridgeLogHandle: FileHandle?
  var stopRequested = false

  init(config: BridgeInstanceConfig) {
    id = config.id
    name = config.name
    portOverride = config.portOverride
    autoBuild = config.autoBuild
  }

  var config: BridgeInstanceConfig {
    BridgeInstanceConfig(
      id: id,
      name: name,
      portOverride: portOverride,
      autoBuild: autoBuild
    )
  }

  var normalizedName: String {
    BridgeConfigurationResolver.normalizeInstanceName(name)
  }

  func setStatus(_ newStatus: BridgeRuntimeStatus, errorMessage: String? = nil) {
    status = newStatus
    lastErrorMessage = errorMessage
  }
}
