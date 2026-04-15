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

private enum LogFilterScope: String, Identifiable {
  case all = "All"
  case info = "Info"
  case error = "Error"

  var id: String { rawValue }
}

struct ManagerView: View {
  @EnvironmentObject private var store: BridgeStore

  @State private var selectedInstanceID: UUID?
  @State private var logFilter = ""
  @State private var logEntries: [BridgeLogEntry] = []
  @State private var logScope: LogFilterScope = .all
  @State private var isDetailsExpanded = false
  @State private var isLogsExpanded = false
  @State private var saveFeedbackText: String?
  @State private var utilityFeedbackText: String?
  @State private var pendingDeleteInstanceID: UUID?
  @State private var saveFeedbackToken = UUID()
  @State private var utilityFeedbackToken = UUID()

  private let logRefreshTimer = Timer.publish(every: 1.2, on: .main, in: .common).autoconnect()
  private let detailsDrawerMaxHeight: CGFloat = 252
  private let logDrawerHeight: CGFloat = 242

  var body: some View {
    dashboardScreen
      .padding(16)
      .frame(width: 456, height: 640, alignment: .topLeading)
      .background(BridgePalette.bg200)
      .alert("Delete bridge?", isPresented: isDeleteAlertPresented) {
        Button("Delete", role: .destructive) {
          confirmDelete()
        }
        Button("Cancel", role: .cancel) {
          pendingDeleteInstanceID = nil
        }
      } message: {
        Text(deleteConfirmationMessage)
      }
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
      logFilter = ""
      logScope = .all
      refreshLogEntries()
    }
    .onChange(of: isLogsExpanded) { expanded in
      guard expanded else {
        return
      }
      refreshLogEntries()
    }
    .onReceive(logRefreshTimer) { _ in
      guard isLogsExpanded else {
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
    VStack(spacing: 16) {
      dashboardToolbar

      ScrollView(showsIndicators: false) {
        VStack(spacing: 16) {
          bridgeListCard
        }
        .frame(maxWidth: .infinity)
      }
    }
  }

  private var dashboardToolbar: some View {
    HStack(alignment: .center, spacing: 10) {
      VStack(alignment: .leading, spacing: 3) {
        Text("Figma Auto Bridge")
          .font(.system(size: 20, weight: .semibold))
          .foregroundStyle(BridgePalette.heading)
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
    .padding(16)
    .background(cardBackground)
  }

  private var bridgeListCard: some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack {
        VStack(alignment: .leading, spacing: 3) {
          Text("Design File Mappings")
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(BridgePalette.text100)
          Text("Select a bridge to expand details, controls, logs, and deletion.")
            .font(.system(size: 11, weight: .medium))
            .foregroundStyle(BridgePalette.text200)
        }

        Spacer(minLength: 0)
      }

      if store.instances.isEmpty {
        EmptyBridgeState()
      } else {
        LazyVStack(spacing: 8) {
          ForEach(store.instances) { instance in
            VStack(alignment: .leading, spacing: 8) {
              BridgeRow(
                instance: instance,
                isSelected: instance.id == selectedInstance?.id,
                visualStyle: visualStyle(for: instance),
                select: {
                  selectedInstanceID = instance.id
                },
                requestDelete: {
                  requestDelete(instance)
                }
              )
              .environmentObject(store)

              if instance.id == selectedInstance?.id {
                expandedBridgePanel(for: instance)
              }
            }
          }
        }
        .padding(.top, 2)
      }
    }
    .padding(16)
    .frame(maxWidth: .infinity, alignment: .topLeading)
    .background(cardBackground)
  }

  @ViewBuilder
  private func expandedBridgePanel(for instance: BridgeInstance) -> some View {
    VStack(alignment: .leading, spacing: 0) {
      VStack(alignment: .leading, spacing: 10) {
        HStack(alignment: .center, spacing: 8) {
          Text("Bridge Details")
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(BridgePalette.text200)

          MetaChip(text: instance.slug)

          if let saveFeedbackText {
            AutoSaveTag(text: saveFeedbackText)
          }

          Spacer(minLength: 0)
        }
        
        HStack(spacing: 8) {
          Button {
            toggle(instance)
          } label: {
            Label(instance.status.isRunning || instance.status.isBusy ? "Stop" : "Start", systemImage: instance.status.isRunning || instance.status.isBusy ? "stop.fill" : "play.fill")
          }
          .buttonStyle(AppButtonStyle(kind: instance.status.isRunning || instance.status.isBusy ? .secondary : .primary))
          .disabled(hasValidationError)

          Spacer(minLength: 0)

          HStack(spacing: 6) {
            if let resolved = selectedResolvedConfiguration {
              Button {
                if copyValue(resolved.mcpURL) {
                  showUtilityFeedback("MCP URL copied")
                }
              } label: {
                Image(systemName: "link")
              }
              .buttonStyle(ControlIconButtonStyle())
              .help("Copy MCP URL")
            }

            Button {
              toggleLogsDrawer()
            } label: {
              Image(systemName: "text.alignleft")
            }
            .buttonStyle(ControlIconButtonStyle(isActive: isLogsExpanded))
            .help(isLogsExpanded ? "Hide logs" : "Show logs")

            Button {
              toggleDetailsDrawer()
            } label: {
              Image(systemName: "slider.horizontal.3")
            }
            .buttonStyle(ControlIconButtonStyle(isActive: isDetailsExpanded))
            .help(isDetailsExpanded ? "Hide details" : "Show details")

            Button {
              requestDelete(instance)
            } label: {
              Image(systemName: "trash")
            }
            .buttonStyle(ControlIconButtonStyle(isDestructive: true))
            .help("Delete bridge")
          }
        }
      }
      .padding(12)

      expandedPanelDivider

      VStack(alignment: .leading, spacing: 10) {
        Text("Mapping")
          .font(.system(size: 11, weight: .semibold))
          .foregroundStyle(BridgePalette.text200)

        HStack(spacing: 10) {
          InspectorField(
            title: "Business Name",
            text: selectedDisplayNameBinding,
            placeholder: "Marketing Landing",
            validationMessage: selectedDisplayNameValidationMessage
          )
          InspectorField(
            title: "Figma File Label",
            text: selectedFigmaFileBinding,
            placeholder: "Marketing landing file",
            validationMessage: nil
          )
        }
      }
      .padding(12)

      if let message = activeErrorMessage {
        expandedPanelDivider

        InlineErrorStrip(message: message)
          .padding(.horizontal, 12)
          .padding(.vertical, 12)
      }

      expandedPanelDivider

      BridgeHealthCard(
        title: healthTitle(for: instance),
        message: healthGuidance(for: instance)
      )
      .padding(.horizontal, 12)
      .padding(.vertical, 12)

      if isLogsExpanded {
        expandedPanelDivider

        logsDrawer
          .padding(.horizontal, 12)
          .padding(.vertical, 12)
      }

      if isDetailsExpanded {
        expandedPanelDivider

        detailsDrawer
          .padding(.horizontal, 12)
          .padding(.vertical, 12)
      }
    }
    .background(detailSectionBackground)
    .padding(.horizontal, 14)
    .padding(.top, 2)
    .padding(.bottom, 6)
  }

  private var logControls: some View {
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
          .fill(BridgePalette.inputSurface)
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

      Spacer(minLength: 0)

      Button(LogFilterScope.info.rawValue) {
        toggleLogScope(.info)
      }
      .buttonStyle(FilterChipStyle(isSelected: logScope == .info))

      Button(LogFilterScope.error.rawValue) {
        toggleLogScope(.error)
      }
      .buttonStyle(FilterChipStyle(isSelected: logScope == .error))

      Text("\(filteredLogEntries.count) entries")
        .font(.system(size: 11, weight: .semibold))
        .foregroundStyle(BridgePalette.text200)
    }
  }

