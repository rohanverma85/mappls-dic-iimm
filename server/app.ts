import crypto from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { z, ZodError } from 'zod';
import type { Defect, GeoJsonGeometry, HelpdeskTicket, Inspection, MediaEvidence, Notification, Payment, Role, StoreData, User } from '../shared/types.js';
import { geofenceFor, haversineMeters } from './geo.js';
import { store } from './store.js';

declare global {
  namespace Express {
    interface Request { user?: User }
  }
}

const id = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
const activeStatuses = new Set(['Under Checker Review','Assigned','In Progress','ATR Submitted','Reopened']);
const severityRank = ['Low','Medium','High','Critical'] as const;
const roleSchema = z.enum(['tenant_admin','authority','maker','checker','citizen']);
const uploadDir = path.resolve(process.cwd(),'data/uploads');
const mapplsAccessToken = () => process.env.MAPPLS_ACCESS_TOKEN?.trim() || process.env.mappls_access_token?.trim() || null;

const safeUser = (user: User) => user;
const tokenFor = (user: User) => Buffer.from(`iimm:${user.id}`).toString('base64url');
const tokenUserId = (token: string) => {
  try {
    const raw = Buffer.from(token, 'base64url').toString('utf8');
    return raw.startsWith('iimm:') ? raw.slice(5) : null;
  } catch { return null; }
};

const tenantScope = <T extends { tenantId: string | null }>(items: T[], user: User) =>
  user.role === 'tenant_admin' ? items : items.filter((item) => item.tenantId === user.tenantId);

const visibleToUser = <T extends { tenantId: string | null }>(items: T[], user: User) => {
  const scoped = tenantScope(items, user);
  if (user.role === 'citizen') {
    return scoped.filter((item) => !('reporterId' in item) || item.reporterId === user.id);
  }
  return scoped;
};

const auth = async (req: Request, res: Response, next: NextFunction) => {
  const bearer = req.header('authorization')?.replace(/^Bearer\s+/i, '');
  const userId = bearer ? tokenUserId(bearer) : null;
  const data = await store.all();
  const user = data.users.find((candidate) => candidate.id === userId && candidate.active);
  if (!user) return res.status(401).json({ error: 'Authentication required' });
  req.user = user;
  next();
};

const allow = (...roles: Role[]) => (req: Request, res: Response, next: NextFunction) => {
  if (!req.user || !roles.includes(req.user.role)) return res.status(403).json({ error: 'This action is not permitted for your role.' });
  next();
};

const log = async (user: User, action: string, entityType: string, entityId: string, detail: string) => {
  await store.activity(user, action, entityType, entityId, detail);
};

const notify = async (userId: string | null | undefined, title: string, message: string, kind: Notification['kind']) => {
  if (!userId) return;
  await store.mutate((data) => {
    data.notifications.unshift({ id:id('not'), userId, title, message, createdAt:new Date().toISOString(), read:false, kind });
  });
};

const geometrySchema = z.discriminatedUnion('type', [
  z.object({ type:z.literal('Point'), coordinates:z.tuple([z.number(),z.number()]) }),
  z.object({ type:z.literal('LineString'), coordinates:z.array(z.tuple([z.number(),z.number()])).min(2) }),
  z.object({ type:z.literal('MultiLineString'), coordinates:z.array(z.array(z.tuple([z.number(),z.number()])).min(2)).min(1) }),
  z.object({ type:z.literal('Polygon'), coordinates:z.array(z.array(z.tuple([z.number(),z.number()])).min(4)).min(1) }),
  z.object({ type:z.literal('MultiPolygon'), coordinates:z.array(z.array(z.array(z.tuple([z.number(),z.number()])).min(4)).min(1)).min(1) }),
]);

