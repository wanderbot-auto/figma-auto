import AppKit
import SwiftUI

enum BridgePalette {
  static let primary100 = Color(hex: 0x3B82F6)
  static let primary200 = Color(hex: 0x2563EB)
  static let primary300 = Color(hex: 0xDBEAFE)
  static let accent100 = Color(hex: 0x059669)
  static let accent200 = Color(hex: 0xDC2626)
  static let text100 = Color(hex: 0x0F172A)
  static let text200 = Color(hex: 0x475569)
  static let text300 = Color(hex: 0x64748B)
  static let heading = Color(hex: 0x1E293B)
  static let bg100 = Color(hex: 0xFFFFFF)
  static let bg200 = Color(hex: 0xF8FAFC)
  static let bg300 = Color(hex: 0xE2E8F0)

  static let panel = bg100
  static let panelAlt = Color(hex: 0xEFF6FF)
  static let border = bg300
  static let primaryBorder = Color(hex: 0xBFDBFE)
  static let shadow = Color(hex: 0x0F172A, opacity: 0.06)
  static let canvasTop = bg200
  static let canvasBottom = bg200
  static let cardSurface = bg100
  static let cardStroke = border
  static let cardShadow = Color(hex: 0x0F172A, opacity: 0.05)
  static let footerSurface = bg100
  static let inputSurface = bg100
  static let rowBase = bg100
  static let rowHover = Color(hex: 0xF8FAFC)
  static let rowSelected = Color(hex: 0xEFF6FF)
  static let rowStroke = border

  static let primarySoft = primary300
  static let success100 = accent100
  static let successBackground = Color(hex: 0xD1FAE5)
  static let textSoft = Color(hex: 0xF1F5F9)
  static let monoMuted = Color(hex: 0x64748B)
  static let logDebug = Color(hex: 0x93C5FD)
  static let logWarn = Color(hex: 0xFBBF24)
  static let destructiveText = Color(hex: 0xFFFFFF)
  static let destructiveBackground = Color(hex: 0xEF4444)
  static let destructiveBorder = Color(hex: 0xDC2626)
  static let logSurface = Color(hex: 0x0F172A)
  static let logHeaderSurface = Color(hex: 0x111827)
  static let logBorder = Color(hex: 0x1E293B)
  static let logDivider = Color(hex: 0x1E293B)
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
