import AppKit
import SwiftUI

enum BridgePalette {
  static let primary100 = Color(hex: 0x3F51B5)
  static let primary200 = Color(hex: 0x757DE8)
  static let primary300 = Color(hex: 0xDEDEFF)
  static let accent100 = Color(hex: 0x2196F3)
  static let accent200 = Color(hex: 0x003F8F)
  static let text100 = Color(hex: 0x333333)
  static let text200 = Color(hex: 0x5C5C5C)
  static let bg100 = Color(hex: 0xFFFFFF)
  static let bg200 = Color(hex: 0xF5F5F5)
  static let bg300 = Color(hex: 0xCCCCCC)

  static let panel = bg100
  static let panelAlt = bg200
  static let border = bg300.opacity(0.7)
}

extension Color {
  init(hex: UInt32, opacity: Double = 1) {
    self.init(
      .sRGB,
      red: Double((hex >> 16) & 0xFF) / 255,
      green: Double((hex >> 8) & 0xFF) / 255,
      blue: Double(hex & 0xFF) / 255,
      opacity: opacity
    )
  }
}
