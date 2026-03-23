import AppKit
import Foundation
import SwiftUI

struct MenuBarLabel: View {
  @EnvironmentObject private var store: BridgeStore

  var body: some View {
    HStack(spacing: 6) {
      Image(systemName: "point.3.connected.trianglepath.dotted")
        .font(.system(size: 11, weight: .semibold))
      Text("\(store.runningCount)")
        .font(.system(size: 11, weight: .semibold))
    }
    .foregroundStyle(store.runningCount > 0 ? BridgePalette.primary100 : BridgePalette.text200)
  }
}

private enum ManagerScreen {
  case dashboard
  case logs
}

private enum LogFilterScope: String, CaseIterable, Identifiable {
  case all = "All"
  case info = "Info"
  case debug = "Debug"
  case error = "Error"
  case warn = "Warn"

  var id: String { rawValue }
}

struct ManagerView: View {
  @EnvironmentObject private var store: BridgeStore

  @State private var selectedInstanceID: UUID?
  @State private var screen: ManagerScreen = .dashboard
  @State private var logFilter = ""
  @State private var logEntries: [BridgeLogEntry] = []
  @State private var logScope: LogFilterScope = .all
  @State private var isLogRefreshPaused = false
  @State private var isAutoScrollEnabled = true
  @State private var isDetailsExpanded = false
  @State private var saveFeedbackText: String?
  @State private var utilityFeedbackText: String?
  @State private var saveFeedbackToken = UUID()
  @State private var utilityFeedbackToken = UUID()

  private let logRefreshTimer = Timer.publish(every: 1.2, on: .main, in: .common).autoconnect()

  var body: some View {
    ZStack {
      LinearGradient(
        colors: [
          BridgePalette.canvasTop,
          BridgePalette.canvasBottom
        ],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
      )
      .ignoresSafeArea()

      Group {
        switch screen {
        case .dashboard:
          dashboardScreen
        case .logs:
          logsScreen
        }
      }
      .padding(14)
    }
    .frame(width: 448, height: 620, alignment: .topLeading)
    .onAppear {
      syncSelection()
      refreshLogEntries()
    }
    .onChange(of: store.instances.map(\.id)) { _ in
      syncSelection()
      refreshLogEntries()
    }
    .onChange(of: selectedInstanceID) { _ in
      isDetailsExpanded = false
      refreshLogEntries()
    }
    .onChange(of: screen) { _ in
      refreshLogEntries()
    }
    .onReceive(logRefreshTimer) { _ in
      guard screen == .logs, !isLogRefreshPaused else {
        return
      }
      refreshLogEntries()
    }
  }

  private var selectedInstance: BridgeInstance? {
    if let selectedInstanceID,
       let matched = store.instances.first(where: { $0.id == selectedInstanceID }) {
      return matched
    }
    return store.instances.first
  }

  private var filteredLogEntries: [BridgeLogEntry] {
    logEntries
      .filter(matchesScope)
      .filter(matchesSearch)
  }

  private var dashboardScreen: some View {
    VStack(spacing: 12) {
      dashboardToolbar
      selectedInspector
      bridgeListCard
      footerStrip
    }
  }

  private var logsScreen: some View {
    VStack(spacing: 12) {
      logsToolbar
      logsHero
      if isDetailsExpanded {
        detailsDrawer
      }
      logControls
      logPanel
    }
  }

  private var dashboardToolbar: some View {
    HStack(alignment: .center, spacing: 10) {
      VStack(alignment: .leading, spacing: 3) {
        Text("Bridge Manager")
          .font(.system(size: 18, weight: .semibold))
          .foregroundStyle(BridgePalette.heading)
        Text("Local MCP bridge instances")
          .font(.system(size: 11, weight: .medium))
          .foregroundStyle(BridgePalette.text200)
      }

      Spacer(minLength: 0)

      if let utilityFeedbackText {
        NoticePill(text: utilityFeedbackText)
      }

      MetricPill(label: "Running", value: store.runningCount, tint: BridgePalette.success100)
      MetricPill(label: "Busy", value: store.busyCount, tint: BridgePalette.primary100)
      MetricPill(label: "Failed", value: store.failedCount, tint: BridgePalette.accent200)
      toolbarActionsMenu
    }
  }

