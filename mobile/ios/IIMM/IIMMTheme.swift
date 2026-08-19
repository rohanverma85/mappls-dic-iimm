import MapplsMap
import OSLog
import SwiftUI

extension Color {
  static let iimmNavy = Color(red: 16 / 255, green: 70 / 255, blue: 133 / 255)
  static let iimmDeepNavy = Color(red: 8 / 255, green: 46 / 255, blue: 90 / 255)
  static let iimmBlue = Color(red: 22 / 255, green: 119 / 255, blue: 200 / 255)
  static let iimmGreen = Color(red: 24 / 255, green: 134 / 255, blue: 83 / 255)
  static let iimmAmber = Color(red: 232 / 255, green: 155 / 255, blue: 40 / 255)
  static let iimmSky = Color(red: 234 / 255, green: 243 / 255, blue: 251 / 255)
  static let iimmMist = Color(red: 244 / 255, green: 247 / 255, blue: 250 / 255)
  static let iimmInk = Color(red: 21 / 255, green: 34 / 255, blue: 56 / 255)
}

@MainActor
final class MapplsSDKState: ObservableObject {
  private let logger = Logger(subsystem: "com.mappls.dic.iimm", category: "Mappls")
  enum Status: Equatable { case missing, loading, ready, failed(String) }
  @Published private(set) var status: Status

  init() {
    guard Bundle.main.url(forResource: "i", withExtension: "conf") != nil,
      Bundle.main.url(forResource: "i", withExtension: "olf") != nil
    else {
      status = .missing
      return
    }
    status = .loading
    MapplsMapAuthenticator.sharedManager().initializeSDKSession { [weak self] success, error in
      self?.logger.info("SDK authentication \(success ? "succeeded" : "failed", privacy: .public): \(error?.localizedDescription ?? "no error", privacy: .public)")
      DispatchQueue.main.async {
        self?.status = success
          ? .ready
          : .failed(error?.localizedDescription ?? "The SDK rejected this app configuration.")
      }
    }
    Task { [weak self] in
      try? await Task.sleep(for: .seconds(15))
      guard self?.status == .loading else { return }
      self?.logger.error("SDK authentication timed out without a completion callback")
      self?.status = .failed("SDK authentication timed out.")
    }
  }

  var ready: Bool { status == .ready }
  var title: String {
    switch status {
    case .missing: "Map credentials required"
    case .loading: "Connecting to Mappls"
    case .ready: "Mappls map connected"
    case .failed: "Mappls authorization unavailable"
    }
  }
  var detail: String {
    switch status {
    case .missing: "Add i.conf and i.olf to the app target. Operational GIS data remains available."
    case .loading: "Validating the application and preparing the vector basemap."
    case .ready: "Official vector basemap, project geometry and operational overlays are available."
    case .failed(let message): "Mappls rejected the SDK session: \(message) Operational GIS data remains available."
    }
  }
  var symbol: String {
    switch status {
    case .ready: "checkmark.seal.fill"
    case .loading: "hourglass"
    case .missing: "key.slash"
    case .failed: "exclamationmark.triangle.fill"
    }
  }
  var color: Color {
    switch status {
    case .ready: .iimmGreen
    case .loading: .iimmBlue
    case .missing, .failed: .iimmAmber
    }
  }
}

struct IIMMHero: View {
  let eyebrow: String
  let title: String
  let subtitle: String

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Label(eyebrow.uppercased(), systemImage: "building.2.crop.circle.fill")
        .font(.caption.bold()).foregroundStyle(.white.opacity(0.8))
      Spacer(minLength: 14)
      Text(title).font(.title.bold()).foregroundStyle(.white)
      Text(subtitle).font(.subheadline).foregroundStyle(.white.opacity(0.78))
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(20)
    .background(
      LinearGradient(colors: [.iimmDeepNavy, .iimmNavy, .iimmBlue], startPoint: .topLeading, endPoint: .bottomTrailing),
      in: RoundedRectangle(cornerRadius: 24, style: .continuous)
    )
  }
}

struct IIMMSymbolTile: View {
  let symbol: String
  var color: Color = .iimmNavy
  var body: some View {
    Image(systemName: symbol).font(.system(size: 19, weight: .semibold)).foregroundStyle(color)
      .frame(width: 44, height: 44).background(color.opacity(0.12), in: RoundedRectangle(cornerRadius: 14))
  }
}

extension View {
  func iimmCard() -> some View {
    self.padding(16).background(.background, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
      .shadow(color: .black.opacity(0.07), radius: 10, y: 4)
  }
}
