import MapplsMap
import SwiftUI
import UIKit

@main
struct IIMMApp: App {
  @StateObject private var app = AppModel()
  @StateObject private var mappls = MapplsSDKState()

  init() {
    let appearance = UITabBarAppearance()
    appearance.configureWithOpaqueBackground()
    appearance.backgroundColor = UIColor.systemBackground
    UITabBar.appearance().standardAppearance = appearance
    UITabBar.appearance().scrollEdgeAppearance = appearance
  }

  var body: some Scene {
    WindowGroup {
      RootView().environmentObject(app).environmentObject(mappls).tint(Color.iimmNavy)
        .preferredColorScheme(.light)
    }
  }
}