  private var selectedInspector: some View {
    VStack(alignment: .leading, spacing: 16) {
      HStack(alignment: .top, spacing: 12) {
        VStack(alignment: .leading, spacing: 6) {
          Text("Selected Instance")
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(BridgePalette.text200)

          Text(selectedInstanceTitle)
            .font(.system(size: 22, weight: .semibold))
            .foregroundStyle(BridgePalette.text100)
            .lineLimit(1)

          if let selectedInstance {
            Text(statusLine(for: selectedInstance))
              .font(.system(size: 12, weight: .medium))
              .foregroundStyle(BridgePalette.text200)
          } else {
            Text("Choose or create a bridge to begin.")
              .font(.system(size: 12, weight: .medium))
              .foregroundStyle(BridgePalette.text200)
          }
        }

        Spacer(minLength: 0)

        if let selectedInstance {
          StatusCapsule(status: selectedInstance.status)
        }
      }

      HStack(spacing: 10) {
        InspectorField(
          title: "Bridge Name",
          text: selectedNameBinding,
          placeholder: "primary-db",
          validationMessage: selectedNameValidationMessage
        )
        InspectorField(
          title: "Port",
          text: selectedPortBinding,
          placeholder: bridgePortPlaceholder,
          width: 116,
          validationMessage: selectedPortValidationMessage
        )
      }

      HStack(spacing: 8) {
        if let selectedInstance {
          Button(selectedInstance.status.isRunning || selectedInstance.status.isBusy ? "Stop" : "Start") {
            toggle(selectedInstance)
          }
          .buttonStyle(AppButtonStyle(kind: selectedInstance.status.isRunning || selectedInstance.status.isBusy ? .secondary : .primary))
          .disabled(hasValidationError)

          Button("Build") {
            store.build(selectedInstance)
          }
          .buttonStyle(AppButtonStyle(kind: .secondary))
          .disabled(selectedInstance.status.isBusy || hasValidationError)

          Button("Logs") {
            openLogsScreen(for: selectedInstance)
          }
          .buttonStyle(AppButtonStyle(kind: .ghost))

          Button(isDetailsExpanded ? "Hide Details" : "Details") {
            isDetailsExpanded.toggle()
          }
          .buttonStyle(AppButtonStyle(kind: .ghost))
        } else {
          Button("Add Bridge") {
            addBridge()
          }
          .buttonStyle(AppButtonStyle(kind: .primary))
        }

        Spacer(minLength: 0)

        if let saveFeedbackText {
          AutoSaveTag(text: saveFeedbackText)
        }
      }

      if let message = activeErrorMessage {
        InlineErrorStrip(message: message)
      }

      if isDetailsExpanded {
        detailsDrawer
      }
    }
    .padding(18)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(cardBackground)
  }

  private var bridgeListCard: some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack {
        VStack(alignment: .leading, spacing: 3) {
          Text("Configured Bridges")
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(BridgePalette.text100)
          Text("\(store.instances.count) total")
            .font(.system(size: 11, weight: .medium))
            .foregroundStyle(BridgePalette.text200)
        }

        Spacer(minLength: 0)

        Button("Add Bridge") {
          addBridge()
        }
        .buttonStyle(AppButtonStyle(kind: .secondary))
      }

