# Native mobile parity and verification matrix

This matrix records the Android/iOS delivery contract against the shared IIMM API. A feature is marked credential-gated only when application-bound Mappls licensing artifacts are required; the operational geometry, coordinate validation and server workflows remain available without substituting another map provider.

| Capability | Android | iOS | Authoritative evidence |
| --- | --- | --- | --- |
| Role login/session and tenant scoping | Native | Native | Shared `/api/auth/login`, `/api/session`; Android encrypted preferences; iOS Keychain |
| Role dashboards | Native | Native | `/api/dashboard` exercised for all five roles by `npm run check:native-api` |
| Tenant onboarding/configuration | Native | Native | hierarchy, modules, SLAs, multiple asset types, migration flag and initial admin forms |
| User access and bulk onboarding | Native | Native | tenant selection, role/designation, activation and line-based bulk creation |
| Projects and geofences | Native | Native | create/manage assignments, milestones, documents, centre and radius; server validation |
| Asset registry | Native | Native | create/manage attributes, condition and Point geometry with project linkage |
| Operational GIS map | Native | Native | project, asset, defect and published network overlays; coordinate validation and map selection |
| KML/KMZ/Shapefile import | Native | Native | server parsing, field mapping, project/asset mapping, version replacement and rollback |
| Official Mappls native basemap | Artifact-gated | Artifact-gated | requires Android `*.a.conf` + `*.a.olf`, and iOS `i.conf` + `i.olf` |
| Reverse-geocoded address | Native | Native | server Mappls proxy; production five-role contract verifies a non-empty address |
| Geo-fenced attendance | Native, Maker only | Native, Maker only | device GPS/accuracy, server distance decision, offline queue |
| Joint/RFI inspections | Native | Native | schedule, accept/reject/not-ready, checklist pass/flag/note, pause/resume/complete; completed flags create duplicate-safe linked defects |
| Defects and Action Taken Reports | Native | Native | inspection-linked defects, GPS/media capture, start work, offline defect/ATR queue, Checker verify/rework |
| Citizen reporting and closure | Native | Native | location/media issue, Checker validation, duplicate handling, rating/comment/reopen |
| Payments | Native | Native | Maker claim, Checker review and Authority authorization with auditable notes |
| Helpdesk | Native | Native | create, conversation, assignment/status progression, resolve/close/reopen, and the same self-service FAQ as web |
| Notifications | Native | Native | individual and mark-all-read actions |
| Activity log and search | Native | Native | scoped list, full-record search drill-down |
| CSV reports | Native | Native | projects/assets/defects/payments/attendance exports for authorized roles |
| Offline sync/conflict review | Native | Native | queued attendance/defect/ATR/inspection changes; server-wins conflict records and resolution |

## Verification record

- Web/API: TypeScript checks, interaction audit, 17 server workflow tests and production build pass through `npm run check`.
- Production API: `npm run check:native-api` passes for Tenant Administrator, Authority, Maker, Checker and Citizen at `https://diciimm.mapplsgov.com`.
- Android: `./gradlew :app:assembleDebug` succeeds; the debug APK installs and cold-launches on the local Android emulator.
- iOS: the `IIMM` Debug scheme builds for `iphonesimulator`; the app installs and launches on the local iPhone simulator.
- Replit: deployment `0ad63f5a-c44f-4fab-a2fe-6944ed7f5c1f` is live on the primary production URL.

## Remaining external input

Credentialed native basemap verification cannot be claimed until the Mappls Auth Console artifacts bound to package/bundle ID `com.mappls.dic.iimm` are supplied. The Android debug signing SHA-256 is documented in `mobile/android/README.md`; release builds additionally require the release signing certificate to be registered.
