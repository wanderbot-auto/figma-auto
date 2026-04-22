import AppKit
import Combine
import SwiftUI

@MainActor
final class StatusBarController: NSObject {
  private let store: BridgeStore
  private let statusItem: NSStatusItem
  private let popover = NSPopover()
  private var cancellables: Set<AnyCancellable> = []

  init(store: BridgeStore) {
    self.store = store
    statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    super.init()
    configurePopover()
    configureStatusButton()
    observeStore()
    syncStatusItem()
  }

  private func configurePopover() {
    popover.behavior = .transient
    popover.animates = true
    popover.contentSize = NSSize(width: 456, height: 640)
    popover.contentViewController = NSHostingController(
      rootView: ManagerView()
        .environmentObject(store)
    )
  }

  private func configureStatusButton() {
    guard let button = statusItem.button else {
      return
    }

    button.target = self
    button.action = #selector(handleStatusItemClick(_:))
    button.sendAction(on: [.leftMouseUp, .rightMouseUp])
    button.imagePosition = .imageOnly
    button.imageScaling = .scaleNone
  }

  private func observeStore() {
    store.objectWillChange
      .sink { [weak self] _ in
        Task { @MainActor in
          self?.syncStatusItem()
        }
      }
      .store(in: &cancellables)
  }

  private func syncStatusItem() {
    guard let button = statusItem.button else {
      return
    }

    let foregroundColor = NSColor.white.withAlphaComponent(0.96)
    button.image = makeBridgeVaultCoreImage(color: foregroundColor)
    button.contentTintColor = nil
    button.attributedTitle = NSAttributedString(string: "")
    button.toolTip = "\(store.runningCount) running, \(store.busyCount) busy, \(store.failedCount) failed"
  }

  private func makeBridgeVaultCoreImage(color: NSColor) -> NSImage {
    let canvasSize: CGFloat = 18
    let imageSize = NSSize(width: canvasSize, height: canvasSize)
    let image = NSImage(size: imageSize, flipped: false) { [color] rect in
      guard let context = NSGraphicsContext.current?.cgContext else {
        return false
      }

      context.saveGState()
      context.translateBy(x: 0, y: rect.height)
      context.scaleBy(x: rect.width / canvasSize, y: -rect.height / canvasSize)
      context.setFillColor(color.cgColor)

      // Larger and slightly lower geometry so the mark reads closer to native menu bar icon weight.
      self.fillRoundedRect(x: 6.8, y: 2.15, width: 4.4, height: 3.55, radius: 1.65, in: context)
      self.fillRoundedRect(x: 4.0, y: 4.95, width: 10.0, height: 9.25, radius: 3.45, in: context)
      self.fillRoundedRect(x: 0.8, y: 7.05, width: 5.35, height: 4.15, radius: 2.05, in: context)
      self.fillRoundedRect(x: 11.85, y: 7.05, width: 5.35, height: 4.15, radius: 2.05, in: context)

      context.setBlendMode(.clear)
      self.fillRoundedRect(x: 7.35, y: 6.4, width: 3.3, height: 5.55, radius: 1.45, in: context)
      context.restoreGState()
      return true
    }

    image.isTemplate = false
    return image
  }

  private func fillRoundedRect(
    x: CGFloat,
    y: CGFloat,
    width: CGFloat,
    height: CGFloat,
    radius: CGFloat,
    in context: CGContext
  ) {
    let path = CGPath(
      roundedRect: CGRect(x: x, y: y, width: width, height: height),
      cornerWidth: radius,
      cornerHeight: radius,
      transform: nil
    )
    context.addPath(path)
    context.fillPath()
  }

  private var canStopAll: Bool {
    store.instances.contains { $0.status.isRunning || $0.status.isBusy }
  }

  private func makeContextMenu() -> NSMenu {
    let menu = NSMenu()
    menu.autoenablesItems = false

    let openItem = NSMenuItem(title: "Open Figma Auto Design", action: #selector(openManagerFromMenu(_:)), keyEquivalent: "")
    openItem.target = self
    menu.addItem(openItem)

    menu.addItem(.separator())

    let refreshItem = NSMenuItem(title: "Refresh Health", action: #selector(refreshHealthFromMenu(_:)), keyEquivalent: "")
    refreshItem.target = self
    refreshItem.isEnabled = !store.instances.isEmpty
    menu.addItem(refreshItem)

    let stopAllItem = NSMenuItem(title: "Stop All", action: #selector(stopAllFromMenu(_:)), keyEquivalent: "")
    stopAllItem.target = self
    stopAllItem.isEnabled = canStopAll
    menu.addItem(stopAllItem)

    let chooseWorkspaceItem = NSMenuItem(title: "Choose Dev Workspace...", action: #selector(chooseWorkspaceFromMenu(_:)), keyEquivalent: "")
    chooseWorkspaceItem.target = self
    menu.addItem(chooseWorkspaceItem)

    menu.addItem(.separator())

    let quitItem = NSMenuItem(title: "Quit", action: #selector(quitFromMenu(_:)), keyEquivalent: "")
    quitItem.target = self
    menu.addItem(quitItem)

    return menu
  }

  @objc
  private func handleStatusItemClick(_ sender: NSStatusBarButton) {
    guard let event = NSApp.currentEvent else {
      togglePopover(relativeTo: sender)
      return
    }

    let isSecondaryClick = event.type == .rightMouseUp
      || (event.type == .leftMouseUp && event.modifierFlags.contains(.control))

    if isSecondaryClick {
      showContextMenu(using: event, relativeTo: sender)
    } else {
      togglePopover(relativeTo: sender)
    }
  }

  private func togglePopover(relativeTo button: NSStatusBarButton) {
    if popover.isShown {
      popover.performClose(nil)
    } else {
      showPopover(relativeTo: button)
    }
  }

  private func showPopover(relativeTo button: NSStatusBarButton) {
    popover.show(relativeTo: button.bounds, of: button, preferredEdge: .minY)
    popover.contentViewController?.view.window?.makeKey()
  }

  private func showContextMenu(using event: NSEvent, relativeTo button: NSStatusBarButton) {
    if popover.isShown {
      popover.performClose(nil)
    }
    NSMenu.popUpContextMenu(makeContextMenu(), with: event, for: button)
  }

  @objc
  private func openManagerFromMenu(_ sender: Any?) {
    guard let button = statusItem.button else {
      return
    }
    showPopover(relativeTo: button)
  }

  @objc
  private func refreshHealthFromMenu(_ sender: Any?) {
    store.refreshConnectionHealth()
  }

  @objc
  private func stopAllFromMenu(_ sender: Any?) {
    store.stopAll()
  }

  @objc
  private func chooseWorkspaceFromMenu(_ sender: Any?) {
    store.chooseWorkspaceRoot()
  }

  @objc
  private func quitFromMenu(_ sender: Any?) {
    NSApplication.shared.terminate(nil)
  }
}
