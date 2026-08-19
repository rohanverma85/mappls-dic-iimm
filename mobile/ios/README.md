# IIMM iOS

Native SwiftUI application using the production IIMM API and MapplsMap 6.1.5 through Swift Package Manager.

1. Register bundle ID `com.mappls.dic.iimm` in the Mappls Auth Console.
2. Copy `i.conf` and `i.olf` into `IIMM/Resources/Mappls/`.
3. Run `xcodegen generate`, open `IIMM.xcodeproj`, and select an iPhone simulator.

The files are excluded from Git. Without them the app builds and reports the exact missing credential requirement instead of silently showing another map provider.
