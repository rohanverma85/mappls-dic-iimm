import MapplsMap
import SwiftUI

@main
struct IIMMApp: App {
  @StateObject private var app = AppModel()

  init() {
    if Bundle.main.url(forResource: "i", withExtension: "conf") != nil,
      Bundle.main.url(forResource: "i", withExtension: "olf") != nil
    {
      MapplsMapAuthenticator.sharedManager().initializeSDKSession { _, _ in }
    }
  }

  var body: some Scene {
    WindowGroup { RootView().environmentObject(app).tint(Color.iimmNavy) }
  }
}

extension Color {
  static let iimmNavy = Color(red: 16 / 255, green: 70 / 255, blue: 133 / 255)
  static let iimmSky = Color(red: 234 / 255, green: 243 / 255, blue: 251 / 255)
}
