# IIMM iOS

Native SwiftUI application using the production IIMM API and MapplsMap 6.1.5 through Swift Package Manager.

1. Register bundle ID `com.mappls.dic.iimm` in the Mappls Auth Console.
2. Copy `i.conf` and `i.olf` into `IIMM/Resources/Mappls/`.
3. Open `IIMM.xcodeproj`, select the `IIMM` scheme and an iPhone simulator, then build.

The Xcode target explicitly copies both files into the application root and the files are excluded from Git. The app reports the actual map lifecycle state—connecting, connected, missing or rejected—rather than treating file presence as successful authentication. Without a verified map load it keeps operational coordinates and GIS records available and does not silently show another map provider.

The regenerated credential pair supplied on 20 August 2026 is bundled successfully. The optional `MapplsMapAuthenticator.initializeSDKSession` preflight responds with `Method Not allowed`, while `MapplsMapView` performs its documented internal authorization and loads normally. The app therefore treats the map view's load/failure callbacks as authoritative and uses preflight only as diagnostic information. The official Mappls basemap, project marker, network overlay and map interaction have been verified on the local iPhone simulator for bundle ID `com.mappls.dic.iimm`. Physical-device verification still requires an Apple Development signing identity, which is not currently installed on this Mac.
