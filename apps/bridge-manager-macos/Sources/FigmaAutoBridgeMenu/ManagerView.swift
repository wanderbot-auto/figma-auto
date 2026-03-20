import SwiftUI

struct MenuBarLabel: View {
  @EnvironmentObject private var store: BridgeStore

  var body: some View {
    HStack(spacing: 6) {
      Image(systemName: "point.3.connected.trianglepath.dotted")
      Text("\(store.runningCount)")
        .font(.system(size: 11, weight: .semibold, design: .rounded))
    }
    .foregroundStyle(store.runningCount > 0 ? BridgePalette.primary100 : BridgePalette.text200)
  }
}

struct ManagerView: View {
  @EnvironmentObject private var store: BridgeStore

  var body: some View {
    ZStack {
      LinearGradient(
        colors: [
          BridgePalette.primary300.opacity(0.55),
          BridgePalette.bg100,
          BridgePalette.bg200
        ],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
      )
      .ignoresSafeArea()

      ScrollView {
        VStack(alignment: .leading, spacing: 12) {
          header
          summarySection

          if let globalErrorMessage = store.globalErrorMessage {
            Text(globalErrorMessage)
              .font(.caption.weight(.medium))
              .foregroundStyle(.white)
              .padding(.horizontal, 12)
              .padding(.vertical, 8)
              .background(
                RoundedRectangle(cornerRadius: 12)
                  .fill(BridgePalette.accent200)
              )
          }

          LazyVStack(spacing: 8) {
            ForEach(store.instances) { instance in
              BridgeInstanceCard(instance: instance)
                .environmentObject(store)
            }
          }

          footer
        }
      }
      .padding(12)
    }
    .frame(width: 680, height: 520)
    .background(BridgePalette.panel)
  }

  private var header: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(alignment: .center) {
        VStack(alignment: .leading, spacing: 4) {
          Text("Bridge Control Surface")
            .font(.system(size: 21, weight: .bold, design: .rounded))
            .foregroundStyle(BridgePalette.text100)
          Text("Compact menu bar control for figma-auto bridges.")
            .font(.caption)
            .foregroundStyle(BridgePalette.text200)
        }

        Spacer()

        Menu {
          Button("Reveal Workspace") {
            store.revealWorkspaceRoot()
          }
          .disabled(store.workspaceRootURL == nil)

          Button("Build All") {
            store.buildAll()
          }
          .disabled(store.instances.isEmpty)

          Button("Stop All") {
            store.stopAll()
          }
          .disabled(store.instances.isEmpty)

          Divider()

          Button("Quit") {
            NSApplication.shared.terminate(nil)
          }
        } label: {
          Image(systemName: "ellipsis.circle")
            .font(.system(size: 18, weight: .semibold))
            .foregroundStyle(BridgePalette.text200)
            .frame(width: 28, height: 28)
        }
        .menuStyle(.borderlessButton)
      }

      VStack(alignment: .leading, spacing: 8) {
        HStack(alignment: .center, spacing: 10) {
          Label("Workspace", systemImage: "folder.fill")
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(BridgePalette.text100)
          Text(store.workspaceRootURL?.path ?? "Not configured")
            .font(.system(size: 11, weight: .medium, design: .monospaced))
            .foregroundStyle(BridgePalette.text200)
            .textSelection(.enabled)
            .lineLimit(1)
            .truncationMode(.middle)
        }

        HStack(spacing: 8) {
          Button("Choose Workspace") {
            store.chooseWorkspaceRoot()
          }
          .buttonStyle(ChromeButtonStyle(fill: BridgePalette.primary100))

          Button("Reveal Workspace") {
            store.revealWorkspaceRoot()
          }
          .buttonStyle(ChromeButtonStyle(fill: BridgePalette.bg200, foreground: BridgePalette.text100, border: BridgePalette.border))
          .disabled(store.workspaceRootURL == nil)

          Button("Add Instance") {
            store.addInstance()
          }
          .buttonStyle(ChromeButtonStyle(fill: BridgePalette.accent100))
        }
      }
    }
    .padding(14)
    .background(
      RoundedRectangle(cornerRadius: 18)
        .fill(BridgePalette.bg100)
        .overlay(
          RoundedRectangle(cornerRadius: 18)
            .strokeBorder(BridgePalette.border)
        )
    )
  }

  private var summarySection: some View {
    HStack(spacing: 14) {
      SummaryChip(title: "Running", value: "\(store.runningCount)", tint: BridgePalette.primary100, icon: "bolt.horizontal.circle.fill")
      SummaryChip(title: "Stopped", value: "\(store.stoppedCount)", tint: BridgePalette.bg100, icon: "pause.circle.fill", foreground: BridgePalette.text100, border: BridgePalette.border)
    }
  }

  private var footer: some View {
    HStack {
      Text("Menu bar only. No Dock icon. State persists between launches.")
        .font(.footnote)
        .foregroundStyle(BridgePalette.text200)

      Spacer()

      Text("Instances: \(store.instances.count)")
        .font(.footnote.weight(.semibold))
        .foregroundStyle(BridgePalette.text200)
    }
    .padding(.horizontal, 6)
  }
}

