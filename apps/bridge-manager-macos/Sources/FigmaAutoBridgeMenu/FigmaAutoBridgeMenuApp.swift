import SwiftUI

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
  private let store = BridgeStore()
  private var statusBarController: StatusBarController?

  func applicationDidFinishLaunching(_ notification: Notification) {
    NSApp.setActivationPolicy(.accessory)
    statusBarController = StatusBarController(store: store)
  }
}

@main
struct FigmaAutoBridgeMenuApp: App {
  @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

  var body: some Scene {
    Settings {
      EmptyView()
    }
  }
}
