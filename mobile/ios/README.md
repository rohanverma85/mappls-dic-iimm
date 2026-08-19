# IIMM iOS

Native SwiftUI application using the production IIMM API and MapplsMap 6.1.5 through Swift Package Manager.

1. Register bundle ID `com.mappls.dic.iimm` in the Mappls Auth Console.
2. Copy `i.conf` and `i.olf` into `IIMM/Resources/Mappls/`.
3. Open `IIMM.xcodeproj`, select the `IIMM` scheme and an iPhone simulator, then build.

The Xcode target explicitly copies both files into the application root and the files are excluded from Git. The app reports the actual SDK session state—connecting, connected, missing or rejected—rather than treating file presence as successful authentication. Without a verified session it keeps operational coordinates and GIS records available and does not silently show another map provider.

The credential pair supplied on 20 August 2026 is bundled successfully. On the local iOS simulator the SDK session did not invoke its completion callback within the 15-second verification window, so the official iOS basemap is not yet claimed as verified. Regenerate or confirm the files for bundle ID `com.mappls.dic.iimm` if the same result occurs on a physical signed build.
