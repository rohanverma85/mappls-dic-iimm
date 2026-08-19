export type Role = 'tenant_admin' | 'authority' | 'maker' | 'checker' | 'citizen';

export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export interface GeoPoint {
  lat: number;
  lng: number;
}

export type GeoJsonGeometry =
  | { type: 'Point'; coordinates: [number, number] }
  | { type: 'LineString'; coordinates: [number, number][] }
  | { type: 'MultiLineString'; coordinates: [number, number][][] }
  | { type: 'Polygon'; coordinates: [number, number][][] }
  | { type: 'MultiPolygon'; coordinates: [number, number][][][] };

export interface GeoJsonFeature {
  type: 'Feature';
  id?: string;
  geometry: GeoJsonGeometry;
  properties: Record<string, string | number | boolean | null>;
}

export interface GeoJsonFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJsonFeature[];
}

export interface GisLayer {
  id: string;
  tenantId: string;
  projectId: string | null;
  name: string;
  description: string;
  source: 'System' | 'Mappls mGIS' | 'KML' | 'GeoJSON' | 'Shapefile';
  geometryType: 'Point' | 'Line' | 'Polygon' | 'Mixed';
  status: 'Published' | 'Draft' | 'Processing' | 'Invalid';
  version: number;
  visible: boolean;
  style: { color: string; width: number; opacity: number };
  featureCollection: GeoJsonFeatureCollection;
  createdAt: string;
  updatedAt: string;
  importId?: string;
  supersedesLayerId?: string | null;
}

export interface GisImport {
  id: string;
  tenantId: string;
  projectId: string;
  layerId: string;
  supersedesLayerId: string | null;
  fileName: string;
  format: 'KML' | 'KMZ' | 'Shapefile ZIP';
  layerName: string;
  assetType: string;
  sourceIdField: string | null;
  nameField: string | null;
  featureCount: number;
  createdCount: number;
  updatedCount: number;
  rejectedCount: number;
  status: 'Published' | 'Rolled back';
  warnings: string[];
  importedBy: string;
  importedAt: string;
  rolledBackAt?: string;
  createdAssetIds?: string[];
  assetSnapshots?: Asset[];
}

export interface GeofenceResult {
  within: boolean;
  distanceMeters: number;
  radiusMeters: number;
  sourceType: 'Project' | 'Asset';
  sourceId: string;
}

export interface MediaEvidence {
  id: string;
  tenantId: string;
  uploadedBy: string;
  originalName: string;
  mimeType: string;
  size: number;
  storageName: string;
  capturedAt: string;
  lat: number;
  lng: number;
  accuracyMeters?: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
  mobile: string;
  role: Role;
  tenantId: string | null;
  designation: string;
  active: boolean;
}

export interface Tenant {
  id: string;
  name: string;
  shortName: string;
  type: string;
  hierarchy: string;
  status: 'Live' | 'Provisioning' | 'Requested' | 'Inactive';
  modules: string[];
  assetTypes: AssetType[];
  slas: Record<'Critical' | 'High' | 'Medium' | 'Low', number>;
  dataMigration: boolean;
  primaryColor: string;
  users: number;
}

export interface AssetType {
  id: string;
  name: string;
  attributes: string[];
  checklist: string[];
}

export interface Project {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  location: string;
  assetType: string;
  status: 'Active' | 'Pending' | 'In Review' | 'Overdue' | 'Completed';
  progress: number;
  makerIds: string[];
  checkerIds: string[];
  milestones: { name: string; due: string; done: boolean }[];
  center: GeoPoint;
  geofenceRadiusMeters: number;
  documents: { id: string; name: string; category: string; uploadedAt: string }[];
}

export interface Asset {
  id: string;
  tenantId: string;
  projectId: string;
  type: string;
  name: string;
  location: string;
  condition: 'Good' | 'Fair' | 'Attention' | 'Critical';
  attributes: Record<string, string>;
  lastInspected: string;
  geometry: GeoJsonGeometry;
  layerId: string | null;
  sourceId?: string;
  sourceImportId?: string;
}

export interface AttendanceRecord {
  id: string;
  tenantId: string;
  projectId: string;
  makerId: string;
  date: string;
  checkIn: string;
  checkOut: string | null;
  lat: number;
  lng: number;
  withinGeofence: boolean;
  status: 'Present' | 'Out of radius' | 'Pending sync';
}

export interface Inspection {
  id: string;
  tenantId: string;
  projectId: string;
  assetId: string;
  type: 'Joint' | 'Requested';
  makerId: string;
  checkerId: string;
  scheduledAt: string;
  status: 'Scheduled' | 'Accepted' | 'Rejected' | 'Not Ready' | 'In Progress' | 'Paused' | 'Completed';
  checklist: { item: string; status: 'Pending' | 'Pass' | 'Flag'; note?: string }[];
  offlineState?: 'Synced' | 'Queued' | 'Conflict review';
  defectIds?: string[];
}