      if store.instances.isEmpty {
        EmptyBridgeState(addAction: addBridge)
      } else {
        ScrollView(showsIndicators: false) {
          LazyVStack(spacing: 8) {
            ForEach(store.instances) { instance in
              BridgeRow(
                instance: instance,
                isSelected: instance.id == selectedInstance?.id,
                detailText: statusLine(for: instance),
                visualStyle: visualStyle(for: instance),
                status: instance.status,
                select: {
                  selectedInstanceID = instance.id
                },
                openLogs: {
                  openLogsScreen(for: instance)
                }
              )
              .environmentObject(store)
            }
          }
          .padding(.top, 2)
        }
      }
    }
    .padding(16)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .background(cardBackground)
  }

  private var footerStrip: some View {
    HStack(spacing: 10) {
      VStack(alignment: .leading, spacing: 3) {
        Text("Workspace")
          .font(.system(size: 10, weight: .semibold))
          .foregroundStyle(BridgePalette.text200)
        Text(store.workspaceRootURL?.path ?? "Workspace not configured")
          .font(.system(size: 11, weight: .medium, design: .monospaced))
          .foregroundStyle(BridgePalette.text100)
          .lineLimit(1)
          .truncationMode(.middle)
      }

      Spacer(minLength: 0)

      if let message = store.globalErrorMessage, activeErrorMessage == nil {
        Text(message)
          .font(.system(size: 10, weight: .semibold))
          .foregroundStyle(BridgePalette.accent200)
          .lineLimit(1)
      }
    }
    .padding(.horizontal, 14)
    .padding(.vertical, 10)
    .background(
      RoundedRectangle(cornerRadius: 14, style: .continuous)
        .fill(BridgePalette.footerSurface)
        .overlay(
          RoundedRectangle(cornerRadius: 14, style: .continuous)
            .stroke(BridgePalette.border, lineWidth: 1)
        )
    )
  }

  private var logsToolbar: some View {
    HStack(spacing: 8) {
      Button {
        screen = .dashboard
      } label: {
        Label("Overview", systemImage: "chevron.left")
      }
      .buttonStyle(AppButtonStyle(kind: .secondary))

      instanceSwitcherMenu

      Spacer(minLength: 0)

      if let utilityFeedbackText {
        NoticePill(text: utilityFeedbackText)
      }

      if let selectedInstance {
        Button("Open File") {
          store.openLogs(for: selectedInstance)
        }
        .buttonStyle(AppButtonStyle(kind: .ghost))
      }
    }
  }

  private var logsHero: some View {
    HStack(alignment: .top, spacing: 14) {
      VStack(alignment: .leading, spacing: 8) {
        Text(selectedInstanceTitle)
          .font(.system(size: 22, weight: .semibold))
          .foregroundStyle(BridgePalette.text100)

        if let selectedInstance {
          HStack(spacing: 8) {
            StatusCapsule(status: selectedInstance.status)
            Text("Port \(bridgePortText(for: selectedInstance))")
              .font(.system(size: 12, weight: .semibold))
              .foregroundStyle(BridgePalette.text200)
          }
        }
      }

      Spacer(minLength: 0)

      VStack(alignment: .trailing, spacing: 8) {
        HStack(spacing: 8) {
          if let selectedInstance {
            Button("Start") {
              store.start(selectedInstance)
            }
            .buttonStyle(AppButtonStyle(kind: .primary))
            .disabled(selectedInstance.status.isRunning || selectedInstance.status.isBusy)

            Button("Stop") {
              store.stop(selectedInstance)
            }
            .buttonStyle(AppButtonStyle(kind: .secondary))
            .disabled(!selectedInstance.status.isRunning && !selectedInstance.status.isBusy)
          }
        }

        if selectedInstance != nil {
          Button(isDetailsExpanded ? "Hide Details" : "Details") {
            isDetailsExpanded.toggle()
          }
          .buttonStyle(AppButtonStyle(kind: .ghost))
        }
      }
    }
    .padding(18)
    .background(cardBackground)
  }

  private var logControls: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(spacing: 10) {
        HStack(spacing: 8) {
          Image(systemName: "magnifyingglass")
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(BridgePalette.text300)
          TextField("Filter log messages", text: $logFilter)
            .textFieldStyle(.plain)
            .font(.system(size: 12, weight: .medium))
            .foregroundStyle(BridgePalette.text100)
        }
        .padding(.horizontal, 12)
        .frame(height: 34)
        .background(
          RoundedRectangle(cornerRadius: 11, style: .continuous)
            .fill(.white)
            .overlay(
              RoundedRectangle(cornerRadius: 11, style: .continuous)
                .stroke(BridgePalette.border, lineWidth: 1)
            )
        )

        if !logFilter.isEmpty {
          Button("Clear") {
            logFilter = ""
          }
          .buttonStyle(AppButtonStyle(kind: .ghost))
        }
      }

      HStack(spacing: 8) {
        ForEach(LogFilterScope.allCases) { scope in
          Button(scope.rawValue) {
            logScope = scope
          }
          .buttonStyle(FilterChipStyle(isSelected: logScope == scope))
        }

        Spacer(minLength: 0)

        Text("\(filteredLogEntries.count) entries")
          .font(.system(size: 11, weight: .semibold))
          .foregroundStyle(BridgePalette.text200)
      }

      HStack(spacing: 8) {
        Button(isLogRefreshPaused ? "Resume" : "Pause") {
          isLogRefreshPaused.toggle()
        }
        .buttonStyle(AppButtonStyle(kind: .secondary))

        Button(isAutoScrollEnabled ? "Auto-scroll On" : "Auto-scroll Off") {
          isAutoScrollEnabled.toggle()
        }
        .buttonStyle(AppButtonStyle(kind: .ghost))

        Button("Copy Visible") {
          copyVisibleLogs()
        }
        .buttonStyle(AppButtonStyle(kind: .ghost))

        Spacer(minLength: 0)
      }
    }
  }

  private var logPanel: some View {
    ScrollViewReader { proxy in
      VStack(spacing: 0) {
        HStack(spacing: 10) {
          Circle()
            .fill(isLogRefreshPaused ? BridgePalette.logWarn : BridgePalette.success100)
            .frame(width: 8, height: 8)

          Text("Live Bridge Log")
            .font(.system(size: 11, weight: .bold, design: .monospaced))
            .foregroundStyle(BridgePalette.logHeader)

          Spacer(minLength: 0)

          Text(isLogRefreshPaused ? "paused" : "refreshing every 1.2s")
            .font(.system(size: 10, weight: .medium, design: .monospaced))
            .foregroundStyle(BridgePalette.logMuted)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 11)
        .background(BridgePalette.logHeaderSurface)

        ScrollView(showsIndicators: false) {
          LazyVStack(alignment: .leading, spacing: 0) {
            if filteredLogEntries.isEmpty {
              logEmptyState
            } else {
              ForEach(filteredLogEntries) { entry in
                LogEntryRow(entry: entry)
                  .id(entry.id)
                Divider()
                  .overlay(BridgePalette.logDivider)
              }
            }
          }
        }
        .background(BridgePalette.logSurface)
        .onChange(of: filteredLogEntries.map(\.id)) { ids in
          guard isAutoScrollEnabled, let lastID = ids.last else {
            return
          }
          proxy.scrollTo(lastID, anchor: .bottom)
        }
      }
    }
    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    .overlay(
      RoundedRectangle(cornerRadius: 16, style: .continuous)
        .stroke(BridgePalette.logBorder, lineWidth: 1)
    )
  }

  private var detailsDrawer: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack {
        Text("Instance Details")
          .font(.system(size: 12, weight: .semibold))
          .foregroundStyle(BridgePalette.text100)

        Spacer(minLength: 0)

        Button("Hide") {
          isDetailsExpanded = false
        }
        .buttonStyle(AppButtonStyle(kind: .ghostCompact))
      }

      if let resolved = selectedResolvedConfiguration {
        let selectedInstance = self.selectedInstance

        FileDetailRow(
          title: "HTTP MCP",
          value: resolved.bridgeHTTPURL,
          copyAction: { copyValue(resolved.bridgeHTTPURL, label: "HTTP endpoint") },
          openAction: {
            if let url = URL(string: resolved.bridgeHTTPURL) {
              NSWorkspace.shared.open(url)
            }
          }
        )

        FileDetailRow(
          title: "Manifest",
          value: resolved.manifestURL.path,
          copyAction: { copyValue(resolved.manifestURL.path, label: "manifest path") },
          openAction: {
            if let selectedInstance {
              store.openManifest(for: selectedInstance)
            }
          }
        )

        FileDetailRow(
          title: "Bridge Log",
          value: resolved.bridgeLogURL.path,
          copyAction: { copyValue(resolved.bridgeLogURL.path, label: "bridge log path") },
          openAction: {
            if let selectedInstance {
              store.openLogs(for: selectedInstance)
            }
          }
        )

        FileDetailRow(
          title: "Audit Log",
          value: resolved.auditLogURL.path,
          copyAction: { copyValue(resolved.auditLogURL.path, label: "audit log path") },
          openAction: {
            if let selectedInstance {
              store.openAuditLog(for: selectedInstance)
            }
          }
        )

        FileDetailRow(
          title: "Plugin Files",
          value: resolved.pluginDistURL.path,
          copyAction: { copyValue(resolved.pluginDistURL.path, label: "plugin path") },
          openAction: {
            if let selectedInstance {
              store.openPluginFolder(for: selectedInstance)
            }
          }
        )
      } else {
        Text("Select a valid instance to inspect manifest, logs, audit output, and plugin files.")
          .font(.system(size: 11, weight: .medium))
          .foregroundStyle(BridgePalette.text200)
      }
    }
    .padding(14)
    .background(
      RoundedRectangle(cornerRadius: 14, style: .continuous)
        .fill(BridgePalette.bg200)
        .overlay(
          RoundedRectangle(cornerRadius: 14, style: .continuous)
            .stroke(BridgePalette.border, lineWidth: 1)
        )
    )
  }

  private var logEmptyState: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text("No matching log entries")
        .font(.system(size: 13, weight: .semibold, design: .monospaced))
        .foregroundStyle(BridgePalette.logHeader)
      Text("Try a different filter or wait for the selected bridge to write to its log.")
        .font(.system(size: 11, weight: .medium, design: .monospaced))
        .foregroundStyle(BridgePalette.logMuted)
    }
    .padding(18)
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private var instanceSwitcherMenu: some View {
    Menu {
      ForEach(store.instances) { instance in
        Button {
          selectedInstanceID = instance.id
        } label: {
          if instance.id == selectedInstance?.id {
            Label(instance.name.isEmpty ? "Untitled Bridge" : instance.name, systemImage: "checkmark")
          } else {
            Text(instance.name.isEmpty ? "Untitled Bridge" : instance.name)
          }
        }
      }
    } label: {
      HStack(spacing: 6) {
        Text(selectedInstanceTitle)
          .lineLimit(1)
        Image(systemName: "chevron.up.chevron.down")
          .font(.system(size: 9, weight: .semibold))
      }
    }
    .menuStyle(.borderlessButton)
    .buttonStyle(AppButtonStyle(kind: .secondary))
    .disabled(store.instances.isEmpty)
  }

  private var toolbarActionsMenu: some View {
    Menu {
      Button("Choose Workspace") {
        store.chooseWorkspaceRoot()
      }

      Button("Reveal Workspace") {
        store.revealWorkspaceRoot()
      }
      .disabled(store.workspaceRootURL == nil)

      Divider()

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
    }
    .menuStyle(.borderlessButton)
    .buttonStyle(IconButtonStyle())
  }

  private var selectedNameBinding: Binding<String> {
    Binding(
      get: { selectedInstance?.name ?? "" },
      set: { newValue in
        selectedInstance?.name = newValue
        noteEdited()
      }
    )
  }

  private var selectedPortBinding: Binding<String> {
    Binding(
      get: { selectedInstance?.portOverride ?? "" },
      set: { newValue in
        selectedInstance?.portOverride = newValue
        noteEdited()
      }
    )
  }

  private var selectedInstanceTitle: String {
    guard let selectedInstance else {
      return "Select Instance"
    }
    return selectedInstance.name.isEmpty ? "Untitled Bridge" : selectedInstance.name
  }

  private var bridgePortPlaceholder: String {
    guard let selectedInstance else {
      return "5432"
    }
    return bridgePortText(for: selectedInstance)
  }

  private var activeErrorMessage: String? {
    selectedInstance?.lastErrorMessage
  }

  private var selectedResolvedConfiguration: ResolvedBridgeConfiguration? {
    guard let selectedInstance else {
      return nil
    }
    return try? store.resolvedConfiguration(for: selectedInstance)
  }

  private var selectedNameValidationMessage: String? {
    guard let selectedInstance else {
      return nil
    }
    return BridgeConfigurationResolver.normalizeInstanceName(selectedInstance.name).isEmpty
      ? "Enter a name that still has letters or numbers after normalization."
      : nil
  }

  private var selectedPortValidationMessage: String? {
    guard let selectedInstance else {
      return nil
    }
    let rawValue = selectedInstance.portOverride.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !rawValue.isEmpty else {
      return nil
    }
    guard let port = Int(rawValue), (1...65535).contains(port) else {
      return "Port must be a number between 1 and 65535."
    }
    return nil
  }

  private var hasValidationError: Bool {
    selectedNameValidationMessage != nil || selectedPortValidationMessage != nil
  }

  private var cardBackground: some View {
    RoundedRectangle(cornerRadius: 18, style: .continuous)
      .fill(BridgePalette.cardSurface)
      .overlay(
        RoundedRectangle(cornerRadius: 18, style: .continuous)
          .stroke(BridgePalette.cardStroke, lineWidth: 1)
      )
      .shadow(color: BridgePalette.cardShadow, radius: 12, x: 0, y: 8)
  }

  private func addBridge() {
    store.addInstance()
    selectedInstanceID = store.instances.last?.id
    showUtilityFeedback("Bridge added")
  }

  private func syncSelection() {
    guard !store.instances.isEmpty else {
      selectedInstanceID = nil
      screen = .dashboard
      return
    }

    if let selectedInstanceID,
       store.instances.contains(where: { $0.id == selectedInstanceID }) {
      return
    }

    selectedInstanceID = store.instances.first?.id
  }

  private func toggle(_ instance: BridgeInstance) {
    if instance.status.isRunning || instance.status.isBusy {
      store.stop(instance)
    } else {
      store.start(instance)
    }
  }

  private func openLogsScreen(for instance: BridgeInstance) {
    selectedInstanceID = instance.id
    logFilter = ""
    logScope = .all
    screen = .logs
  }

  private func bridgePortText(for instance: BridgeInstance) -> String {
    guard let resolved = try? store.resolvedConfiguration(for: instance) else {
      return instance.portOverride.isEmpty ? "--" : instance.portOverride
    }
    return String(resolved.bridgePort)
  }

  private func statusLine(for instance: BridgeInstance) -> String {
    "Port \(bridgePortText(for: instance)) • \(healthLabel(for: instance.status))"
  }

  private func healthLabel(for status: BridgeRuntimeStatus) -> String {
    switch status {
    case .running:
      return "Healthy"
    case .building:
      return "Building"
    case .starting:
      return "Starting"
    case .stopping:
      return "Stopping"
    case .stopped:
      return "Inactive"
    case .failed:
      return "Failed"
    }
  }

  private func visualStyle(for instance: BridgeInstance) -> BridgeVisualStyle {
    let normalized = instance.name.lowercased()

    if normalized.contains("postgres") || normalized.contains("db") || normalized.contains("database") {
      return BridgeVisualStyle(
        iconName: "cylinder.split.1x2.fill",
        iconColor: BridgePalette.success100,
        iconBackground: BridgePalette.successBackground
      )
    }

    if normalized.contains("lambda") || normalized.contains("proxy") || normalized.contains("cloud") {
      return BridgeVisualStyle(
        iconName: "cloud.fill",
        iconColor: BridgePalette.primary100,
        iconBackground: BridgePalette.primarySoft
      )
    }

    if normalized.contains("redis") || normalized.contains("cache") {
      return BridgeVisualStyle(
        iconName: "memorychip.fill",
        iconColor: BridgePalette.text200,
        iconBackground: BridgePalette.textSoft
      )
    }

    return BridgeVisualStyle(
      iconName: instance.status.isRunning ? "bolt.horizontal.circle.fill" : "point.3.connected.trianglepath.dotted",
      iconColor: instance.status.isRunning ? BridgePalette.success100 : BridgePalette.primary100,
      iconBackground: instance.status.isRunning ? BridgePalette.successBackground : BridgePalette.primarySoft
    )
  }

  private func matchesScope(_ entry: BridgeLogEntry) -> Bool {
    switch logScope {
    case .all:
      return true
    case .info:
      return entry.level == .info
    case .debug:
      return entry.level == .debug
    case .error:
      return entry.level == .error
    case .warn:
      return entry.level == .warn
    }
  }

  private func matchesSearch(_ entry: BridgeLogEntry) -> Bool {
    let filter = logFilter.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !filter.isEmpty else {
      return true
    }
    return entry.searchableText.localizedCaseInsensitiveContains(filter)
  }

  private func refreshLogEntries() {
    guard screen == .logs, let selectedInstance else {
      return
    }

    guard let resolved = try? store.resolvedConfiguration(for: selectedInstance) else {
      logEntries = []
      return
    }

    let url = resolved.bridgeLogURL
    guard let source = try? String(contentsOf: url, encoding: .utf8) else {
      logEntries = fallbackEntries(for: selectedInstance)
      return
    }

    let lines = source
      .split(whereSeparator: \.isNewline)
      .map(String.init)
      .filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }

    let parsed = Array(lines.suffix(120)).enumerated().map { offset, line in
      parseLogEntry(line, fallbackIndex: offset)
    }

    logEntries = parsed.isEmpty ? fallbackEntries(for: selectedInstance) : parsed
  }

  private func noteEdited() {
    showSaveFeedback(selectedNameValidationMessage == nil && selectedPortValidationMessage == nil ? "Saved just now" : "Needs attention")
  }

  private func showSaveFeedback(_ text: String) {
    saveFeedbackText = text
    let current = UUID()
    saveFeedbackToken = current
    DispatchQueue.main.asyncAfter(deadline: .now() + 1.8) {
      if saveFeedbackToken == current {
        saveFeedbackText = nil
      }
    }
  }

  private func showUtilityFeedback(_ text: String) {
    utilityFeedbackText = text
    let current = UUID()
    utilityFeedbackToken = current
    DispatchQueue.main.asyncAfter(deadline: .now() + 2.2) {
      if utilityFeedbackToken == current {
        utilityFeedbackText = nil
      }
    }
  }

  private func copyValue(_ value: String, label: String) {
    NSPasteboard.general.clearContents()
    NSPasteboard.general.setString(value, forType: .string)
    showUtilityFeedback("Copied \(label)")
  }

  private func copyVisibleLogs() {
    guard !filteredLogEntries.isEmpty else {
      showUtilityFeedback("No visible logs to copy")
      return
    }

    let payload = filteredLogEntries
      .map { "\($0.timestamp) \($0.level.rawValue) \($0.message)" }
      .joined(separator: "\n")

    NSPasteboard.general.clearContents()
    NSPasteboard.general.setString(payload, forType: .string)
    showUtilityFeedback("Copied \(filteredLogEntries.count) log lines")
  }

  private func fallbackEntries(for instance: BridgeInstance) -> [BridgeLogEntry] {
    if let error = instance.lastErrorMessage {
      return [
        BridgeLogEntry(
          timestamp: "--:--:--",
          level: .error,
          message: error,
          searchableText: error
        )
      ]
    }
    return []
  }

  private func parseLogEntry(_ line: String, fallbackIndex: Int) -> BridgeLogEntry {
    let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)

    if let timestamped = parseBracketedEntry(trimmed) {
      return timestamped
    }

    let parts = trimmed.split(separator: " ", maxSplits: 2, omittingEmptySubsequences: true)
    if parts.count >= 3, isClock(String(parts[0])) {
      let level = BridgeLogLevel(rawValue: String(parts[1]).uppercased()) ?? .fromMessage(String(parts[1]))
      let message = String(parts[2])
      return BridgeLogEntry(
        timestamp: String(parts[0]),
        level: level,
        message: message,
        searchableText: trimmed
      )
    }

    return BridgeLogEntry(
      timestamp: fallbackTimestamp(for: fallbackIndex),
      level: .fromMessage(trimmed),
      message: trimmed,
      searchableText: trimmed
    )
  }

  private func parseBracketedEntry(_ line: String) -> BridgeLogEntry? {
    guard line.first == "[", let closingIndex = line.firstIndex(of: "]") else {
      return nil
    }

    let timestampString = String(line[line.index(after: line.startIndex)..<closingIndex])
    let message = line[line.index(after: closingIndex)...].trimmingCharacters(in: .whitespacesAndNewlines)
    let displayTime = displayTime(from: timestampString) ?? "--:--:--"
    return BridgeLogEntry(
      timestamp: displayTime,
      level: .fromMessage(message),
      message: message,
      searchableText: line
    )
  }

  private func isClock(_ text: String) -> Bool {
    text.count == 8 && text.filter({ $0 == ":" }).count == 2
  }

  private func fallbackTimestamp(for index: Int) -> String {
    let seconds = index % 60
    return String(format: "--:--:%02d", seconds)
  }

  private func displayTime(from isoLikeString: String) -> String? {
    let isoFormatter = ISO8601DateFormatter()
    isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

    let date = isoFormatter.date(from: isoLikeString)
      ?? ISO8601DateFormatter().date(from: isoLikeString)

    guard let date else {
      return nil
    }

    let formatter = DateFormatter()
    formatter.dateFormat = "HH:mm:ss"
    return formatter.string(from: date)
  }
}

