import SwiftUI

final class AppDelegate: NSObject, NSApplicationDelegate {
  func applicationDidFinishLaunching(_ notification: Notification) {
    NSApp.setActivationPolicy(.accessory)
  }
}

@main
struct FigmaAutoBridgeMenuApp: App {
  @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
  @StateObject private var store = BridgeStore()

  var body: some Scene {
    MenuBarExtra {
      ManagerView()
        .environmentObject(store)
    } label: {
      MenuBarLabel()
        .environmentObject(store)
    }
    .menuBarExtraStyle(.window)

    Settings {
      EmptyView()
    }
  }
}
