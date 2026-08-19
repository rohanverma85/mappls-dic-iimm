# IIMM Platform

Integrated Infrastructure Management & Maintenance is a full-stack, role-aware prototype for configurable public-infrastructure operations. It follows PRD v1.2 and expands the supplied Digital India walkthrough into working, API-backed journeys.

## Included

- Public marketing website with product features, benefits, role model and accountability story
- Five seeded personas: Tenant Administrator, Authority, Maker, Checker and Citizen
- Multi-tenant provisioning with organisation hierarchy, configurable asset types, modules and SLAs
- Projects, assets, geo-fenced attendance, Joint/Requested inspections and offline-sync states
- Mappls Web Maps integration with tenant-scoped network layers, asset geometry, project geofences and mapped defects
- Real geo-tagged photo/video evidence upload, Citizen duplicate detection, Checker validation, Maker ATR and Checker closure verification
- Maker → Checker → Authority payment approval enforcement
- Helpdesk, notifications, scoped search, CSV reports and activity/audit trail
- Responsive desktop, tablet and mobile layouts
- Native Kotlin/Jetpack Compose Android and SwiftUI iOS applications using the same role-scoped API and workflows
- Authority GIS import for KML, KMZ and zipped Shapefile sources, with asset mapping, version replacement and rollback

## Run locally

```bash
npm install
npm run dev
```

The Vite client runs on `http://localhost:5173` and proxies `/api` to the Express server on port 3000.

Copy `.env.example` to `.env` and set a domain-whitelisted `MAPPLS_ACCESS_TOKEN` to enable the official Mappls vector basemap and reverse geocoding. Without a token, the app deliberately renders a functional infrastructure-network preview instead of failing.

For a production-style run:

```bash
npm run build
npm start
```

Open `http://localhost:3000`.

## Demo access

Choose any seeded persona on the login screen. Authentication is intentionally simplified for the prototype; production identity options described by the PRD are represented in the UI.

## Validation

```bash
npm run check
```

This runs TypeScript checks, workflow/API tests and the production build.

## Persistence

The Express service seeds `data/store.json` on first run and persists prototype mutations there. The generated store file is git-ignored so each environment starts from the canonical seed in `server/seed.ts`.

Field evidence is uploaded as authenticated, tenant-scoped binary media with capture coordinates, GPS accuracy, timestamp, MIME allowlisting and an 8 MB per-file limit. Prototype files live under the git-ignored `data/uploads` directory; production should replace this adapter with managed object storage and malware scanning.

## GIS scope decision

The supplied PRD and HTML do not settle every production GIS-governance choice. The prototype therefore implements an explicit, reviewable assumption set: KML/KMZ and zipped Shapefile parsing, GeoJSON normalization, field mapping, deterministic source IDs, tenant/project scoping, version replacement and auditable rollback. Network-topology repair, arbitrary CRS transformation and direct mGIS workspace synchronization remain review items. See the [GIS implementation decision record](docs/gis-client-decisions.md) and [native parity matrix](docs/native-mobile-parity.md).