private struct BridgeRow: View {
  @EnvironmentObject private var store: BridgeStore

  @ObservedObject var instance: BridgeInstance
  let isSelected: Bool
  let detailText: String
  let visualStyle: BridgeVisualStyle
  let status: BridgeRuntimeStatus
  let select: () -> Void
  let openLogs: () -> Void

  @State private var isHovering = false

  var body: some View {
    HStack(spacing: 12) {
      RoundedRectangle(cornerRadius: 10, style: .continuous)
        .fill(visualStyle.iconBackground)
        .frame(width: 36, height: 36)
        .overlay {
          Image(systemName: visualStyle.iconName)
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(visualStyle.iconColor)
        }

      VStack(alignment: .leading, spacing: 4) {
        Text(instance.name.isEmpty ? "Untitled Bridge" : instance.name)
          .font(.system(size: 13, weight: .semibold))
          .foregroundStyle(BridgePalette.text100)
          .lineLimit(1)

        Text(detailText)
          .font(.system(size: 11, weight: .medium))
          .foregroundStyle(BridgePalette.text200)
          .lineLimit(1)
      }

      Spacer(minLength: 0)

      StatusCapsule(status: status)

      Button("Logs") {
        openLogs()
      }
      .buttonStyle(AppButtonStyle(kind: .ghostCompact))
    }
    .padding(.horizontal, 12)
    .padding(.vertical, 10)
    .background(
      RoundedRectangle(cornerRadius: 14, style: .continuous)
        .fill(rowFill)
        .overlay(
          RoundedRectangle(cornerRadius: 14, style: .continuous)
            .stroke(rowBorder, lineWidth: 1)
        )
    )
    .contentShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    .onTapGesture(perform: select)
    .onHover { hovering in
      isHovering = hovering
    }
    .contextMenu {
      Button("Open Log View") {
        openLogs()
      }

      Divider()

      if instance.status.isRunning || instance.status.isBusy {
        Button("Stop") {
          store.stop(instance)
        }
      } else {
        Button("Start") {
          store.start(instance)
        }
      }

      Button("Build") {
        store.build(instance)
      }
      .disabled(instance.status.isBusy)

      Button(instance.autoBuild ? "Disable Auto Build" : "Enable Auto Build") {
        instance.autoBuild.toggle()
      }

      Divider()

      Button("Open Manifest") {
        store.openManifest(for: instance)
      }

      Button("Open Logs") {
        store.openLogs(for: instance)
      }

      Button("Open Audit Log") {
        store.openAuditLog(for: instance)
      }

      Divider()

      Button("Remove") {
        store.removeInstance(instance)
      }
    }
  }

