# GIS implementation decision record

## What PRD v1.2 and the supplied HTML define

The approved product sources define asset instances and configurable asset types, project/defect geolocation, geo-tagged photo/video evidence, mobile-only geo-fenced Maker attendance, Maker ATR submission, Checker verification, and nearby or asset-linked citizen duplicate detection.

The HTML walkthrough contains table and tracker treatments for those journeys. It does not contain a KML/SHP import screen, an operational GIS layer catalogue, a network-on-map defect view, or a map-led rectification journey.

## What they do not define

The sources do not provide an implementable contract for KML or Shapefile ingestion. In particular, they do not settle:

1. Accepted packages: KML only, KMZ, or zipped Shapefile components (`.shp`, `.shx`, `.dbf`, `.prj`).
2. Coordinate systems: accepted source CRS values, reprojection behavior, and rejection rules for missing or invalid projection metadata.
3. Geometry rules: allowed Point/Line/Polygon/Multi geometries, and whether one feature becomes one asset, one network segment, or one layer member.
4. Attribute mapping: the authoritative asset identifier, required fields, tenant-specific mappings, duplicate behavior, and update-versus-create semantics.
5. Network topology: snapping tolerance, segment splitting, chainage/linear referencing, overlap and self-intersection validation.
6. Layer governance: draft/publish approvals, ownership, version replacement, rollback, edit propagation, and symbology.
7. Geofence policy: whether an out-of-scope defect is blocked, warned, or accepted for audit; whether scope comes from an asset buffer, project boundary, or configurable radius.
8. Evidence policy: mandatory media types, minimum GPS accuracy, timestamp/tamper controls, and offline evidence behavior.
9. Mappls mGIS source of truth: workspace/layer identifiers, account access, WMS/WFS or feature API choice, and sync direction.

Deep GIS/Bhuvan integration is explicitly listed as out of scope for the prototype, with the instruction that the architecture should not preclude it.

## Implemented safe foundation

- Tenant-scoped GIS layer, GeoJSON geometry, style, visibility, status and version data model.
- Mappls Web Maps SDK v3.0 integration behind a domain-whitelisted `MAPPLS_ACCESS_TOKEN`.
- Functional no-token network-map preview, so geometry workflows remain testable.
- Project circles, asset/network geometry and defects on one operational map.
- Server-calculated Haversine geofence results for attendance and defects.
- Device GPS capture, reverse-geocode proxy, accuracy recording and geo-tagged ATR evidence.
- Maker start-work → ATR → Checker verify/rework → Citizen confirm/reopen lifecycle.
- Server-timestamp offline conflict queue for manual review.
- Authority-only GeoJSON publication endpoint as a stable interchange seam.

## Client decisions needed before KML/SHP production implementation

Please answer the nine items above and provide a representative KML/KMZ and/or zipped Shapefile, plus the expected asset register after import. These inputs determine data integrity and cannot be inferred safely from the PRD.
