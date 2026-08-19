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

## Implemented prototype assumption set

- Tenant-scoped GIS layer, GeoJSON geometry, style, visibility, status and version data model.
- Mappls Web Maps SDK v3.0 integration behind a domain-whitelisted `MAPPLS_ACCESS_TOKEN`.
- Functional no-token network-map preview, so geometry workflows remain testable.
- Project circles, asset/network geometry and defects on one operational map.
- Authority-only KML, KMZ and zipped Shapefile upload from web, Android and iOS.
- Server-side KML/KMZ/Shapefile parsing and normalization to supported GeoJSON Point, Line/MultiLine and Polygon/MultiPolygon features.
- Review-before-publish field selection for source ID and display name, with deterministic generated values when fields are absent.
- One imported feature becomes one project-scoped asset; matching source IDs update the existing asset instead of silently duplicating it.
- Versioned layer replacement keeps the preceding layer available for an auditable rollback.
- Rollback deletes assets created by the import, restores snapshots for updated assets and reactivates the superseded layer.
- Server-calculated Haversine geofence results for attendance and defects.
- Device GPS capture, reverse-geocode proxy, accuracy recording, and authenticated tenant-scoped photo/video uploads for defect and ATR evidence.
- Maker start-work → ATR → Checker verify/rework → Citizen confirm/reopen lifecycle.
- Server-timestamp offline conflict queue for manual review.
- Authority-only GeoJSON publication endpoint as a stable interchange seam.

## Assumptions still requiring client review before production

The prototype deliberately does not perform topology repair, snapping, chainage/linear referencing, arbitrary source-CRS transformation, draft/publish multi-party approval, or direct Mappls mGIS workspace synchronization. The client should review the nine policy items above and provide representative production files plus the expected asset register. The current importer is isolated behind versioned import records so these rules can be revised, rolled back and re-merged without rewriting the field workflows.