  private var rowFill: Color {
    if isSelected {
      return BridgePalette.rowSelected
    }
    if isHovering {
      return BridgePalette.rowHover
    }
    return BridgePalette.rowBase
  }

  private var rowBorder: Color {
    if isSelected {
      return BridgePalette.primaryBorder
    }
    return BridgePalette.rowStroke
  }
}

private struct InspectorField: View {
  let title: String
  let text: Binding<String>
  let placeholder: String
  var width: CGFloat? = nil
  var validationMessage: String? = nil

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(title)
        .font(.system(size: 10, weight: .semibold))
        .foregroundStyle(BridgePalette.text200)

      TextField(placeholder, text: text)
        .textFieldStyle(.plain)
        .font(.system(size: 13, weight: .medium))
        .foregroundStyle(BridgePalette.text100)
        .padding(.horizontal, 12)
        .frame(height: 38)
        .background(
          RoundedRectangle(cornerRadius: 12, style: .continuous)
            .fill(BridgePalette.inputSurface)
            .overlay(
              RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(validationMessage == nil ? BridgePalette.border : BridgePalette.destructiveBorder, lineWidth: 1)
            )
        )

      if let validationMessage {
        Text(validationMessage)
          .font(.system(size: 10, weight: .medium))
          .foregroundStyle(BridgePalette.accent200)
          .fixedSize(horizontal: false, vertical: true)
      }
    }
    .frame(maxWidth: width == nil ? .infinity : width, alignment: .leading)
  }
}