const coordinatesFor = (geometry: GeoJsonGeometry): [number,number][] => {
  const points:[number,number][] = [];
  const visit = (value:unknown) => {
    if (Array.isArray(value) && value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') points.push([value[0],value[1]]);
    else if (Array.isArray(value)) value.forEach(visit);
  };
  visit(geometry.coordinates);
  return points;
};

const geometryCentre = (geometry:GeoJsonGeometry) => {
  const points = coordinatesFor(geometry);
  const [lng,lat] = points.reduce(([x,y],[px,py])=>[x+px,y+py],[0,0]);
  return {lng:lng/points.length,lat:lat/points.length};
};

const featureSourceId = (feature:{id?:string;geometry:GeoJsonGeometry;properties:Record<string,string|number|boolean|null>}, sourceIdField:string|null) => {
  const candidate = sourceIdField ? feature.properties[sourceIdField] : feature.properties.asset_id ?? feature.properties.id ?? feature.properties.name ?? feature.id;
  return candidate === undefined || candidate === null || String(candidate).trim() === ''
    ? crypto.createHash('sha256').update(JSON.stringify(feature.geometry)).digest('hex').slice(0,20)
    : String(candidate).trim();
};

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '12mb' }));

  app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'IIMM API', timestamp: new Date().toISOString() }));

  app.get('/api/demo-users', async (_req, res) => {
    const data = await store.all();
    res.json(data.users.filter((user) => user.active).map(safeUser));
  });

  app.post('/api/auth/login', async (req, res) => {
    const body = z.object({ userId: z.string().optional(), role: roleSchema.optional(), tenantId: z.string().nullable().optional() }).parse(req.body);
    const data = await store.all();
    const user = body.userId
      ? data.users.find((candidate) => candidate.id === body.userId && candidate.active)
      : data.users.find((candidate) => candidate.role === body.role && candidate.active && (body.tenantId === undefined || candidate.tenantId === body.tenantId));
    if (!user) return res.status(404).json({ error: 'No active demo account matches that role and tenant.' });
    const tenant = user.tenantId ? data.tenants.find((item) => item.id === user.tenantId) ?? null : null;
    await log(user, 'SIGNED_IN', 'Session', user.id, `${user.role} signed in${tenant ? ` to ${tenant.shortName}` : ' to the platform console'}.`);
    res.json({ token: tokenFor(user), user: safeUser(user), tenant });
  });

  app.get('/api/session', auth, async (req, res) => {
    const data = await store.all();
    const tenant = req.user!.tenantId ? data.tenants.find((item) => item.id === req.user!.tenantId) ?? null : null;
    res.json({ token: tokenFor(req.user!), user: safeUser(req.user!), tenant });
  });

  app.post('/api/media', auth, allow('authority','maker','checker','citizen'), express.raw({type:['image/*','video/*'],limit:'8mb'}), async (req, res) => {
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) return res.status(400).json({ error:'A photo or video file is required.' });
    const mimeType = String(req.header('content-type') ?? '').split(';')[0].toLowerCase();
    const extensionByMime:Record<string,string> = { 'image/jpeg':'.jpg','image/png':'.png','image/webp':'.webp','image/heic':'.heic','video/mp4':'.mp4','video/quicktime':'.mov','video/webm':'.webm' };
    const extension = extensionByMime[mimeType];
    if (!extension) return res.status(415).json({ error:'Supported evidence formats are JPEG, PNG, WebP, HEIC, MP4, MOV and WebM.' });
    const coordinates = z.object({
      lat:z.coerce.number().min(-90).max(90), lng:z.coerce.number().min(-180).max(180),
      accuracyMeters:z.coerce.number().min(0).max(10_000).optional(), capturedAt:z.string().datetime().optional(),
    }).parse({lat:req.header('x-capture-lat'),lng:req.header('x-capture-lng'),accuracyMeters:req.header('x-capture-accuracy')||undefined,capturedAt:req.header('x-captured-at')||undefined});
    const evidenceId = id('media');
    const storageName = `${evidenceId}${extension}`;
    const originalName = String(req.header('x-file-name') || `field-evidence${extension}`).replace(/[\r\n"]/g,'').slice(0,180);
    await mkdir(uploadDir,{recursive:true});
    await writeFile(path.join(uploadDir,storageName),req.body);
    const evidence:MediaEvidence = { id:evidenceId, tenantId:req.user!.tenantId!, uploadedBy:req.user!.id, originalName, mimeType, size:req.body.length, storageName, capturedAt:coordinates.capturedAt ?? new Date().toISOString(), lat:coordinates.lat, lng:coordinates.lng, accuracyMeters:coordinates.accuracyMeters };
    await store.mutate((data)=>{data.mediaEvidence.unshift(evidence);});
    await log(req.user!,'UPLOADED_GEO_EVIDENCE','MediaEvidence',evidence.id,`${evidence.originalName} · ${evidence.lat.toFixed(5)}, ${evidence.lng.toFixed(5)}.`);
    res.status(201).json(evidence);
  });

  app.get('/api/media/:id', auth, async (req,res) => {
    const evidence = tenantScope((await store.all()).mediaEvidence,req.user!).find((item)=>item.id===req.params.id);
    if (!evidence) return res.status(404).json({error:'Evidence not found in the active tenant.'});
    res.type(evidence.mimeType);
    res.setHeader('content-disposition',`inline; filename="${evidence.originalName}"`);
    res.sendFile(path.join(uploadDir,evidence.storageName));
  });

  app.get('/api/mappls/config', auth, (_req, res) => {
    const accessToken = mapplsAccessToken();
    res.json({
      provider:'Mappls', configured:Boolean(accessToken), accessToken,
      sdkVersion:'3.0', layer:'vector',
      capabilities:['Vector basemap','Markers','GeoJSON network overlay','KML overlay adapter','Geofences','Reverse geocoding','mGIS WMS-ready layers'],
    });
  });

  app.get('/api/mappls/reverse-geocode', auth, async (req, res) => {
    const parsed = z.object({ lat:z.coerce.number().min(-90).max(90), lng:z.coerce.number().min(-180).max(180) }).parse(req.query);
    const accessToken = mapplsAccessToken();
    if (!accessToken) return res.json({ configured:false, address:`${parsed.lat.toFixed(6)}, ${parsed.lng.toFixed(6)}`, source:'Device coordinates' });
    const url = new URL('https://search.mappls.com/search/address/rev-geocode');
    url.searchParams.set('lat', String(parsed.lat));
    url.searchParams.set('lng', String(parsed.lng));
    url.searchParams.set('access_token', accessToken);
    const response = await fetch(url, { headers:{ accept:'application/json' } });
    if (!response.ok) return res.status(502).json({ error:'Mappls reverse geocoding is temporarily unavailable.' });
    const payload = await response.json() as { results?: Array<Record<string,string>> };
    const first = payload.results?.[0] ?? {};
    const address = first.formatted_address || first.formattedAddress || first.placeName || `${parsed.lat.toFixed(6)}, ${parsed.lng.toFixed(6)}`;
    res.json({ configured:true, address, source:'Mappls Reverse Geocoding', result:first });
  });

  app.get('/api/dashboard', auth, async (req, res) => {
    const user = req.user!;
    const data = await store.all();
    const projects = tenantScope(data.projects, user);
    const defects = visibleToUser(data.defects, user);
    const payments = tenantScope(data.payments, user).filter((payment) => user.role !== 'maker' || payment.makerId === user.id).filter((payment) => user.role !== 'checker' || payment.checkerId === user.id);
    const inspections = tenantScope(data.inspections, user).filter((inspection) => !['maker','checker'].includes(user.role) || inspection.makerId === user.id || inspection.checkerId === user.id);
    const activities = tenantScope(data.activities, user).slice(0, 8);
    const tenants = user.role === 'tenant_admin' ? data.tenants : [];
    const overdueDefects = defects.filter((defect) => activeStatuses.has(defect.status) && new Date(defect.dueAt) < new Date()).length;
    const roleKpis: Record<Role, { label: string; value: string; tone?: 'danger' | 'warning' | 'success' }[]> = {
      tenant_admin: [
        { label:'Total tenants', value:String(data.tenants.length) },
        { label:'Live tenants', value:String(data.tenants.filter((t) => t.status === 'Live').length), tone:'success' },
        { label:'Modules enabled', value:String(data.tenants.reduce((sum,t) => sum + t.modules.length,0)) },
        { label:'Pending provisioning', value:String(data.tenants.filter((t) => t.status === 'Provisioning').length), tone:'warning' },
      ],
      authority: [
        { label:'Active projects', value:String(projects.filter((p) => p.status === 'Active').length) },
        { label:'Open defects', value:String(defects.filter((d) => activeStatuses.has(d.status)).length) },
        { label:'SLA breaches', value:String(overdueDefects), tone: overdueDefects ? 'danger' : 'success' },
        { label:'Payments pending approval', value:String(payments.filter((p) => p.status === 'Checker Verified').length), tone:'warning' },
      ],
      maker: [
        { label:'Assigned projects', value:String(projects.filter((p) => p.makerIds.includes(user.id)).length) },
        { label:'Defects to rectify', value:String(defects.filter((d) => d.makerId === user.id && activeStatuses.has(d.status)).length) },
        { label:'Upcoming inspections', value:String(inspections.filter((i) => i.makerId === user.id && i.status !== 'Completed').length) },
        { label:'Claims in progress', value:String(payments.filter((p) => p.makerId === user.id && p.status !== 'Disbursed').length) },
      ],
      checker: [
        { label:'Citizen validations', value:String(defects.filter((d) => d.checkerValidation === 'Pending').length), tone:'warning' },
        { label:'ATR verifications', value:String(defects.filter((d) => d.status === 'ATR Submitted').length) },
        { label:'Payment claims', value:String(payments.filter((p) => p.status === 'Submitted').length) },
        { label:'Scheduled inspections', value:String(inspections.filter((i) => i.status !== 'Completed').length) },
      ],
      citizen: [
        { label:'My reports', value:String(defects.length) },
        { label:'Under review', value:String(defects.filter((d) => d.status === 'Under Checker Review').length), tone:'warning' },
        { label:'In progress', value:String(defects.filter((d) => ['Assigned','In Progress','ATR Submitted'].includes(d.status)).length) },
        { label:'Resolved', value:String(defects.filter((d) => ['Resolved','Closed'].includes(d.status)).length), tone:'success' },
      ],
    };
    res.json({ kpis: roleKpis[user.role], projects, defects, payments, inspections, activities, tenants });
  });

  app.get('/api/tenants', auth, allow('tenant_admin'), async (_req, res) => res.json((await store.all()).tenants));
  app.post('/api/tenants', auth, allow('tenant_admin'), async (req, res) => {
    const body = z.object({ name:z.string().min(3), shortName:z.string().min(2).max(12), type:z.string().min(3), hierarchy:z.string().min(3), modules:z.array(z.string()).min(2), assetTypes:z.array(z.object({ name:z.string(), attributes:z.array(z.string()), checklist:z.array(z.string()) })), slas:z.object({Critical:z.number().int().min(1),High:z.number().int().min(1),Medium:z.number().int().min(1),Low:z.number().int().min(1)}).default({Critical:24,High:72,Medium:168,Low:360}), dataMigration:z.boolean().default(false) }).parse(req.body);
    const tenant = await store.mutate((data) => {
      const created = { id:id('tenant'), name:body.name, shortName:body.shortName, type:body.type, hierarchy:body.hierarchy, status:'Provisioning' as const, modules:Array.from(new Set(['Access & Onboarding','Project Management',...body.modules])), assetTypes:body.assetTypes.map((a) => ({ ...a, id:id('at') })), slas:body.slas, dataMigration:body.dataMigration, primaryColor:'#104685', users:0 };
      data.tenants.push(created);
      return created;
    });
    await log(req.user!, 'PROVISIONED_TENANT', 'Tenant', tenant.id, `Created ${tenant.name} with ${tenant.assetTypes.length} asset types.`);
    res.status(201).json(tenant);
  });
  app.patch('/api/tenants/:id', auth, allow('tenant_admin'), async (req, res) => {
    const body = z.object({ status:z.enum(['Live','Provisioning','Requested','Inactive']).optional(), modules:z.array(z.string()).optional(), hierarchy:z.string().optional() }).parse(req.body);
    const updated = await store.mutate((data) => {
      const tenant = data.tenants.find((item) => item.id === req.params.id);
      if (!tenant) return null;
      Object.assign(tenant, body);
      return tenant;
    });
    if (!updated) return res.status(404).json({ error:'Tenant not found' });
    await log(req.user!, 'UPDATED_TENANT', 'Tenant', updated.id, `Updated tenant status/configuration.`);
    res.json(updated);
  });

  app.get('/api/users', auth, async (req, res) => {
    const data = await store.all();
    res.json(req.user!.role === 'tenant_admin' ? data.users : data.users.filter((u) => u.tenantId === req.user!.tenantId));
  });
  app.post('/api/users', auth, allow('authority','tenant_admin'), async (req, res) => {
    const body = z.object({ name:z.string().min(2), email:z.string().email().or(z.literal('')), mobile:z.string().min(8), role:roleSchema, designation:z.string().min(2), tenantId:z.string().nullable().optional() }).parse(req.body);
    if (req.user!.role === 'authority' && !['authority','maker','checker'].includes(body.role)) return res.status(403).json({ error:'Authority users may provision tenant-side users only.' });
    const tenantId = req.user!.role === 'tenant_admin' ? (body.tenantId ?? null) : req.user!.tenantId;
    const created = await store.mutate((data) => {
      const user: User = { id:id('usr'), ...body, tenantId, active:true };
      data.users.push(user);
      return user;
    });
    await log(req.user!, 'INVITED_USER', 'User', created.id, `Invited ${created.name} as ${created.role}.`);
    res.status(201).json(created);
  });
  app.patch('/api/users/:id', auth, allow('authority','tenant_admin'), async (req, res) => {
    const body = z.object({ active:z.boolean().optional(), designation:z.string().min(2).optional(), role:z.enum(['authority','maker','checker']).optional() }).parse(req.body);
    const updated = await store.mutate((data) => {
      const user = data.users.find((item) => item.id === req.params.id && (req.user!.role === 'tenant_admin' || item.tenantId === req.user!.tenantId));
      if (!user || user.role === 'tenant_admin' || user.role === 'citizen') return null;
      if (user.id === req.user!.id && body.active === false) return null;
      Object.assign(user, body);
      return user;
    });
    if (!updated) return res.status(404).json({ error:'Tenant user not found' });
    await log(req.user!, 'UPDATED_USER_ACCESS', 'User', updated.id, `${updated.name} is ${updated.active ? 'active' : 'inactive'} as ${updated.role}.`);
    res.json(updated);
  });

  app.get('/api/projects', auth, async (req, res) => res.json(tenantScope((await store.all()).projects, req.user!)));
  app.post('/api/projects', auth, allow('authority'), async (req, res) => {
    const body = z.object({ code:z.string().min(3), name:z.string().min(3), location:z.string().min(3), assetType:z.string().min(2), makerIds:z.array(z.string()).default([]), checkerIds:z.array(z.string()).default([]), center:z.object({lat:z.number().min(-90).max(90),lng:z.number().min(-180).max(180)}).optional(), geofenceRadiusMeters:z.number().int().min(25).max(10_000).default(250) }).parse(req.body);
    const created = await store.mutate((data) => {
      const validMakers = body.makerIds.every((userId)=>data.users.some((user)=>user.id===userId&&user.tenantId===req.user!.tenantId&&user.role==='maker'&&user.active));
      const validCheckers = body.checkerIds.every((userId)=>data.users.some((user)=>user.id===userId&&user.tenantId===req.user!.tenantId&&user.role==='checker'&&user.active));
      if (!validMakers || !validCheckers) return null;
      const project = { id:id('prj'), tenantId:req.user!.tenantId!, ...body, center:body.center ?? {lat:28.6139,lng:77.2090}, status:'Pending' as const, progress:0, milestones:[], documents:[] };
      data.projects.unshift(project);
      return project;
    });
    if (!created) return res.status(400).json({error:'Maker and Checker assignments must be active users in the current tenant.'});
    await log(req.user!, 'CREATED_PROJECT', 'Project', created.id, `Created ${created.code} · ${created.name}.`);
    res.status(201).json(created);
  });

  app.get('/api/assets', auth, async (req, res) => res.json(tenantScope((await store.all()).assets, req.user!)));
  app.post('/api/assets', auth, allow('authority'), async (req, res) => {
    const body = z.object({ projectId:z.string(), type:z.string(), name:z.string().min(3), location:z.string(), condition:z.enum(['Good','Fair','Attention','Critical']), attributes:z.record(z.string()).default({}), geometry:geometrySchema.optional(), layerId:z.string().nullable().default(null) }).parse(req.body);
    const created = await store.mutate((data) => {
      const project = data.projects.find((item) => item.id === body.projectId && item.tenantId === req.user!.tenantId);
      if (!project) return null;
      const asset = { id:id('asset'), tenantId:req.user!.tenantId!, ...body, geometry:(body.geometry ?? {type:'Point',coordinates:[project.center.lng,project.center.lat]}) as GeoJsonGeometry, lastInspected:'Not inspected' };
      data.assets.unshift(asset);
      return asset;
    });
    if (!created) return res.status(404).json({ error:'Project not found in the active tenant.' });
    await log(req.user!, 'REGISTERED_ASSET', 'Asset', created.id, `Registered ${created.name}.`);
    res.status(201).json(created);
  });

  app.get('/api/gis/layers', auth, async (req, res) => res.json(tenantScope((await store.all()).gisLayers, req.user!)));
  app.get('/api/gis/imports', auth, async (req, res) => {
    const imports = tenantScope((await store.all()).gisImports,req.user!).map(({assetSnapshots,createdAssetIds,...item})=>item);
    res.json(imports);
  });
  app.get('/api/gis/overview', auth, async (req, res) => {
    const data = await store.all();
    res.json({
      provider:'Mappls', configured:Boolean(mapplsAccessToken()),
      layers:tenantScope(data.gisLayers,req.user!), assets:tenantScope(data.assets,req.user!),
      defects:visibleToUser(data.defects,req.user!), projects:tenantScope(data.projects,req.user!),
    });
  });
  app.post('/api/gis/layers', auth, allow('authority'), async (req, res) => {
    const featureSchema = z.object({ type:z.literal('Feature'), id:z.string().optional(), geometry:geometrySchema, properties:z.record(z.union([z.string(),z.number(),z.boolean(),z.null()])).default({}) });
    const body = z.object({ name:z.string().min(3), description:z.string().default(''), projectId:z.string().nullable().default(null), source:z.literal('GeoJSON').default('GeoJSON'), style:z.object({color:z.string().regex(/^#[0-9a-f]{6}$/i),width:z.number().min(1).max(12),opacity:z.number().min(0.1).max(1)}), featureCollection:z.object({type:z.literal('FeatureCollection'),features:z.array(featureSchema).min(1)}) }).parse(req.body);
    const created = await store.mutate((data) => {
      if (body.projectId && !data.projects.some((project) => project.id === body.projectId && project.tenantId === req.user!.tenantId)) return null;
      const geometryTypes = new Set(body.featureCollection.features.map((feature) => feature.geometry.type.replace('Multi','').replace('String','')));
      const geometryType = geometryTypes.size > 1 ? 'Mixed' : geometryTypes.has('Point') ? 'Point' : geometryTypes.has('Line') ? 'Line' : 'Polygon';
      const now = new Date().toISOString();
      const layer = { id:id('layer'), tenantId:req.user!.tenantId!, ...body, geometryType:geometryType as 'Point'|'Line'|'Polygon'|'Mixed', status:'Published' as const, version:1, visible:true, createdAt:now, updatedAt:now };
      data.gisLayers.unshift(layer);
      return layer;
    });
    if (!created) return res.status(404).json({ error:'Project not found in the active tenant.' });
    await log(req.user!, 'PUBLISHED_GIS_LAYER', 'GisLayer', created.id, `Published ${created.name} with ${created.featureCollection.features.length} features.`);
    res.status(201).json(created);
  });

  app.post('/api/gis/imports', auth, allow('authority'), async (req,res) => {
    const featureSchema = z.object({ type:z.literal('Feature'), id:z.string().optional(), geometry:geometrySchema, properties:z.record(z.union([z.string(),z.number(),z.boolean(),z.null()])).default({}) });
    const body = z.object({
      projectId:z.string(), assetType:z.string().min(2), layerName:z.string().min(3), description:z.string().default('Imported infrastructure network'),
      fileName:z.string().min(3).max(180), format:z.enum(['KML','KMZ','Shapefile ZIP']), sourceIdField:z.string().nullable().default(null), nameField:z.string().nullable().default(null),
      replaceLayerId:z.string().nullable().default(null), style:z.object({color:z.string().regex(/^#[0-9a-f]{6}$/i),width:z.number().min(1).max(12),opacity:z.number().min(0.1).max(1)}),
      featureCollection:z.object({type:z.literal('FeatureCollection'),features:z.array(featureSchema).min(1).max(5000)}), warnings:z.array(z.string().max(250)).max(50).default([]),
    }).parse(req.body);
    const sourceIds = body.featureCollection.features.map((feature)=>featureSourceId(feature,body.sourceIdField));
    if (new Set(sourceIds).size !== sourceIds.length) return res.status(400).json({error:'The selected source ID is not unique. Choose another field before publishing.'});
    const result = await store.mutate((data) => {
      const tenantId = req.user!.tenantId!;
      const project = data.projects.find((item)=>item.id===body.projectId&&item.tenantId===tenantId);
      const tenant = data.tenants.find((item)=>item.id===tenantId);
      const assetType = tenant?.assetTypes.find((item)=>item.name===body.assetType);
      const replaced = body.replaceLayerId ? data.gisLayers.find((item)=>item.id===body.replaceLayerId&&item.tenantId===tenantId&&item.projectId===body.projectId&&item.visible) : null;
      if (!project || !assetType || (body.replaceLayerId && !replaced)) return null;
      const now = new Date().toISOString();
      const importId = id('import');
      const layerId = id('layer');
      const createdAssetIds:string[] = [];
      const assetSnapshots:typeof data.assets = [];
      let createdCount = 0;
      let updatedCount = 0;
      const features = body.featureCollection.features.map((feature,index) => {
        const sourceId = sourceIds[index];
        const existing = data.assets.find((item)=>item.tenantId===tenantId&&item.projectId===body.projectId&&item.type===body.assetType&&item.sourceId===sourceId);
        const centre = geometryCentre(feature.geometry as GeoJsonGeometry);
        const preferredName = body.nameField ? feature.properties[body.nameField] : feature.properties.name;
        const name = preferredName === undefined || preferredName === null || String(preferredName).trim()==='' ? `${body.assetType} ${sourceId}` : String(preferredName).trim();
        const attributes = Object.fromEntries(Object.entries(feature.properties).filter(([,value])=>value!==null).slice(0,50).map(([key,value])=>[key,String(value)]));
        if (existing) {
          assetSnapshots.push(structuredClone(existing));
          Object.assign(existing,{name,location:`${centre.lat.toFixed(6)}, ${centre.lng.toFixed(6)}`,attributes,geometry:feature.geometry,layerId,sourceImportId:importId});
          updatedCount += 1;
        } else {
          const asset = {id:id('asset'),tenantId,projectId:body.projectId,type:body.assetType,name,location:`${centre.lat.toFixed(6)}, ${centre.lng.toFixed(6)}`,condition:'Good' as const,attributes,lastInspected:'Not inspected',geometry:feature.geometry as GeoJsonGeometry,layerId,sourceId,sourceImportId:importId};
          data.assets.unshift(asset);
          createdAssetIds.push(asset.id);
          createdCount += 1;
        }
        return {...feature,id:feature.id ?? sourceId,properties:{...feature.properties,assetSourceId:sourceId}};
      });
      const geometryTypes = new Set(features.map((feature)=>feature.geometry.type.replace('Multi','').replace('String','')));
      const geometryType = geometryTypes.size>1?'Mixed':geometryTypes.has('Point')?'Point':geometryTypes.has('Line')?'Line':'Polygon';
      if (replaced) replaced.visible = false;
      const layer = {id:layerId,tenantId,projectId:body.projectId,name:body.layerName,description:body.description,source:(body.format==='Shapefile ZIP'?'Shapefile':'KML') as 'KML'|'Shapefile',geometryType:geometryType as 'Point'|'Line'|'Polygon'|'Mixed',status:'Published' as const,version:(replaced?.version ?? 0)+1,visible:true,style:body.style,featureCollection:{type:'FeatureCollection' as const,features},createdAt:now,updatedAt:now,importId,supersedesLayerId:replaced?.id ?? null};
      data.gisLayers.unshift(layer);
      const importJob = {id:importId,tenantId,projectId:body.projectId,layerId,supersedesLayerId:replaced?.id ?? null,fileName:body.fileName,format:body.format,layerName:body.layerName,assetType:body.assetType,sourceIdField:body.sourceIdField,nameField:body.nameField,featureCount:features.length,createdCount,updatedCount,rejectedCount:0,status:'Published' as const,warnings:body.warnings,importedBy:req.user!.id,importedAt:now,createdAssetIds,assetSnapshots};
      data.gisImports.unshift(importJob);
      return {layer,importJob:{...importJob,assetSnapshots:undefined,createdAssetIds:undefined}};
    });
    if (!result) return res.status(404).json({error:'Project, asset type or replacement layer is not valid in the active tenant.'});
    await log(req.user!,'IMPORTED_GIS_ASSETS','GisImport',result.importJob.id,`Published ${result.importJob.fileName}: ${result.importJob.createdCount} created, ${result.importJob.updatedCount} updated.`);
    res.status(201).json(result);
  });

  app.post('/api/gis/imports/:id/rollback', auth, allow('authority'), async (req,res) => {
    const result = await store.mutate((data) => {
      const item = data.gisImports.find((candidate)=>candidate.id===req.params.id&&candidate.tenantId===req.user!.tenantId&&candidate.status==='Published');
      if (!item) return null;
      data.assets = data.assets.filter((asset)=>!(item.createdAssetIds ?? []).includes(asset.id));
      (item.assetSnapshots ?? []).forEach((snapshot)=>{const index=data.assets.findIndex((asset)=>asset.id===snapshot.id);if(index>=0)data.assets[index]=snapshot;else data.assets.unshift(snapshot);});
      const layer = data.gisLayers.find((candidate)=>candidate.id===item.layerId);
      if (layer) layer.visible=false;
      const superseded = item.supersedesLayerId ? data.gisLayers.find((candidate)=>candidate.id===item.supersedesLayerId&&candidate.tenantId===item.tenantId) : null;
      if (superseded) superseded.visible=true;
      item.status='Rolled back';
      item.rolledBackAt=new Date().toISOString();
      const {assetSnapshots,createdAssetIds,...safe}=item;
      return safe;
    });
    if(!result)return res.status(404).json({error:'Published import not found in the active tenant.'});
    await log(req.user!,'ROLLED_BACK_GIS_IMPORT','GisImport',result.id,`Rolled back ${result.fileName} and restored the preceding network version.`);
    res.json(result);
  });

  app.get('/api/attendance', auth, async (req, res) => res.json(tenantScope((await store.all()).attendance, req.user!)));
  app.post('/api/attendance', auth, allow('maker'), async (req, res) => {
    const body = z.object({ projectId:z.string(), lat:z.number().min(-90).max(90), lng:z.number().min(-180).max(180), accuracyMeters:z.number().min(0).max(10_000).optional(), offline:z.boolean().default(false) }).parse(req.body);
    const today = new Date().toISOString().slice(0,10);
    const created = await store.mutate((data) => {
      const project = data.projects.find((item) => item.id === body.projectId && item.tenantId === req.user!.tenantId && item.makerIds.includes(req.user!.id));
      if (!project) return null;
      const existing = data.attendance.find((a) => a.makerId === req.user!.id && a.projectId === body.projectId && a.date === today);
      if (existing) return existing;
      const distanceMeters = haversineMeters({lat:body.lat,lng:body.lng},project.center);
      const withinGeofence = distanceMeters <= project.geofenceRadiusMeters;
      const record = { id:id('att'), tenantId:req.user!.tenantId!, projectId:body.projectId, makerId:req.user!.id, date:today, checkIn:new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:false}), checkOut:null, lat:body.lat, lng:body.lng, withinGeofence, status:(body.offline ? 'Pending sync' : withinGeofence ? 'Present' : 'Out of radius') as 'Pending sync'|'Present'|'Out of radius' };
      data.attendance.unshift(record);
      return record;
    });
    if (!created) return res.status(403).json({ error:'Attendance can be marked only against a project assigned to this Maker.' });
    await log(req.user!, 'MARKED_ATTENDANCE', 'Attendance', created.id, `${created.status} at ${created.lat.toFixed(4)}, ${created.lng.toFixed(4)}.`);
    res.status(201).json(created);
  });

  app.get('/api/inspections', auth, async (req, res) => res.json(tenantScope((await store.all()).inspections, req.user!)));
  app.post('/api/inspections', auth, allow('authority','maker','checker'), async (req, res) => {
    const body = z.object({ projectId:z.string(), assetId:z.string(), type:z.enum(['Joint','Requested']), makerId:z.string(), checkerId:z.string(), scheduledAt:z.string().datetime(), checklist:z.array(z.string()) }).parse(req.body);
    const created = await store.mutate((data) => {
      const project = data.projects.find((item)=>item.id===body.projectId&&item.tenantId===req.user!.tenantId);
      const asset = data.assets.find((item)=>item.id===body.assetId&&item.tenantId===req.user!.tenantId&&item.projectId===body.projectId);
      const maker = data.users.find((item)=>item.id===body.makerId&&item.tenantId===req.user!.tenantId&&item.role==='maker'&&item.active);
      const checker = data.users.find((item)=>item.id===body.checkerId&&item.tenantId===req.user!.tenantId&&item.role==='checker'&&item.active);
      if (!project||!asset||!maker||!checker) return null;
      const inspection: Inspection = { id:`INS-${Math.floor(1000 + Math.random()*9000)}`, tenantId:req.user!.tenantId!, ...body, status:'Scheduled', checklist:body.checklist.map((item) => ({ item,status:'Pending' })), offlineState:'Synced' };
      data.inspections.unshift(inspection);
      return inspection;
    });
    if (!created) return res.status(400).json({error:'Inspection project, asset, Maker and Checker must belong to the current tenant.'});
    await log(req.user!, 'SCHEDULED_INSPECTION', 'Inspection', created.id, `${created.type} inspection scheduled.`);
    res.status(201).json(created);
  });
  app.patch('/api/inspections/:id', auth, allow('maker','checker','authority'), async (req, res) => {
    const body = z.object({ status:z.enum(['Accepted','Rejected','Not Ready','In Progress','Paused','Completed']).optional(), checklist:z.array(z.object({ item:z.string(), status:z.enum(['Pending','Pass','Flag']), note:z.string().optional() })).optional(), offlineState:z.enum(['Synced','Queued','Conflict review']).optional() }).parse(req.body);
    const updated = await store.mutate((data) => {
      const item = data.inspections.find((i) => i.id === req.params.id && i.tenantId === req.user!.tenantId);
      if (!item) return null;
      if (req.user!.role === 'maker' && item.makerId !== req.user!.id) return null;
      if (req.user!.role === 'checker' && item.checkerId !== req.user!.id) return null;
      if (req.user!.role === 'authority' && (body.checklist || body.status === 'In Progress' || body.status === 'Paused' || body.status === 'Completed')) return null;
      const nextChecklist = body.checklist ?? item.checklist;
      if (body.status === 'Completed' && nextChecklist.some((entry) => entry.status === 'Pending')) return null;
      Object.assign(item, body);
      return item;
    });
    if (!updated) return res.status(404).json({ error:'Inspection not found' });
    await log(req.user!, 'UPDATED_INSPECTION', 'Inspection', updated.id, `Inspection moved to ${updated.status}.`);
    res.json(updated);
  });

  app.get('/api/defects', auth, async (req, res) => res.json(visibleToUser((await store.all()).defects, req.user!)));
  app.post('/api/defects', auth, async (req, res) => {
    const body = z.object({ title:z.string().min(4), description:z.string().min(8), location:z.string().min(3), lat:z.number().min(-90).max(90), lng:z.number().min(-180).max(180), locationAccuracyMeters:z.number().min(0).max(10_000).optional(), severity:z.enum(['Critical','High','Medium','Low']).default('Medium'), projectId:z.string().nullable().default(null), assetId:z.string().nullable().default(null), media:z.array(z.string()).min(1) }).parse(req.body);
    const data = await store.all();
    const source = req.user!.role === 'citizen' ? 'Citizen' : 'Internal';
    const project = body.projectId ? data.projects.find((item) => item.id === body.projectId && item.tenantId === req.user!.tenantId) : undefined;
    const asset = body.assetId ? data.assets.find((item) => item.id === body.assetId && item.tenantId === req.user!.tenantId) : undefined;
    if (body.projectId && !project) return res.status(404).json({ error:'Project not found in the active tenant.' });
    if (body.assetId && !asset) return res.status(404).json({ error:'Asset not found in the active tenant.' });
    if (source === 'Citizen') {
      const duplicate = data.defects.find((d) => d.tenantId === req.user!.tenantId && activeStatuses.has(d.status) && ((body.assetId && d.assetId === body.assetId) || haversineMeters({lat:d.lat,lng:d.lng},{lat:body.lat,lng:body.lng}) <= 300));
      if (duplicate) {
        const updated = await store.mutate((state) => {
          const found = state.defects.find((d) => d.id === duplicate.id)!;
          found.duplicateCount += 1;
          const currentRank = severityRank.indexOf(found.severity);
          found.severity = severityRank[Math.min(severityRank.length-1, currentRank+1)];
          return found;
        });
        await log(req.user!, 'LINKED_DUPLICATE_REPORT', 'Defect', updated.id, `Citizen report linked to existing defect; severity escalated to ${updated.severity}.`);
        return res.status(200).json({ duplicate:true, defect:updated });
      }
    }
    const created = await store.mutate((state) => {
      const tenant = state.tenants.find((t) => t.id === req.user!.tenantId)!;
      const dueHours = tenant?.slas[body.severity] ?? 168;
      const checker = state.users.find((u) => u.tenantId === req.user!.tenantId && u.role === 'checker');
      const defect: Defect = { id:`${source === 'Citizen' ? 'CIT':'DEF'}-${Math.floor(1000+Math.random()*9000)}`, tenantId:req.user!.tenantId!, projectId:body.projectId, assetId:body.assetId, source, reporterId:req.user!.id, title:body.title, description:body.description, location:body.location, lat:body.lat, lng:body.lng, locationAccuracyMeters:body.locationAccuracyMeters, geofence:geofenceFor({lat:body.lat,lng:body.lng},project,asset), severity:body.severity, status:source === 'Citizen' ? 'Under Checker Review':'Assigned', checkerValidation:source === 'Citizen' ? 'Pending':'Not required', makerId:source === 'Citizen' ? null : req.user!.role === 'maker' ? req.user!.id : null, checkerId:checker?.id ?? null, duplicateOf:null, duplicateCount:0, createdAt:new Date().toISOString(), dueAt:new Date(Date.now()+dueHours*3_600_000).toISOString(), media:body.media };
      state.defects.unshift(defect);
      return defect;
    });
    await log(req.user!, 'REPORTED_DEFECT', 'Defect', created.id, `${created.source} defect created with ${created.severity} severity.`);
    await notify(created.checkerId, source === 'Citizen' ? 'Citizen defect awaiting validation' : 'Defect requires verification', `${created.id} · ${created.title}`, 'assignment');
    res.status(201).json({ duplicate:false, defect:created });
  });
  app.post('/api/defects/:id/validate', auth, allow('checker'), async (req, res) => {
    const body = z.object({ decision:z.enum(['approve','reject']), makerId:z.string().optional(), projectId:z.string().optional() }).parse(req.body);
    const updated = await store.mutate((data) => {
      const defect = data.defects.find((d) => d.id === req.params.id && d.tenantId === req.user!.tenantId && d.source === 'Citizen');
      if (!defect || defect.checkerValidation !== 'Pending') return null;
      defect.checkerValidation = body.decision === 'approve' ? 'Approved':'Rejected';
      defect.status = body.decision === 'approve' ? 'Assigned':'Rejected';
      if (body.decision === 'approve') {
        defect.makerId = body.makerId ?? data.users.find((u) => u.tenantId === defect.tenantId && u.role === 'maker')?.id ?? null;
        defect.projectId = body.projectId ?? data.projects.find((p) => p.tenantId === defect.tenantId)?.id ?? null;
        const assignedProject = data.projects.find((project) => project.id === defect.projectId && project.tenantId === defect.tenantId);
        const linkedAsset = data.assets.find((asset) => asset.id === defect.assetId && asset.tenantId === defect.tenantId);
        defect.geofence = geofenceFor({lat:defect.lat,lng:defect.lng},assignedProject,linkedAsset);
      }
      return defect;
    });
    if (!updated) return res.status(409).json({ error:'Defect is not awaiting validation.' });
    await log(req.user!, body.decision === 'approve' ? 'VALIDATED_CITIZEN_DEFECT':'REJECTED_CITIZEN_DEFECT', 'Defect', updated.id, `Checker ${body.decision}d citizen submission.`);
    await notify(updated.reporterId, body.decision === 'approve' ? 'Report validated' : 'Report not accepted', `${updated.id} is now ${updated.status}.`, 'status');
    if (body.decision === 'approve') await notify(updated.makerId, 'Defect assigned', `${updated.id} · ${updated.title}`, 'assignment');
    res.json(updated);
  });
  app.post('/api/defects/:id/start', auth, allow('maker'), async (req, res) => {
    const updated = await store.mutate((data) => {
      const defect = data.defects.find((item) => item.id === req.params.id && item.tenantId === req.user!.tenantId && item.makerId === req.user!.id && ['Assigned','Reopened'].includes(item.status));
      if (!defect) return null;
      defect.status = 'In Progress';
      return defect;
    });
    if (!updated) return res.status(409).json({ error:'This defect cannot be started by this Maker.' });
    await log(req.user!, 'STARTED_DEFECT_WORK', 'Defect', updated.id, 'Maker started rectification in the field.');
    await notify(updated.reporterId, 'Repair work started', `${updated.id} is now in progress.`, 'status');
    res.json(updated);
  });
  app.post('/api/defects/:id/atr', auth, allow('maker'), async (req, res) => {
    const body = z.object({ summary:z.string().min(10), media:z.array(z.string()).min(1), lat:z.number().min(-90).max(90), lng:z.number().min(-180).max(180), accuracyMeters:z.number().min(0).max(10_000).optional() }).parse(req.body);
    const updated = await store.mutate((data) => {
      const defect = data.defects.find((d) => d.id === req.params.id && d.makerId === req.user!.id && d.status === 'In Progress');
      if (!defect) return null;
      defect.atr = { summary:body.summary, submittedAt:new Date().toISOString(), media:body.media, lat:body.lat, lng:body.lng, accuracyMeters:body.accuracyMeters };
      defect.status = 'ATR Submitted';
      return defect;
    });
    if (!updated) return res.status(409).json({ error:'This defect cannot accept an ATR from this Maker.' });
    await log(req.user!, 'SUBMITTED_ATR', 'Defect', updated.id, body.summary);
    await notify(updated.checkerId, 'ATR awaiting verification', `${updated.id} has geo-tagged rectification evidence.`, 'approval');
    res.json(updated);
  });
  app.post('/api/defects/:id/verify-atr', auth, allow('checker'), async (req, res) => {
    const body = z.object({ decision:z.enum(['verify','rework']), note:z.string().default('') }).parse(req.body);
    const updated = await store.mutate((data) => {
      const defect = data.defects.find((d) => d.id === req.params.id && d.checkerId === req.user!.id && d.status === 'ATR Submitted' && d.atr);
      if (!defect) return null;
      defect.status = body.decision === 'verify' ? 'Resolved':'Reopened';
      defect.atr!.checkerNote = body.note;
      if (body.decision === 'verify') defect.atr!.verifiedAt = new Date().toISOString();
      return defect;
    });
    if (!updated) return res.status(409).json({ error:'ATR is not ready for verification.' });
    await log(req.user!, body.decision === 'verify' ? 'VERIFIED_ATR':'RETURNED_ATR', 'Defect', updated.id, `Checker decision: ${body.decision}.`);
    await notify(updated.makerId, body.decision === 'verify' ? 'ATR verified' : 'ATR returned for rework', `${updated.id} is now ${updated.status}.`, 'status');
    await notify(updated.reporterId, body.decision === 'verify' ? 'Issue resolved' : 'Repair requires more work', `${updated.id} is now ${updated.status}.`, 'status');
    res.json(updated);
  });
  app.post('/api/defects/:id/feedback', auth, allow('citizen'), async (req, res) => {
    const body = z.object({ rating:z.number().int().min(1).max(5), comment:z.string().max(500).default(''), reopen:z.boolean().default(false) }).parse(req.body);
    const updated = await store.mutate((data) => {
      const defect = data.defects.find((item) => item.id === req.params.id && item.tenantId === req.user!.tenantId && item.reporterId === req.user!.id && ['Resolved','Closed'].includes(item.status));
      if (!defect) return null;
      defect.feedback = { rating:body.rating, comment:body.comment, submittedAt:new Date().toISOString(), reopened:body.reopen };
      defect.status = body.reopen ? 'Reopened' : 'Closed';
      return defect;
    });
    if (!updated) return res.status(409).json({ error:'Feedback is available only for your resolved reports.' });
    await log(req.user!, body.reopen ? 'REOPENED_CITIZEN_DEFECT':'CLOSED_CITIZEN_DEFECT', 'Defect', updated.id, `Citizen feedback: ${body.rating}/5.`);
    if (body.reopen) await notify(updated.makerId, 'Citizen reopened defect', `${updated.id} requires another rectification cycle.`, 'assignment');
    res.json(updated);
  });

  app.get('/api/payments', auth, async (req, res) => res.json(tenantScope((await store.all()).payments, req.user!)));
  app.post('/api/payments', auth, allow('maker'), async (req, res) => {
    const body = z.object({ projectId:z.string(), invoiceNo:z.string().min(4), checkerId:z.string(), authorityId:z.string(), amount:z.number().positive(), attendanceReference:z.string(), inspectionReference:z.string() }).parse(req.body);
    const created = await store.mutate((data) => {
      const project = data.projects.find((item)=>item.id===body.projectId&&item.tenantId===req.user!.tenantId&&item.makerIds.includes(req.user!.id));
      const checker = data.users.find((item)=>item.id===body.checkerId&&item.tenantId===req.user!.tenantId&&item.role==='checker'&&item.active);
      const authority = data.users.find((item)=>item.id===body.authorityId&&item.tenantId===req.user!.tenantId&&item.role==='authority'&&item.active);
      if (!project||!checker||!authority) return null;
      const payment: Payment = { id:`PAY-${Math.floor(1000+Math.random()*9000)}`, tenantId:req.user!.tenantId!, makerId:req.user!.id, ...body, status:'Submitted', submittedAt:new Date().toISOString() };
      data.payments.unshift(payment);
      return payment;
    });
    if (!created) return res.status(403).json({error:'The claim must use your assigned project and active tenant-side Checker and Authority users.'});
    await log(req.user!, 'SUBMITTED_PAYMENT', 'Payment', created.id, `Invoice ${created.invoiceNo} submitted for ₹${created.amount}.`);
    res.status(201).json(created);
  });
  app.post('/api/payments/:id/action', auth, allow('checker','authority'), async (req, res) => {
    const body = z.object({ decision:z.enum(['approve','reject']), note:z.string().default('') }).parse(req.body);
    const updated = await store.mutate((data) => {
      const payment = data.payments.find((p) => p.id === req.params.id && p.tenantId === req.user!.tenantId);
      if (!payment) return null;
      if (req.user!.role === 'checker' && payment.status === 'Submitted' && payment.checkerId === req.user!.id) {
        payment.status = body.decision === 'approve' ? 'Checker Verified':'Checker Rejected';
        payment.checkerNote = body.note;
        return payment;
      }
      if (req.user!.role === 'authority' && payment.status === 'Checker Verified' && payment.authorityId === req.user!.id) {
        payment.status = body.decision === 'approve' ? 'Authority Approved':'Authority Rejected';
        payment.authorityNote = body.note;
        return payment;
      }
      return null;
    });
    if (!updated) return res.status(409).json({ error:'The payment is not at a stage actionable by this user.' });
    await log(req.user!, 'REVIEWED_PAYMENT', 'Payment', updated.id, `${req.user!.role} decision: ${body.decision}.`);
    res.json(updated);
  });

  app.get('/api/tickets', auth, async (req, res) => res.json(visibleToUser((await store.all()).tickets, req.user!)));
  app.post('/api/tickets', auth, async (req, res) => {
    const body = z.object({ category:z.string(), priority:z.enum(['Critical','High','Medium','Low']), subject:z.string().min(5), description:z.string().min(8) }).parse(req.body);
    const created = await store.mutate((data) => {
      const dueHours = body.priority === 'Critical' ? 4 : body.priority === 'High' ? 24 : body.priority === 'Medium' ? 72 : 168;
      const ticket: HelpdeskTicket = { id:`HD-${Math.floor(1000+Math.random()*9000)}`, tenantId:req.user!.tenantId, raisedBy:req.user!.id, ...body, status:'Open', createdAt:new Date().toISOString(), dueAt:new Date(Date.now()+dueHours*3_600_000).toISOString() };
      data.tickets.unshift(ticket);
      return ticket;
    });
    await log(req.user!, 'CREATED_TICKET', 'HelpdeskTicket', created.id, created.subject);
    res.status(201).json(created);
  });
  app.patch('/api/tickets/:id', auth, allow('checker','authority','tenant_admin'), async (req, res) => {
    const body = z.object({ status:z.enum(['Assigned','In Progress','Resolved','Closed','Reopened']) }).parse(req.body);
    const updated = await store.mutate((data) => {
      const ticket = data.tickets.find((t) => t.id === req.params.id && (req.user!.role === 'tenant_admin' || t.tenantId === req.user!.tenantId));
      if (!ticket) return null;
      ticket.status = body.status;
      return ticket;
    });
    if (!updated) return res.status(404).json({ error:'Ticket not found' });
    await log(req.user!, 'UPDATED_TICKET', 'HelpdeskTicket', updated.id, `Ticket moved to ${updated.status}.`);
    res.json(updated);
  });

  app.get('/api/notifications', auth, async (req, res) => res.json((await store.all()).notifications.filter((n) => n.userId === req.user!.id)));
  app.post('/api/notifications/read-all', auth, async (req, res) => {
    await store.mutate((data) => data.notifications.filter((n) => n.userId === req.user!.id).forEach((n) => { n.read = true; }));
    res.json({ ok:true });
  });
  app.get('/api/activities', auth, async (req, res) => res.json(tenantScope((await store.all()).activities, req.user!)));

  app.get('/api/sync/conflicts', auth, async (req, res) => {
    const data = await store.all();
    res.json(data.syncConflicts.filter((item) => item.tenantId === req.user!.tenantId && (req.user!.role === 'authority' || req.user!.role === 'checker' || item.userId === req.user!.id)));
  });
  app.post('/api/sync', auth, allow('maker','checker'), async (req, res) => {
    const body = z.object({ operations:z.array(z.object({ entityType:z.enum(['Inspection','Defect']), entityId:z.string(), clientUpdatedAt:z.string().datetime(), payload:z.record(z.unknown()) })).min(1).max(50) }).parse(req.body);
    const result = await store.mutate((data) => {
      const applied:string[] = [];
      const conflicts = [];
      for (const operation of body.operations) {
        const lastServerEvent = data.activities.find((entry) => entry.entityId === operation.entityId);
        const serverUpdatedAt = lastServerEvent?.timestamp ?? '1970-01-01T00:00:00.000Z';
        if (new Date(operation.clientUpdatedAt) < new Date(serverUpdatedAt)) {
          const conflict = { id:id('conflict'), tenantId:req.user!.tenantId!, userId:req.user!.id, entityType:operation.entityType, entityId:operation.entityId, clientUpdatedAt:operation.clientUpdatedAt, serverUpdatedAt, clientPayload:operation.payload, status:'Manual review' as const, createdAt:new Date().toISOString() };
          data.syncConflicts.unshift(conflict);
          conflicts.push(conflict);
          continue;
        }
        if (operation.entityType === 'Inspection') {
          const inspection = data.inspections.find((item) => item.id === operation.entityId && item.tenantId === req.user!.tenantId && (item.makerId === req.user!.id || item.checkerId === req.user!.id));
          const parsed = z.object({ status:z.enum(['Accepted','Rejected','Not Ready','In Progress','Paused','Completed']).optional(), checklist:z.array(z.object({item:z.string(),status:z.enum(['Pending','Pass','Flag']),note:z.string().optional()})).optional() }).safeParse(operation.payload);
          if (inspection && parsed.success) { Object.assign(inspection, parsed.data, { offlineState:'Synced' as const }); applied.push(operation.entityId); }
        }
        if (operation.entityType === 'Defect') {
          const defect = data.defects.find((item) => item.id === operation.entityId && item.tenantId === req.user!.tenantId && (item.makerId === req.user!.id || item.checkerId === req.user!.id));
          const parsed = z.object({ status:z.enum(['In Progress','Reopened']).optional() }).safeParse(operation.payload);
          if (defect && parsed.success) { Object.assign(defect, parsed.data); applied.push(operation.entityId); }
        }
      }
      return { applied, conflicts };
    });
    for (const entityId of result.applied) await log(req.user!, 'SYNCED_OFFLINE_CHANGE', 'OfflineOperation', entityId, 'Applied after reconnect using server-timestamp conflict rules.');
    for (const conflict of result.conflicts) await log(req.user!, 'QUEUED_SYNC_CONFLICT', conflict.entityType, conflict.entityId, 'Client edit is older than the server state and requires manual review.');
    res.json(result);
  });

  app.get('/api/search', auth, async (req, res) => {
    const query = String(req.query.q ?? '').trim().toLowerCase();
    if (query.length < 2) return res.json([]);
    const data = await store.all();
    const result = [
      ...tenantScope(data.projects, req.user!).map((p) => ({ type:'Project', id:p.id, title:p.name, subtitle:`${p.code} · ${p.location}` })),
      ...tenantScope(data.assets, req.user!).map((a) => ({ type:'Asset', id:a.id, title:a.name, subtitle:`${a.type} · ${a.location}` })),
      ...tenantScope(data.gisLayers, req.user!).map((layer) => ({ type:'GIS Layer', id:layer.id, title:layer.name, subtitle:`${layer.source} · v${layer.version} · ${layer.status}` })),
      ...tenantScope(data.inspections, req.user!).map((inspection) => ({ type:'Inspection', id:inspection.id, title:`${inspection.type} inspection`, subtitle:`${inspection.assetId} · ${inspection.status}` })),
      ...visibleToUser(data.defects, req.user!).map((d) => ({ type:'Defect', id:d.id, title:d.title, subtitle:`${d.id} · ${d.status}` })),
      ...visibleToUser(data.tickets, req.user!).map((t) => ({ type:'Helpdesk', id:t.id, title:t.subject, subtitle:`${t.id} · ${t.status}` })),
      ...tenantScope(data.users.map((u) => ({ ...u, tenantId:u.tenantId })), req.user!).map((u) => ({ type:'User', id:u.id, title:u.name, subtitle:`${u.designation} · ${u.role}` })),
    ].filter((item) => `${item.id} ${item.title} ${item.subtitle}`.toLowerCase().includes(query));
    res.json(result.slice(0,30));
  });

  app.get('/api/reports/:type.csv', auth, allow('tenant_admin','authority','checker'), async (req, res) => {
    const data = await store.all();
    const type = String(req.params.type);
    const csv = reportCsv(type, data, req.user!);
    if (!csv) return res.status(404).json({ error:'Unknown report type' });
    res.type('text/csv').attachment(`iimm-${type}-report.csv`).send(csv);
  });

  app.post('/api/dev/reset', async (_req, res) => {
    if (process.env.NODE_ENV === 'production') return res.status(404).end();
    await store.reset();
    res.json({ ok:true });
  });

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof ZodError) return res.status(400).json({ error:'Invalid request', issues:error.issues });
    console.error(error);
    res.status(500).json({ error:'Unexpected server error' });
  });
  return app;
}

function reportCsv(type: string, data: StoreData, user: User) {
  const escape = (value: unknown) => `"${String(value ?? '').replaceAll('"','""')}"`;
  if (type === 'defects') {
    const rows = tenantScope(data.defects,user).map((d) => [d.id,d.source,d.title,d.severity,d.status,d.location,d.createdAt,d.dueAt]);
    return [['ID','Source','Title','Severity','Status','Location','Created','Due'],...rows].map((row) => row.map(escape).join(',')).join('\n');
  }
  if (type === 'payments') {
    const rows = tenantScope(data.payments,user).map((p) => [p.id,p.invoiceNo,p.amount,p.status,p.submittedAt]);
    return [['ID','Invoice','Amount','Status','Submitted'],...rows].map((row) => row.map(escape).join(',')).join('\n');
  }
  if (type === 'activity') {
    const rows = tenantScope(data.activities,user).map((a) => [a.timestamp,a.actorRole,a.action,a.entityType,a.entityId,a.detail]);
    return [['Timestamp','Actor Role','Action','Entity','Entity ID','Detail'],...rows].map((row) => row.map(escape).join(',')).join('\n');
  }
  return null;
}