struct BridgeInstanceCard: View {
  @EnvironmentObject private var store: BridgeStore
  @ObservedObject var instance: BridgeInstance
  @State private var isDetailsExpanded = false

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(alignment: .center, spacing: 14) {
        VStack(alignment: .leading, spacing: 8) {
          HStack(alignment: .center, spacing: 12) {
            ZStack {
              Circle()
                .fill(instance.status.tint.opacity(0.18))
                .frame(width: 36, height: 36)
              Image(systemName: instance.status.symbolName)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(instance.status.tint)
            }

            VStack(alignment: .leading, spacing: 6) {
              TextField("Instance name", text: $instance.name)
                .textFieldStyle(.roundedBorder)
                .font(.subheadline.weight(.semibold))
                .frame(maxWidth: 210)

              HStack(spacing: 8) {
                StatusBadge(status: instance.status)
                Text(resolvedPortText)
                  .font(.caption2.monospaced())
                  .foregroundStyle(BridgePalette.text200)
              }
            }
          }

          HStack(spacing: 8) {
            MetaPill(title: "ID", value: instance.normalizedName.isEmpty ? "Invalid" : instance.normalizedName, tint: BridgePalette.primary300)
          }
        }

        Spacer()
      }

      HStack(spacing: 8) {
        Button("Start") {
          store.start(instance)
        }
        .buttonStyle(ChromeButtonStyle(fill: BridgePalette.primary100))
        .disabled(instance.status.isBusy || instance.status.isRunning)

        Button("Stop") {
          store.stop(instance)
        }
        .buttonStyle(ChromeButtonStyle(fill: BridgePalette.bg200, foreground: BridgePalette.text100, border: BridgePalette.border))
        .disabled(!instance.status.isRunning && !instance.status.isBusy)

        Button(isDetailsExpanded ? "Hide Details" : "Details") {
          isDetailsExpanded.toggle()
        }
        .buttonStyle(ChromeButtonStyle(fill: BridgePalette.accent100))

        Spacer()

        Button("Remove") {
          store.removeInstance(instance)
        }
        .buttonStyle(ChromeButtonStyle(fill: BridgePalette.text100))
      }

      if let errorMessage = instance.lastErrorMessage {
        Label(errorMessage, systemImage: "exclamationmark.triangle.fill")
          .font(.caption.weight(.semibold))
          .foregroundStyle(.white)
          .padding(.horizontal, 12)
          .padding(.vertical, 8)
          .background(
            Capsule()
              .fill(BridgePalette.accent200)
          )
      }

      if isDetailsExpanded {
        statusSection
          .transition(.opacity.combined(with: .move(edge: .top)))
      }
    }
    .padding(14)
    .background(
      RoundedRectangle(cornerRadius: 18)
        .fill(BridgePalette.bg100)
        .overlay(
          RoundedRectangle(cornerRadius: 18)
            .strokeBorder(
              BridgePalette.border,
              lineWidth: 1
            )
        )
    )
  }

  @ViewBuilder
  private var statusSection: some View {
    VStack(alignment: .leading, spacing: 8) {
      if let resolved = try? store.resolvedConfiguration(for: instance) {
        VStack(alignment: .leading, spacing: 8) {
          HStack(alignment: .center) {
            Toggle("Auto build on start", isOn: $instance.autoBuild)
              .toggleStyle(.switch)
              .font(.caption)

            Spacer()

            Menu {
              Button("Build") {
                store.build(instance)
              }
              .disabled(instance.status.isBusy)

              Button("Open Manifest") {
                store.openManifest(for: instance)
              }

              Button("Open Logs") {
                store.openLogs(for: instance)
              }

              Divider()

              Button("Remove Instance") {
                store.removeInstance(instance)
              }
            } label: {
              Label("More", systemImage: "ellipsis")
                .font(.caption.weight(.semibold))
                .foregroundStyle(BridgePalette.text100)
                .padding(.horizontal, 10)
                .padding(.vertical, 7)
                .background(
                  RoundedRectangle(cornerRadius: 10)
                    .fill(BridgePalette.bg200)
                    .overlay(
                      RoundedRectangle(cornerRadius: 10)
                        .strokeBorder(BridgePalette.border)
                    )
                )
            }
            .menuStyle(.borderlessButton)
          }

          DetailRow(icon: "shippingbox.fill", title: "Manifest", value: resolved.manifestURL.path, tint: BridgePalette.primary300, foreground: BridgePalette.primary100)
          DetailRow(icon: "doc.text.fill", title: "Bridge Log", value: resolved.bridgeLogURL.path, tint: BridgePalette.bg200, foreground: BridgePalette.text100)
          DetailRow(icon: "waveform.path.ecg.rectangle.fill", title: "Audit Log", value: resolved.auditLogURL.path, tint: BridgePalette.bg200, foreground: BridgePalette.text100)
          DetailRow(icon: "network", title: "HTTP", value: resolved.bridgeHTTPURL, tint: BridgePalette.primary300, foreground: BridgePalette.primary100)
        }
      }
    }
  }

  private var resolvedPortText: String {
    guard let resolved = try? store.resolvedConfiguration(for: instance) else {
      return "Invalid"
    }
    return String(resolved.bridgePort)
  }
}