private struct StatusCapsule: View {
  let status: BridgeRuntimeStatus

  var body: some View {
    HStack(spacing: 6) {
      Circle()
        .fill(status.tint)
        .frame(width: 7, height: 7)

      Text(status.badgeTitle)
        .font(.system(size: 11, weight: .semibold))
    }
    .foregroundStyle(statusForeground)
    .padding(.horizontal, 10)
    .padding(.vertical, 6)
    .background(
      Capsule()
        .fill(statusBackground)
    )
  }

  private var statusForeground: Color {
    switch status {
    case .running:
      return BridgePalette.success100
    case .building, .starting:
      return BridgePalette.primary100
    case .stopping, .stopped:
      return BridgePalette.text200
    case .failed:
      return BridgePalette.accent200
    }
  }

  private var statusBackground: Color {
    switch status {
    case .running:
      return BridgePalette.successBackground
    case .building, .starting:
      return BridgePalette.primarySoft
    case .stopping, .stopped:
      return BridgePalette.bg300.opacity(0.55)
    case .failed:
      return BridgePalette.destructiveBackground
    }
  }
}

private struct MetricPill: View {
  let label: String
  let value: Int
  let tint: Color

  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      Text("\(value)")
        .font(.system(size: 12, weight: .bold))
      Text(label)
        .font(.system(size: 9, weight: .semibold))
    }
    .foregroundStyle(tint)
    .padding(.horizontal, 10)
    .padding(.vertical, 7)
    .background(
      RoundedRectangle(cornerRadius: 12, style: .continuous)
        .fill(.white.opacity(0.72))
        .overlay(
          RoundedRectangle(cornerRadius: 12, style: .continuous)
            .stroke(BridgePalette.border, lineWidth: 1)
        )
    )
  }
}

