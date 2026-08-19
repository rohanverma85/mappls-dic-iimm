import type { Asset, GeofenceResult, GeoJsonGeometry, GeoPoint, Project } from '../shared/types.js';

const EARTH_RADIUS_METERS = 6_371_000;

export function haversineMeters(a: GeoPoint, b: GeoPoint) {
  const toRad = (value: number) => value * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng));
}

function geometryPositions(geometry: GeoJsonGeometry): [number, number][] {
  if (geometry.type === 'Point') return [geometry.coordinates];
  if (geometry.type === 'LineString') return geometry.coordinates;
  if (geometry.type === 'MultiLineString' || geometry.type === 'Polygon') return geometry.coordinates.flat();
  return geometry.coordinates.flat(2) as [number, number][];
}

export function geometryCenter(geometry: GeoJsonGeometry): GeoPoint {
  const positions = geometryPositions(geometry);
  const total = positions.reduce((sum, [lng, lat]) => ({ lat: sum.lat + lat, lng: sum.lng + lng }), { lat: 0, lng: 0 });
  return { lat: total.lat / positions.length, lng: total.lng / positions.length };
}

export function geofenceFor(point: GeoPoint, project: Project | undefined, asset: Asset | undefined): GeofenceResult | null {
  if (asset) {
    const distanceMeters = Math.round(haversineMeters(point, geometryCenter(asset.geometry)));
    const radiusMeters = asset.geometry.type === 'Point' ? 75 : 100;
    return { within: distanceMeters <= radiusMeters, distanceMeters, radiusMeters, sourceType: 'Asset', sourceId: asset.id };
  }
  if (project) {
    const distanceMeters = Math.round(haversineMeters(point, project.center));
    return { within: distanceMeters <= project.geofenceRadiusMeters, distanceMeters, radiusMeters: project.geofenceRadiusMeters, sourceType: 'Project', sourceId: project.id };
  }
  return null;
}

export function pointFeature(id: string, lat: number, lng: number, properties: Record<string, string | number | boolean | null>) {
  return { type: 'Feature' as const, id, geometry: { type: 'Point' as const, coordinates: [lng, lat] as [number, number] }, properties };
}
