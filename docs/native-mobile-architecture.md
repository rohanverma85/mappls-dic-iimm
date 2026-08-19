# IIMM native mobile applications — architecture and delivery contract

Status: implementation branch `agent/native-mobile-apps`
API base URL: `https://mappls-dic-iimm.replit.app`
Android application ID: `com.mappls.dic.iimm`
iOS bundle ID: `com.mappls.dic.iimm`

## Product contract

The Android and iOS applications are native clients of the same IIMM API used by the web application. They do not embed the website or use a WebView. Every authenticated role can reach the same enabled capability areas, while the server remains the final authority for tenant scope and Maker–Checker–Authority permissions.

| Role | Native home and actions |
| --- | --- |
| Tenant administrator | tenant onboarding/configuration, users, dashboards, reports, notifications, activity, helpdesk, search |
| Authority | projects, assets, GIS/layers, inspections, defects, payment approval, users, reports, activity, helpdesk |
| Maker | assigned work, mobile attendance, inspections/checklists, defect rectification/ATR, payment claims, field map, offline sync |
| Checker | inspection verification, citizen validation, ATR verification, payment verification, field map, offline conflict review |
| Citizen | issue reporting with map/GPS/media, report tracking, feedback/reopen, notifications, helpdesk, search |

The native clients expose the following API-backed modules: dashboard, tenants, users, projects, assets, GIS overview/layers/import history, attendance, inspections, defects and ATR, payments, helpdesk, notifications, activity log, global search, CSV reports, and offline conflict review.

## Native GIS rules

- GeoJSON always follows RFC 7946 coordinate order: `[longitude, latitude]`.
- Native SDK camera/marker coordinates use latitude and longitude in the order required by each SDK and are converted only at the adapter boundary.
- Initial camera bounds are calculated only from validated Indian coordinates; zero, non-finite, and reversed/out-of-range points are rejected.
- Map taps create a candidate location; GPS explicitly recentres the map and replaces the candidate.
- Assets, projects/geofences, defects, and published GIS feature collections are rendered as separate interactive overlays.
- Reverse geocoding is made through the IIMM server so REST credentials are never shipped in either application.
- Mappls attribution and licensing marks remain visible.

## Offline and conflict behavior

Maker and Checker writes to inspections and defects can be queued locally when the network is unavailable. The queue records entity type, entity ID, client timestamp, and JSON payload. Connectivity recovery posts batches to `/api/sync`. The server timestamp wins. Older client edits returned as conflicts remain visible in the native Sync screen until a Checker or Authority resolves them; they are never silently discarded.

Android persists the session in encrypted preferences and the queue in a private SQLite database. WorkManager retries sync when a network connection is available. iOS stores the token in Keychain and the queue in an application-support JSON store; `NWPathMonitor` triggers retry on reconnect.

## Mappls authentication artifacts

The web `MAPPLS_ACCESS_TOKEN` is intentionally not reused by the native SDKs. Current Mappls SDK authentication requires application-bound files downloaded from the Mappls Auth Console.

- Android: `<appId>.a.conf` and `<appId>.a.olf`, bound to package name `com.mappls.dic.iimm` and the signing certificate SHA-256. Copy both into `mobile/android/app/` for a credentialed build.
- iOS: `i.conf` and `i.olf`, bound to bundle ID `com.mappls.dic.iimm`. Copy both into `mobile/ios/IIMM/Resources/Mappls/`.

These artifacts are excluded by `.gitignore`. CI and release systems must materialize them from protected secrets before building. Missing files must produce an explicit credential diagnostic; the app must not silently substitute another map provider.

## Deployment contract

Mobile source is versioned in the same GitHub repository as the web/API application. Replit imports the repository so it contains the mobile projects for source-of-truth parity, but Replit only builds and publishes the Node/React application. Android APK/AAB and iOS archive/TestFlight publishing require their respective signing assets and mobile distribution pipelines.