private struct EmptyBridgeState: View {
  let addAction: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text("No bridge instances yet")
        .font(.system(size: 14, weight: .semibold))
        .foregroundStyle(BridgePalette.text100)

      Text("Create one local bridge configuration to start, stop, build, and inspect logs from the menu bar.")
        .font(.system(size: 12, weight: .medium))
        .foregroundStyle(BridgePalette.text200)
        .fixedSize(horizontal: false, vertical: true)

      Button("Create First Bridge") {
        addAction()
      }
      .buttonStyle(AppButtonStyle(kind: .primary))
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.vertical, 10)
  }
}

private struct AutoSaveTag: View {
  let text: String

  var body: some View {
    HStack(spacing: 6) {
      Image(systemName: "checkmark.circle.fill")
        .font(.system(size: 11, weight: .semibold))
      Text(text)
        .font(.system(size: 11, weight: .semibold))
    }
    .foregroundStyle(BridgePalette.text200)
    .padding(.horizontal, 10)
    .padding(.vertical, 6)
    .background(
      Capsule()
        .fill(BridgePalette.bg200)
    )
  }
}

private struct InlineErrorStrip: View {
  let message: String

  var body: some View {
    HStack(spacing: 8) {
      Image(systemName: "exclamationmark.triangle.fill")
      Text(message)
        .lineLimit(2)
    }
    .font(.system(size: 11, weight: .semibold))
    .foregroundStyle(BridgePalette.accent200)
    .padding(.horizontal, 12)
    .padding(.vertical, 9)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(
      RoundedRectangle(cornerRadius: 12, style: .continuous)
        .fill(BridgePalette.destructiveBackground)
        .overlay(
          RoundedRectangle(cornerRadius: 12, style: .continuous)
            .stroke(BridgePalette.destructiveBorder, lineWidth: 1)
        )
    )
  }
}

private struct NoticePill: View {
  let text: String

  var body: some View {
    Text(text)
      .font(.system(size: 10, weight: .semibold))
      .foregroundStyle(BridgePalette.primary100)
      .padding(.horizontal, 10)
      .padding(.vertical, 6)
      .background(
        Capsule()
          .fill(BridgePalette.primarySoft)
      )
  }
}

private struct FileDetailRow: View {
  let title: String
  let value: String
  let copyAction: () -> Void
  let openAction: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 7) {
      HStack(alignment: .firstTextBaseline, spacing: 10) {
        Text(title)
          .font(.system(size: 10, weight: .semibold))
          .foregroundStyle(BridgePalette.text200)

        Spacer(minLength: 0)

        Button("Copy") {
          copyAction()
        }
        .buttonStyle(InlineTextActionStyle())

        Button("Open") {
          openAction()
        }
        .buttonStyle(InlineTextActionStyle())
      }

      Text(value)
        .font(.system(size: 11, weight: .medium, design: .monospaced))
        .foregroundStyle(BridgePalette.text100)
        .lineLimit(2)
        .truncationMode(.middle)
        .textSelection(.enabled)
    }
    .padding(.horizontal, 12)
    .padding(.vertical, 10)
    .background(
      RoundedRectangle(cornerRadius: 12, style: .continuous)
        .fill(.white.opacity(0.74))
        .overlay(
          RoundedRectangle(cornerRadius: 12, style: .continuous)
            .stroke(BridgePalette.border, lineWidth: 1)
        )
    )
  }
}

