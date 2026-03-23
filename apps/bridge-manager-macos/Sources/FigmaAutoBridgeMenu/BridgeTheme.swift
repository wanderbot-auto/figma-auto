import AppKit
import SwiftUI

enum BridgePalette {
  static let primary100 = Color(hex: 0x2563EB)
  static let primary200 = Color(hex: 0x60A5FA)
  static let primary300 = Color(hex: 0xEBF3FF)
  static let accent100 = Color(hex: 0x006B27)
  static let accent200 = Color(hex: 0xBA1A1A)
  static let text100 = Color(hex: 0x1A1C1D)
  static let text200 = Color(hex: 0x414755)
  static let text300 = Color(hex: 0x94A3B8)
  static let heading = Color(hex: 0x0F172A)
  static let bg100 = Color(hex: 0xFFFFFF)
  static let bg200 = Color(hex: 0xF2F7FF)
  static let bg300 = Color(hex: 0xE2E8F0)

  static let panel = bg100
  static let panelAlt = Color(hex: 0xEAF2FF)
  static let border = bg300
  static let primaryBorder = Color(hex: 0xDDEBFF)
  static let shadow = Color(hex: 0xE2E8F0, opacity: 0.18)
  static let canvasTop = Color(hex: 0xF7FAFF)
  static let canvasBottom = Color(hex: 0xEEF4FF)
  static let cardSurface = Color.white.opacity(0.86)
  static let cardStroke = Color.white.opacity(0.9)
  static let cardShadow = Color(hex: 0x0F172A, opacity: 0.08)
  static let footerSurface = Color.white.opacity(0.72)
  static let inputSurface = Color.white.opacity(0.95)
  static let rowBase = Color.white.opacity(0.62)
  static let rowHover = Color(hex: 0xF7FAFF)
  static let rowSelected = Color(hex: 0xEEF4FF)
  static let rowStroke = Color.white.opacity(0.8)

  static let primarySoft = primary300
  static let success100 = accent100
  static let successBackground = Color(hex: 0x008733, opacity: 0.1)
  static let textSoft = Color(hex: 0x414755, opacity: 0.1)
  static let monoMuted = Color(hex: 0x717786)
  static let logDebug = Color(hex: 0x0055C7)
  static let logWarn = Color(hex: 0x9A6700)
  static let destructiveText = Color(hex: 0xB95B5B)
  static let destructiveBackground = Color(hex: 0xFFF5F5)
  static let destructiveBorder = Color(hex: 0xF0D7D7)
  static let logSurface = Color(hex: 0x0F172A)
  static let logHeaderSurface = Color(hex: 0x111C31)
  static let logBorder = Color(hex: 0x1E293B)
  static let logDivider = Color(hex: 0x18243A)
  static let logHeader = Color(hex: 0xE2E8F0)
  static let logMuted = Color(hex: 0x94A3B8)
  static let logText = Color(hex: 0xF8FAFC)
  static let logSoftText = Color(hex: 0xCBD5E1)
  static let logErrorText = Color(hex: 0xFCA5A5)
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