  private var logsDrawer: some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack(alignment: .center, spacing: 10) {
        Text("Live Logs")
          .font(.system(size: 12, weight: .semibold))
          .foregroundStyle(BridgePalette.text100)

        Spacer(minLength: 0)

        if let selectedInstance {
          Button("Open File") {
            store.openLogs(for: selectedInstance)
          }
          .buttonStyle(AppButtonStyle(kind: .ghostCompact))
        }

        Button("Hide") {
          isLogsExpanded = false
        }
        .buttonStyle(AppButtonStyle(kind: .ghostCompact))
      }

      logControls
      logPanel
        .frame(height: logDrawerHeight)
    }
  }

  private var logPanel: some View {
    ScrollViewReader { proxy in
      VStack(spacing: 0) {
        HStack(spacing: 10) {
          Circle()
            .fill(BridgePalette.success100)
            .frame(width: 8, height: 8)

          Text("Live Bridge Log")
            .font(.system(size: 11, weight: .bold, design: .monospaced))
            .foregroundStyle(BridgePalette.logHeader)

          Spacer(minLength: 0)

          Text("refreshing every 1.2s")
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
          guard let lastID = ids.last else {
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

      ScrollView {
        VStack(alignment: .leading, spacing: 10) {
          if let resolved = selectedResolvedConfiguration {
            let selectedInstance = self.selectedInstance

            FileDetailRow(
              title: "MCP URL",
              value: resolved.mcpURL,
              copyAction: { copyValue(resolved.mcpURL) },
              openAction: {
                if let url = URL(string: resolved.mcpURL) {
                  NSWorkspace.shared.open(url)
                }
              }
            )

            FileDetailRow(
              title: "Client Config",
              value: "url = \"\(resolved.mcpURL)\"",
              copyAction: { copyValue("url = \"\(resolved.mcpURL)\"") },
              openAction: {
                if copyValue("url = \"\(resolved.mcpURL)\"") {
                  showUtilityFeedback("Config copied")
                }
              }
            )

            FileDetailRow(
              title: "Manifest",
              value: resolved.manifestURL.path,
              copyAction: { copyValue(resolved.manifestURL.path) },
              openAction: {
                if let selectedInstance {
                  store.openManifest(for: selectedInstance)
                }
              }
            )

            FileDetailRow(
              title: "Bridge Log",
              value: resolved.bridgeLogURL.path,
              copyAction: { copyValue(resolved.bridgeLogURL.path) },
              openAction: {
                if let selectedInstance {
                  store.openLogs(for: selectedInstance)
                }
              }
            )

            FileDetailRow(
              title: "Audit Log",
              value: resolved.auditLogURL.path,
              copyAction: { copyValue(resolved.auditLogURL.path) },
              openAction: {
                if let selectedInstance {
                  store.openAuditLog(for: selectedInstance)
                }
              }
            )

            FileDetailRow(
              title: "Plugin Files",
              value: resolved.pluginDistURL.path,
              copyAction: { copyValue(resolved.pluginDistURL.path) },
              openAction: {
                if let selectedInstance {
                  store.openPluginFolder(for: selectedInstance)
                }
              }
            )
          } else if let errorMessage = selectedResolvedConfigurationErrorMessage {
            VStack(alignment: .leading, spacing: 8) {
              Text("Details unavailable")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(BridgePalette.text100)

              Text(errorMessage)
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(BridgePalette.accent200)
                .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
              RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(BridgePalette.bg100)
                .overlay(
                  RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(BridgePalette.border, lineWidth: 1)
                )
            )
          } else {
            Text("Select a valid instance to inspect manifest, logs, audit output, and plugin files.")
              .font(.system(size: 11, weight: .medium))
              .foregroundStyle(BridgePalette.text200)
          }
        }
      }
      .frame(height: detailsDrawerMaxHeight)
    }
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

  private var toolbarActionsMenu: some View {
    Menu {
      Button("Choose Dev Workspace") {
        store.chooseWorkspaceRoot()
      }

      Button("Reveal Runtime") {
        store.revealWorkspaceRoot()
      }
      .disabled(store.workspaceRootURL == nil)

      Divider()

      Button("Refresh Health") {
        store.refreshConnectionHealth()
      }
      .disabled(store.instances.isEmpty)

      Divider()

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

  private var selectedDisplayNameBinding: Binding<String> {
    Binding(
      get: { selectedInstance?.displayName ?? "" },
      set: { newValue in
        selectedInstance?.displayName = newValue
        noteEdited()
      }
    )
  }

  private var selectedFigmaFileBinding: Binding<String> {
    Binding(
      get: { selectedInstance?.figmaFileLabel ?? "" },
      set: { newValue in
        selectedInstance?.figmaFileLabel = newValue
        noteEdited()
      }
    )
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

  private var selectedResolvedConfigurationErrorMessage: String? {
    guard let selectedInstance else {
      return nil
    }

    do {
      _ = try store.resolvedConfiguration(for: selectedInstance)
      return nil
    } catch {
      return error.localizedDescription
    }
  }

  private var selectedDisplayNameValidationMessage: String? {
    guard let selectedInstance else {
      return nil
    }
    return selectedInstance.displayName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
      ? "Enter a business label so this mapping is easy to recognize."
      : nil
  }

  private var hasValidationError: Bool {
    selectedDisplayNameValidationMessage != nil
  }

  private var pendingDeleteInstance: BridgeInstance? {
    guard let pendingDeleteInstanceID else {
      return nil
    }
    return store.instances.first(where: { $0.id == pendingDeleteInstanceID })
  }

  private var isDeleteAlertPresented: Binding<Bool> {
    Binding(
      get: { pendingDeleteInstanceID != nil },
      set: { isPresented in
        if !isPresented {
          pendingDeleteInstanceID = nil
        }
      }
    )
  }

  private var deleteConfirmationMessage: String {
    guard let pendingDeleteInstance else {
      return "This bridge will be removed from the mappings list."
    }

    return "Remove \(pendingDeleteInstance.displayName.isEmpty ? "this bridge" : pendingDeleteInstance.displayName) from the mappings list? Running processes will be stopped first."
  }

  private var cardBackground: some View {
    RoundedRectangle(cornerRadius: 12, style: .continuous)
      .fill(BridgePalette.cardSurface)
      .overlay(
        RoundedRectangle(cornerRadius: 12, style: .continuous)
          .stroke(BridgePalette.cardStroke, lineWidth: 1)
      )
      .shadow(color: BridgePalette.cardShadow, radius: 4, x: 0, y: 1)
  }

  private var detailSectionBackground: some View {
    RoundedRectangle(cornerRadius: 12, style: .continuous)
      .fill(BridgePalette.bg100)
      .overlay(
        RoundedRectangle(cornerRadius: 12, style: .continuous)
          .stroke(BridgePalette.border, lineWidth: 1)
      )
  }

  private var expandedPanelDivider: some View {
    Rectangle()
      .fill(BridgePalette.border)
      .frame(height: 1)
  }

  private func syncSelection() {
    guard !store.instances.isEmpty else {
      selectedInstanceID = nil
      isLogsExpanded = false
      isDetailsExpanded = false
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

  private func toggleLogsDrawer() {
    let shouldExpand = !isLogsExpanded
    isLogsExpanded = shouldExpand
    if shouldExpand {
      isDetailsExpanded = false
      refreshLogEntries()
    }
  }

  private func toggleDetailsDrawer() {
    let shouldExpand = !isDetailsExpanded
    isDetailsExpanded = shouldExpand
    if shouldExpand {
      isLogsExpanded = false
    }
  }

  private func requestDelete(_ instance: BridgeInstance) {
    pendingDeleteInstanceID = instance.id
  }

  private func confirmDelete() {
    guard let pendingDeleteInstance else {
      pendingDeleteInstanceID = nil
      return
    }

    if selectedInstanceID == pendingDeleteInstance.id {
      isLogsExpanded = false
      isDetailsExpanded = false
    }

    store.delete(pendingDeleteInstance)
    pendingDeleteInstanceID = nil
  }

  private func healthTitle(for instance: BridgeInstance) -> String {
    switch instance.status {
    case .running:
      return instance.connectionState.badgeTitle
    case .building:
      return "Building plugin assets"
    case .starting:
      return "Starting local bridge"
    case .stopping:
      return "Stopping local bridge"
    case .stopped:
      return "Bridge stopped"
    case .failed:
      return "Needs attention"
    }
  }

  private func healthGuidance(for instance: BridgeInstance) -> String {
    switch instance.status {
    case .running:
      return instance.connectionState.guidance
    case .building:
      return "Preparing the bundled manifest and bridge assets for this design file."
    case .starting:
      return "Starting the local bridge process. The MCP URL will work once the bridge turns ready."
    case .stopping:
      return "Waiting for the bridge process to exit cleanly."
    case .stopped:
      return "Start this instance, then open the matching Figma file and run its plugin."
    case let .failed(message):
      return message
    }
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
    let normalized = instance.slug.lowercased()

    if normalized.contains("marketing") {
      return BridgeVisualStyle(
        iconName: "megaphone.fill",
        iconColor: BridgePalette.success100,
        iconBackground: BridgePalette.successBackground
      )
    }

    if normalized.contains("product") {
      return BridgeVisualStyle(
        iconName: "square.on.square.squareshape.controlhandles",
        iconColor: BridgePalette.primary100,
        iconBackground: BridgePalette.primarySoft
      )
    }

    if normalized.contains("design-system") || normalized.contains("system") {
      return BridgeVisualStyle(
        iconName: "square.grid.2x2.fill",
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
    case .error:
      return entry.level == .error
    }
  }

  private func toggleLogScope(_ scope: LogFilterScope) {
    logScope = logScope == scope ? .all : scope
  }

  private func matchesSearch(_ entry: BridgeLogEntry) -> Bool {
    let filter = logFilter.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !filter.isEmpty else {
      return true
    }
    return entry.searchableText.localizedCaseInsensitiveContains(filter)
  }

  private func refreshLogEntries() {
    guard isLogsExpanded, let selectedInstance else {
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
    showSaveFeedback(selectedDisplayNameValidationMessage == nil ? "Saved!" : "Needs attention")
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

  private func copyValue(_ value: String) -> Bool {
    NSPasteboard.general.clearContents()
    return NSPasteboard.general.setString(value, forType: .string)
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
  let visualStyle: BridgeVisualStyle
  let select: () -> Void
  let requestDelete: () -> Void

  @State private var isHovering = false

  var body: some View {
    HStack(spacing: 12) {
      RoundedRectangle(cornerRadius: 10, style: .continuous)
        .fill(visualStyle.iconBackground)
        .frame(width: 38, height: 38)
        .overlay {
          Image(systemName: visualStyle.iconName)
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(visualStyle.iconColor)
        }

      VStack(alignment: .leading, spacing: 4) {
        Text(instance.displayName.isEmpty ? "Untitled Bridge" : instance.displayName)
          .font(.system(size: 13, weight: .semibold))
          .foregroundStyle(BridgePalette.text100)
          .lineLimit(1)

        Text(instance.figmaFileLabel.isEmpty ? "Assign one Figma file to this slot." : instance.figmaFileLabel)
          .font(.system(size: 11, weight: .medium))
          .foregroundStyle(BridgePalette.text200)
          .lineLimit(1)
      }

      Spacer(minLength: 0)

      VStack(alignment: .trailing, spacing: 8) {
        StatusCapsule(status: instance.status)
        ConnectionCapsule(state: instance.connectionState)
      }
    }
    .padding(.horizontal, 12)
    .padding(.vertical, 12)
    .background(
      RoundedRectangle(cornerRadius: 12, style: .continuous)
        .fill(rowFill)
        .overlay(
          RoundedRectangle(cornerRadius: 12, style: .continuous)
            .stroke(rowBorder, lineWidth: 1)
        )
    )
    .contentShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    .onTapGesture(perform: select)
    .onHover { hovering in
      isHovering = hovering
    }
    .contextMenu {
      if instance.status.isRunning || instance.status.isBusy {
        Button("Stop") {
          store.stop(instance)
        }
      } else {
        Button("Start") {
          store.start(instance)
        }
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

      Button("Delete", role: .destructive) {
        requestDelete()
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
        .frame(height: 36)
        .background(
          RoundedRectangle(cornerRadius: 10, style: .continuous)
            .fill(BridgePalette.inputSurface)
            .overlay(
              RoundedRectangle(cornerRadius: 10, style: .continuous)
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
    .padding(.vertical, 5)
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
      return BridgePalette.textSoft
    case .failed:
      return Color(hex: 0xFEE2E2)
    }
  }
}

private struct ConnectionCapsule: View {
  let state: BridgeConnectionState

  var body: some View {
    HStack(spacing: 6) {
      Circle()
        .fill(tint)
        .frame(width: 7, height: 7)

      Text(state.badgeTitle)
        .font(.system(size: 11, weight: .semibold))
    }
    .foregroundStyle(foreground)
    .padding(.horizontal, 10)
    .padding(.vertical, 5)
    .background(
      Capsule()
        .fill(background)
    )
  }

  private var tint: Color {
    switch state {
    case .connected:
      return BridgePalette.success100
    case .checking:
      return BridgePalette.primary100
    case .waitingForPlugin:
      return BridgePalette.accent200
    case .idle, .unreachable:
      return BridgePalette.text200
    }
  }

  private var foreground: Color {
    switch state {
    case .connected:
      return BridgePalette.success100
    case .checking:
      return BridgePalette.primary100
    case .waitingForPlugin:
      return BridgePalette.accent200
    case .idle, .unreachable:
      return BridgePalette.text200
    }
  }

  private var background: Color {
    switch state {
    case .connected:
      return BridgePalette.successBackground
    case .checking:
      return BridgePalette.primarySoft
    case .waitingForPlugin:
      return Color(hex: 0xFFF3E0)
    case .idle, .unreachable:
      return BridgePalette.textSoft
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
      RoundedRectangle(cornerRadius: 10, style: .continuous)
        .fill(BridgePalette.bg100)
        .overlay(
          RoundedRectangle(cornerRadius: 10, style: .continuous)
            .stroke(BridgePalette.border, lineWidth: 1)
        )
    )
  }
}

private struct EmptyBridgeState: View {
  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text("Preparing default design file slots")
        .font(.system(size: 14, weight: .semibold))
        .foregroundStyle(BridgePalette.text100)

      Text("This build expects bundled plugin manifests. Reopen the app or choose a development workspace if the runtime is missing.")
        .font(.system(size: 12, weight: .medium))
        .foregroundStyle(BridgePalette.text200)
        .fixedSize(horizontal: false, vertical: true)
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

private struct MetaChip: View {
  let text: String

  var body: some View {
    Text(text)
      .font(.system(size: 10, weight: .semibold, design: .monospaced))
      .foregroundStyle(BridgePalette.text200)
      .lineLimit(1)
      .padding(.horizontal, 8)
      .padding(.vertical, 4)
      .background(
        Capsule()
          .fill(BridgePalette.bg200)
      )
  }
}

private struct BridgeHealthCard: View {
  let title: String
  let message: String

  var body: some View {
    HStack(alignment: .top, spacing: 10) {
      RoundedRectangle(cornerRadius: 9, style: .continuous)
        .fill(BridgePalette.primarySoft)
        .frame(width: 28, height: 28)
        .overlay {
          Image(systemName: "waveform.path.ecg")
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(BridgePalette.primary100)
        }

      VStack(alignment: .leading, spacing: 5) {
        Text(title)
          .font(.system(size: 11, weight: .semibold))
          .foregroundStyle(BridgePalette.text100)
        Text(message)
          .font(.system(size: 11, weight: .medium))
          .foregroundStyle(BridgePalette.text200)
          .fixedSize(horizontal: false, vertical: true)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
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
      RoundedRectangle(cornerRadius: 10, style: .continuous)
        .fill(Color(hex: 0xFEF2F2))
        .overlay(
          RoundedRectangle(cornerRadius: 10, style: .continuous)
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
  let copyAction: () -> Bool
  let openAction: () -> Void

  @State private var copyButtonLabel = "Copy"
  @State private var copyFeedbackToken = UUID()

  var body: some View {
    VStack(alignment: .leading, spacing: 7) {
      HStack(alignment: .firstTextBaseline, spacing: 10) {
        Text(title)
          .font(.system(size: 10, weight: .semibold))
          .foregroundStyle(BridgePalette.text200)

        Spacer(minLength: 0)

        Button(copyButtonLabel) {
          if copyAction() {
            showCopiedFeedback()
          }
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
      RoundedRectangle(cornerRadius: 10, style: .continuous)
        .fill(BridgePalette.bg200)
        .overlay(
          RoundedRectangle(cornerRadius: 10, style: .continuous)
            .stroke(BridgePalette.border, lineWidth: 1)
        )
    )
  }

  private func showCopiedFeedback() {
    copyButtonLabel = "Copied!"
    let current = UUID()
    copyFeedbackToken = current
    DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
      if copyFeedbackToken == current {
        copyButtonLabel = "Copy"
      }
    }
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

private struct ControlIconButtonStyle: ButtonStyle {
  var isActive = false
  var isDestructive = false

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(.system(size: 12, weight: .semibold))
      .frame(width: 30, height: 30)
      .foregroundStyle(foregroundColor.opacity(configuration.isPressed ? 0.78 : 1))
      .background(
        RoundedRectangle(cornerRadius: 9, style: .continuous)
          .fill(backgroundColor.opacity(configuration.isPressed ? 0.82 : 1))
          .overlay(
            RoundedRectangle(cornerRadius: 9, style: .continuous)
              .stroke(borderColor, lineWidth: 1)
          )
      )
  }

  private var foregroundColor: Color {
    if isDestructive {
      return BridgePalette.destructiveText
    }
    return isActive ? BridgePalette.primary100 : BridgePalette.text200
  }

  private var backgroundColor: Color {
    if isDestructive {
      return BridgePalette.destructiveBackground
    }
    return isActive ? BridgePalette.primarySoft : BridgePalette.bg100
  }

  private var borderColor: Color {
    if isDestructive {
      return BridgePalette.destructiveBorder
    }
    return isActive ? BridgePalette.primaryBorder : BridgePalette.border
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
    case destructive
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
      return BridgePalette.text200
    case .ghost, .ghostCompact:
      return BridgePalette.primary100
    case .destructive:
      return BridgePalette.destructiveText
    }
  }

  private var backgroundColor: Color {
    switch kind {
    case .primary:
      return BridgePalette.primary100
    case .secondary:
      return BridgePalette.bg100
    case .ghost, .ghostCompact:
      return BridgePalette.bg100
    case .destructive:
      return BridgePalette.destructiveBackground
    }
  }

  private var borderColor: Color {
    switch kind {
    case .primary:
      return .clear
    case .secondary:
      return BridgePalette.border
    case .ghost, .ghostCompact:
      return BridgePalette.border
    case .destructive:
      return BridgePalette.destructiveBorder
    }
  }

  private var horizontalPadding: CGFloat {
    switch kind {
    case .ghostCompact:
      return 10
    case .primary, .secondary, .ghost, .destructive:
      return 12
    }
  }

  private var verticalPadding: CGFloat {
    switch kind {
    case .ghostCompact:
      return 7
    case .primary, .secondary, .ghost, .destructive:
      return 8
    }
  }

  private var cornerRadius: CGFloat {
    switch kind {
    case .ghostCompact:
      return 10
    case .primary, .secondary, .ghost, .destructive:
      return 10
    }
  }
}

private struct FilterChipStyle: ButtonStyle {
  let isSelected: Bool

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(.system(size: 11, weight: .semibold))
      .foregroundStyle((isSelected ? BridgePalette.primary100 : BridgePalette.text200).opacity(configuration.isPressed ? 0.82 : 1))
      .padding(.horizontal, 12)
      .padding(.vertical, 7)
      .background(
        RoundedRectangle(cornerRadius: 10, style: .continuous)
          .fill((isSelected ? BridgePalette.primarySoft : BridgePalette.bg100).opacity(configuration.isPressed ? 0.82 : 1))
          .overlay(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
              .stroke(isSelected ? BridgePalette.primaryBorder : BridgePalette.border, lineWidth: 1)
          )
      )
  }
}

private struct IconButtonStyle: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .foregroundStyle(BridgePalette.text200)
      .frame(width: 34, height: 34)
      .background(
        RoundedRectangle(cornerRadius: 10, style: .continuous)
          .fill(BridgePalette.bg100.opacity(configuration.isPressed ? 0.82 : 1))
          .overlay(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
              .stroke(BridgePalette.border, lineWidth: 1)
          )
      )
  }
}