private struct StatusBadge: View {
  let status: BridgeRuntimeStatus

  var body: some View {
    HStack(spacing: 6) {
      Circle()
        .fill(status.tint)
        .frame(width: 8, height: 8)
      Text(status.badgeTitle)
        .font(.caption.weight(.bold))
    }
    .foregroundStyle(status == .stopped(lastExitCode: nil) ? BridgePalette.text100 : .white)
    .padding(.horizontal, 10)
    .padding(.vertical, 6)
    .background(
      Capsule()
        .fill(status.tint)
    )
  }
}

private struct SummaryChip: View {
  let title: String
  let value: String
  let tint: Color
  let icon: String
  var foreground: Color = .white
  var border: Color? = nil

  var body: some View {
    HStack(spacing: 10) {
      Image(systemName: icon)
        .font(.subheadline.weight(.semibold))
      VStack(alignment: .leading, spacing: 2) {
        Text(value)
          .font(.system(size: 18, weight: .bold, design: .rounded))
        Text(title)
          .font(.caption2.weight(.semibold))
          .textCase(.uppercase)
      }
    }
    .foregroundStyle(foreground)
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.horizontal, 12)
    .padding(.vertical, 10)
    .background(
      RoundedRectangle(cornerRadius: 14)
        .fill(tint)
        .overlay(
          RoundedRectangle(cornerRadius: 14)
            .strokeBorder(border ?? .clear)
        )
    )
  }
}

private struct MetaPill: View {
  let title: String
  let value: String
  let tint: Color

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(title)
        .font(.caption2.weight(.bold))
        .foregroundStyle(BridgePalette.text200)
      Text(value)
        .font(.system(size: 12, weight: .semibold, design: .monospaced))
        .foregroundStyle(BridgePalette.text100)
    }
    .padding(.horizontal, 10)
    .padding(.vertical, 8)
    .background(
      RoundedRectangle(cornerRadius: 12)
        .fill(tint)
        .overlay(
          RoundedRectangle(cornerRadius: 12)
            .strokeBorder(BridgePalette.border.opacity(0.5))
        )
    )
  }
}

private struct DetailRow: View {
  let icon: String
  let title: String
  let value: String
  let tint: Color
  var foreground: Color = .white

  var body: some View {
    HStack(alignment: .top, spacing: 10) {
      ZStack {
        RoundedRectangle(cornerRadius: 10)
          .fill(tint)
          .frame(width: 30, height: 30)
        Image(systemName: icon)
          .font(.system(size: 13, weight: .bold))
          .foregroundStyle(foreground)
      }

      VStack(alignment: .leading, spacing: 3) {
        Text(title)
          .font(.caption.weight(.bold))
          .foregroundStyle(BridgePalette.text200)
        Text(value)
          .font(.system(size: 12, weight: .medium, design: .monospaced))
          .foregroundStyle(BridgePalette.text100)
          .textSelection(.enabled)
      }
    }
  }
}

private struct ChromeButtonStyle: ButtonStyle {
  let fill: Color
  var foreground: Color = .white
  var border: Color? = nil

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(.system(size: 12, weight: .semibold))
      .foregroundStyle(foreground.opacity(configuration.isPressed ? 0.9 : 1))
      .padding(.horizontal, 10)
      .padding(.vertical, 7)
      .background(
        RoundedRectangle(cornerRadius: 10)
          .fill(fill.opacity(configuration.isPressed ? 0.82 : 1))
          .overlay(
            RoundedRectangle(cornerRadius: 10)
              .strokeBorder(border ?? .clear)
          )
      )
      .scaleEffect(configuration.isPressed ? 0.98 : 1)
      .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
  }
}
