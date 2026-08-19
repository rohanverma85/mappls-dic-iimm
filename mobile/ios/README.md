# IIMM iOS

Native SwiftUI application using the production IIMM API and MapplsMap 6.1.5 through Swift Package Manager.

1. Register bundle ID `com.mappls.dic.iimm` in the Mappls Auth Console.
2. Copy `i.conf` and `i.olf` into `IIMM/Resources/Mappls/`.
3. Open `IIMM.xcodeproj`, select the `IIMM` scheme and an iPhone simulator, then build.

The Xcode target explicitly copies both files into the application root and the files are excluded from Git. The app reports the actual SDK session state—connecting, connected, missing or rejected—rather than treating file presence as successful authentication. Without a verified session it keeps operational coordinates and GIS records available and does not silently show another map provider.

The regenerated credential pair supplied on 20 August 2026 is bundled successfully. On the local iOS simulator `MapplsMapAuthenticator` invokes its callback immediately with `Method Not allowed`, so the official iOS basemap is not yet claimed as verified. Confirm in the Mappls Auth Console that the iOS application for bundle ID `com.mappls.dic.iimm` is entitled to the native Map SDK, then download a fresh pair. A physical-device verification will also require an Apple Development signing identity, which is not currently installed on this Mac.