export interface Defect {
  id: string;
  tenantId: string;
  projectId: string | null;
  assetId: string | null;
  source: 'Internal' | 'Citizen';
  reporterId: string;
  title: string;
  description: string;
  location: string;
  lat: number;
  lng: number;
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  status: 'Under Checker Review' | 'Assigned' | 'In Progress' | 'ATR Submitted' | 'Resolved' | 'Closed' | 'Rejected' | 'Reopened';
  checkerValidation: 'Pending' | 'Approved' | 'Rejected' | 'Not required';
  makerId: string | null;
  checkerId: string | null;
  duplicateOf: string | null;
  duplicateCount: number;
  createdAt: string;
  dueAt: string;
  media: string[];
  geofence: GeofenceResult | null;
  locationAccuracyMeters?: number;
  sourceInspectionId?: string;
  sourceChecklistItem?: string;
  atr?: { summary: string; submittedAt: string; media: string[]; lat: number; lng: number; accuracyMeters?: number; verifiedAt?: string; checkerNote?: string };
  feedback?: { rating: number; comment: string; submittedAt: string; reopened: boolean };
}

export interface Payment {
  id: string;
  tenantId: string;
  projectId: string;
  invoiceNo: string;
  makerId: string;
  checkerId: string;
  authorityId: string;
  amount: number;
  attendanceReference: string;
  inspectionReference: string;
  status: 'Submitted' | 'Checker Verified' | 'Checker Rejected' | 'Authority Approved' | 'Authority Rejected' | 'Disbursed';
  submittedAt: string;
  checkerNote?: string;
  authorityNote?: string;
}

export interface HelpdeskTicket {
  id: string;
  tenantId: string | null;
  raisedBy: string;
  category: string;
  priority: 'Critical' | 'High' | 'Medium' | 'Low';
  subject: string;
  description: string;
  status: 'Open' | 'Assigned' | 'In Progress' | 'Resolved' | 'Closed' | 'Reopened';
  createdAt: string;
  dueAt: string;
  assignedTo?: string | null;
  messages?: { id:string; by:string; text:string; at:string }[];
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
  kind: 'assignment' | 'approval' | 'sla' | 'status' | 'info';
}

export interface Activity {
  id: string;
  tenantId: string | null;
  actorId: string;
  actorRole: Role;
  action: string;
  entityType: string;
  entityId: string;
  timestamp: string;
  detail: string;
}

export interface SyncConflict {
  id: string;
  tenantId: string;
  userId: string;
  entityType: 'Attendance' | 'Inspection' | 'Defect';
  entityId: string;
  clientUpdatedAt: string;
  serverUpdatedAt: string;
  clientPayload: Record<string, unknown>;
  status: 'Manual review';
  createdAt: string;
}

export interface StoreData {
  users: User[];
  tenants: Tenant[];
  projects: Project[];
  assets: Asset[];
  attendance: AttendanceRecord[];
  inspections: Inspection[];
  defects: Defect[];
  payments: Payment[];
  tickets: HelpdeskTicket[];
  notifications: Notification[];
  activities: Activity[];
  gisLayers: GisLayer[];
  gisImports: GisImport[];
  syncConflicts: SyncConflict[];
  mediaEvidence: MediaEvidence[];
}

export interface GisOverview {
  configured: boolean;
  provider: 'Mappls';
  layers: GisLayer[];
  assets: Asset[];
  defects: Defect[];
  projects: Project[];
}

export interface Session {
  token: string;
  user: User;
  tenant: Tenant | null;
}

export interface DashboardData {
  kpis: { label: string; value: string; tone?: StatusTone; hint?: string }[];
  projects: Project[];
  defects: Defect[];
  payments: Payment[];
  inspections: Inspection[];
  activities: Activity[];
  tenants: Tenant[];
}

export const ROLE_LABELS: Record<Role, string> = {
  tenant_admin: 'Tenant Administrator',
  authority: 'Authority User',
  maker: 'External User · Maker',
  checker: 'External User · Checker',
  citizen: 'Citizen User',
};

export const ALL_MODULES = [
  'Access & Onboarding',
  'Project Management',
  'Asset Management',
  'Attendance',
  'Inspections',
  'Defect Management',
  'Payments',
  'Helpdesk',
  'Citizen App',
  'Dashboards & Reports',
  'Notifications',
  'Activity Log',
  'Search',
] as const;