private struct InlineTextActionStyle: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(.system(size: 10, weight: .semibold))
      .foregroundStyle(BridgePalette.primary100.opacity(configuration.isPressed ? 0.75 : 1))
      .padding(.horizontal, 2)
      .padding(.vertical, 1)
  }
}

private struct LogEntryRow: View {
  let entry: BridgeLogEntry

  var body: some View {
    HStack(alignment: .top, spacing: 12) {
      Text(entry.timestamp)
        .font(.system(size: 11, weight: .regular, design: .monospaced))
        .foregroundStyle(BridgePalette.logMuted)
        .frame(width: 60, alignment: .leading)

      Text(entry.level.rawValue)
        .font(.system(size: 11, weight: .bold, design: .monospaced))
        .foregroundStyle(entry.level.tint)
        .frame(width: 44, alignment: .leading)

      Text(entry.message)
        .font(.system(size: 11, weight: .regular, design: .monospaced))
        .foregroundStyle(entry.level.messageTint)
        .frame(maxWidth: .infinity, alignment: .leading)
        .fixedSize(horizontal: false, vertical: true)
    }
    .padding(.horizontal, 14)
    .padding(.vertical, 9)
  }
}

private struct BridgeVisualStyle {
  let iconName: String
  let iconColor: Color
  let iconBackground: Color
}

private struct BridgeLogEntry: Identifiable {
  let id = UUID()
  let timestamp: String
  let level: BridgeLogLevel
  let message: String
  let searchableText: String
}

private enum BridgeLogLevel: String {
  case info = "INFO"
  case debug = "DEBUG"
  case error = "ERROR"
  case warn = "WARN"
  case note = "NOTE"

  static func fromMessage(_ text: String) -> BridgeLogLevel {
    let uppercased = text.uppercased()
    if uppercased.contains("ERROR") || uppercased.contains("FAILED") || uppercased.contains("TIMEOUT") {
      return .error
    }
    if uppercased.contains("DEBUG") {
      return .debug
    }
    if uppercased.contains("WARN") {
      return .warn
    }
    if uppercased.contains("INFO") || uppercased.contains("START") || uppercased.contains("RUNNING") || uppercased.contains("BUILD") {
      return .info
    }
    return .note
  }

  var tint: Color {
    switch self {
    case .info:
      return BridgePalette.success100
    case .debug:
      return BridgePalette.logDebug
    case .error:
      return BridgePalette.accent200
    case .warn:
      return BridgePalette.logWarn
    case .note:
      return BridgePalette.logMuted
    }
  }

  var messageTint: Color {
    switch self {
    case .error:
      return BridgePalette.logErrorText
    case .debug:
      return BridgePalette.logSoftText
    case .warn:
      return BridgePalette.logWarn
    case .info, .note:
      return BridgePalette.logText
    }
  }
}

private struct AppButtonStyle: ButtonStyle {
  enum Kind {
    case primary
    case secondary
    case ghost
    case ghostCompact
  }

  let kind: Kind

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(.system(size: kind == .ghostCompact ? 11 : 12, weight: .semibold))
      .foregroundStyle(foregroundColor.opacity(configuration.isPressed ? 0.82 : 1))
      .padding(.horizontal, horizontalPadding)
      .padding(.vertical, verticalPadding)
      .background(
        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
          .fill(backgroundColor.opacity(configuration.isPressed ? 0.82 : 1))
          .overlay(
            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
              .stroke(borderColor, lineWidth: 1)
          )
      )
  }

  private var foregroundColor: Color {
    switch kind {
    case .primary:
      return .white
    case .secondary:
      return BridgePalette.text100
    case .ghost, .ghostCompact:
      return BridgePalette.primary100
    }
  }

  private var backgroundColor: Color {
    switch kind {
    case .primary:
      return BridgePalette.primary100
    case .secondary:
      return .white
    case .ghost, .ghostCompact:
      return BridgePalette.primarySoft
    }
  }

  private var borderColor: Color {
    switch kind {
    case .primary:
      return .clear
    case .secondary:
      return BridgePalette.border
    case .ghost, .ghostCompact:
      return BridgePalette.primaryBorder
    }
  }

  private var horizontalPadding: CGFloat {
    switch kind {
    case .ghostCompact:
      return 10
    case .primary, .secondary, .ghost:
      return 12
    }
  }

  private var verticalPadding: CGFloat {
    switch kind {
    case .ghostCompact:
      return 7
    case .primary, .secondary, .ghost:
      return 8
    }
  }

  private var cornerRadius: CGFloat {
    switch kind {
    case .ghostCompact:
      return 10
    case .primary, .secondary, .ghost:
      return 12
    }
  }
}

private struct FilterChipStyle: ButtonStyle {
  let isSelected: Bool

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(.system(size: 11, weight: .semibold))
      .foregroundStyle(isSelected ? BridgePalette.primary100 : BridgePalette.text200)
      .padding(.horizontal, 10)
      .padding(.vertical, 6)
      .background(
        Capsule()
          .fill(isSelected ? BridgePalette.primarySoft : .white.opacity(0.72))
          .overlay(
            Capsule()
              .stroke(isSelected ? BridgePalette.primaryBorder : BridgePalette.border, lineWidth: 1)
          )
      )
      .opacity(configuration.isPressed ? 0.84 : 1)
  }
}

private struct IconButtonStyle: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .foregroundStyle(BridgePalette.text200)
      .frame(width: 34, height: 34)
      .background(
        Circle()
          .fill(.white.opacity(configuration.isPressed ? 0.62 : 0.82))
          .overlay(
            Circle()
              .stroke(BridgePalette.border, lineWidth: 1)
          )
      )
  }
}
