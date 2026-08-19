import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { store } from './store.js';

const app = process.env.TEST_BASE_URL || createApp();

async function login(userId:string) {
  const response = await request(app).post('/api/auth/login').send({ userId }).expect(200);
  return response.body.token as string;
}

const auth = (token:string) => ({ Authorization:`Bearer ${token}` });

describe('IIMM API', () => {
  beforeEach(async () => { if(typeof app==='string')await request(app).post('/api/dev/reset').expect(200);else await store.reset(); });

  it('returns a healthy service and seeded role accounts', async () => {
    await request(app).get('/api/health').expect(200).expect(({body}) => expect(body.ok).toBe(true));
    const users = await request(app).get('/api/demo-users').expect(200);
    expect(new Set(users.body.map((user:{role:string}) => user.role)).size).toBe(5);
  });

  it('keeps tenant operational data isolated', async () => {
    const token = await login('usr-auth-1');
    const projects = await request(app).get('/api/projects').set(auth(token)).expect(200);
    expect(projects.body.length).toBeGreaterThan(0);
    expect(projects.body.every((project:{tenantId:string}) => project.tenantId === 'tenant-nhai')).toBe(true);
  });

  it('stores geo-tagged field media and keeps it tenant-scoped', async () => {
    const maker = await login('usr-maker-1');
    const otherTenant = await login('usr-maker-2');
    const upload = await request(app).post('/api/media').set(auth(maker))
      .set('content-type','image/jpeg').set('x-file-name','bridge-evidence.jpg')
      .set('x-capture-lat','23.1462').set('x-capture-lng','79.9341').set('x-capture-accuracy','6')
      .send(Buffer.from([0xff,0xd8,0xff,0xd9])).expect(201);
    expect(upload.body.originalName).toBe('bridge-evidence.jpg');
    expect(upload.body.lat).toBe(23.1462);
    await request(app).get(`/api/media/${upload.body.id}`).set(auth(maker)).expect(200).expect('content-type',/image\/jpeg/);
    await request(app).get(`/api/media/${upload.body.id}`).set(auth(otherTenant)).expect(404);
  });

  it('links a nearby citizen report and escalates severity instead of creating a duplicate', async () => {
    const token = await login('usr-citizen-1');
    const result = await request(app).post('/api/defects').set(auth(token)).send({
      title:'Water seepage in records room', description:'The same wall is still leaking after rainfall.', location:'Municipal Building · Ward 7 office', lat:28.6139, lng:77.2090, severity:'Medium', projectId:null, assetId:'asset-3', media:['new-photo.jpg'],
    }).expect(200);
    expect(result.body.duplicate).toBe(true);
    expect(result.body.defect.id).toBe('CIT-8842');
    expect(result.body.defect.duplicateCount).toBe(3);
    expect(result.body.defect.severity).toBe('Critical');
  });

  it('enforces the Maker–Checker–Authority payment chain', async () => {
    const maker = await login('usr-maker-1');
    const checker = await login('usr-checker-1');
    const authority = await login('usr-auth-1');
    const created = await request(app).post('/api/payments').set(auth(maker)).send({ projectId:'prj-1', invoiceNo:'NHAI/TEST/001', checkerId:'usr-checker-1', authorityId:'usr-auth-1', amount:100000, attendanceReference:'20 days · verified', inspectionReference:'INS-1140' }).expect(201);
    await request(app).post(`/api/payments/${created.body.id}/action`).set(auth(authority)).send({decision:'approve'}).expect(409);
    const verified = await request(app).post(`/api/payments/${created.body.id}/action`).set(auth(checker)).send({decision:'approve',note:'Verified'}).expect(200);
    expect(verified.body.status).toBe('Checker Verified');
    const approved = await request(app).post(`/api/payments/${created.body.id}/action`).set(auth(authority)).send({decision:'approve',note:'Authorised'}).expect(200);
    expect(approved.body.status).toBe('Authority Approved');
  });

  it('rejects cross-tenant project assignments and payment references', async () => {
    const authority = await login('usr-auth-1');
    const maker = await login('usr-maker-1');
    await request(app).post('/api/projects').set(auth(authority)).send({code:'NHAI/X/1',name:'Invalid cross tenant assignment',location:'Test corridor',assetType:'Highway Section',makerIds:['usr-maker-2'],checkerIds:['usr-checker-1'],center:{lat:23.1,lng:79.9},geofenceRadiusMeters:250}).expect(400);
    await request(app).post('/api/payments').set(auth(maker)).send({projectId:'prj-3',invoiceNo:'CROSS/TENANT/1',checkerId:'usr-checker-2',authorityId:'usr-auth-2',amount:1000,attendanceReference:'none',inspectionReference:'none'}).expect(403);
  });

  it('requires a Checker to validate citizen defects before Maker assignment', async () => {
    const maker = await login('usr-maker-2');
    const checker = await login('usr-checker-2');
    await request(app).post('/api/defects/CIT-8842/validate').set(auth(maker)).send({decision:'approve'}).expect(403);
    const result = await request(app).post('/api/defects/CIT-8842/validate').set(auth(checker)).send({decision:'approve',makerId:'usr-maker-2',projectId:'prj-3'}).expect(200);
    expect(result.body.checkerValidation).toBe('Approved');
    expect(result.body.status).toBe('Assigned');
  });

  it('computes attendance geofences on the server and ignores client claims', async () => {
    const maker = await login('usr-maker-1');
    const result = await request(app).post('/api/attendance').set(auth(maker)).send({
      projectId:'prj-1', lat:28.6139, lng:77.2090, accuracyMeters:7, withinGeofence:true,
    }).expect(201);
    expect(result.body.withinGeofence).toBe(false);
    expect(result.body.status).toBe('Out of radius');
  });

  it('syncs offline Maker attendance and still computes the geofence on the server', async () => {
    const maker = await login('usr-maker-1');
    const entityId = 'local-attendance-test';
    const synced = await request(app).post('/api/sync').set(auth(maker)).send({ operations:[{
      entityType:'Attendance', entityId, clientUpdatedAt:new Date().toISOString(),
      payload:{ projectId:'prj-1', lat:28.6139, lng:77.2090, accuracyMeters:9, offline:true, withinGeofence:true },
    }] }).expect(200);
    expect(synced.body.applied).toContain(entityId);
    const attendance = await request(app).get('/api/attendance').set(auth(maker)).expect(200);
    const record = attendance.body.find((item:{projectId:string}) => item.projectId === 'prj-1');
    expect(record.withinGeofence).toBe(false);
    expect(record.status).toBe('Out of radius');
  });

  it('returns tenant-scoped GIS layers, assets, projects and defects', async () => {
    const authority = await login('usr-auth-1');
    const result = await request(app).get('/api/gis/overview').set(auth(authority)).expect(200);
    expect(result.body.provider).toBe('Mappls');
    expect(result.body.layers).toHaveLength(1);
    expect(result.body.layers[0].id).toBe('layer-nh44');
    expect(result.body.layers.every((item:{tenantId:string}) => item.tenantId === 'tenant-nhai')).toBe(true);
    expect(result.body.assets.every((item:{tenantId:string}) => item.tenantId === 'tenant-nhai')).toBe(true);
  });

  it('parses native KML uploads into validated GeoJSON before publishing', async () => {
    const authority = await login('usr-auth-1');
    const kml = `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><name>Native marker</name><ExtendedData><Data name="asset_id"><value>NATIVE-001</value></Data></ExtendedData><Point><coordinates>79.9341,23.1462,0</coordinates></Point></Placemark></Document></kml>`;
    const parsed = await request(app).post('/api/gis/parse-file').set(auth(authority))
      .set('content-type','application/octet-stream').set('x-file-name','native-field.kml')
      .send(Buffer.from(kml)).expect(200);
    expect(parsed.body.format).toBe('KML');
    expect(parsed.body.featureCollection.features).toHaveLength(1);
    expect(parsed.body.featureCollection.features[0].geometry.coordinates).toEqual([79.9341,23.1462,0]);
    expect(parsed.body.fields).toContain('asset_id');
  });

  it('imports versioned GIS features as assets and rolls a replacement back safely', async () => {
    const authority = await login('usr-auth-1');
    const base = {projectId:'prj-1',assetType:'Highway Section',layerName:'NH-44 field import',description:'Client review import',fileName:'nh44-section.kml',format:'KML',sourceIdField:'asset_id',nameField:'name',style:{color:'#104685',width:5,opacity:.8},warnings:[]};
    const first = await request(app).post('/api/gis/imports').set(auth(authority)).send({...base,featureCollection:{type:'FeatureCollection',features:[
      {type:'Feature',geometry:{type:'LineString',coordinates:[[79.90,23.12],[79.91,23.13]]},properties:{asset_id:'KML-001',name:'Section 001',surface:'Bituminous'}},
    ]}}).expect(201);
    expect(first.body.importJob.createdCount).toBe(1);
    const second = await request(app).post('/api/gis/imports').set(auth(authority)).send({...base,fileName:'nh44-section-v2.kml',replaceLayerId:first.body.layer.id,featureCollection:{type:'FeatureCollection',features:[
      {type:'Feature',geometry:{type:'LineString',coordinates:[[79.90,23.12],[79.92,23.14]]},properties:{asset_id:'KML-001',name:'Section 001 revised',surface:'Concrete'}},
      {type:'Feature',geometry:{type:'Point',coordinates:[79.93,23.15]},properties:{asset_id:'KML-002',name:'Section marker 002'}},
    ]}}).expect(201);
    expect(second.body.importJob.updatedCount).toBe(1);
    expect(second.body.importJob.createdCount).toBe(1);
    expect(second.body.layer.version).toBe(2);
    const imports = await request(app).get('/api/gis/imports').set(auth(authority)).expect(200);
    expect(imports.body[0].assetSnapshots).toBeUndefined();
    await request(app).post(`/api/gis/imports/${second.body.importJob.id}/rollback`).set(auth(authority)).send({}).expect(200);
    const assets = await request(app).get('/api/assets').set(auth(authority)).expect(200);
    expect(assets.body.find((asset:{sourceId?:string})=>asset.sourceId==='KML-001').name).toBe('Section 001');
    expect(assets.body.some((asset:{sourceId?:string})=>asset.sourceId==='KML-002')).toBe(false);
  });

  it('runs citizen validation, field rectification, ATR verification and citizen closure', async () => {
    const citizen = await login('usr-citizen-1');
    const maker = await login('usr-maker-2');
    const checker = await login('usr-checker-2');
    await request(app).post('/api/defects/CIT-8842/validate').set(auth(checker)).send({decision:'approve',makerId:'usr-maker-2',projectId:'prj-3'}).expect(200);
    await request(app).post('/api/defects/CIT-8842/start').set(auth(maker)).expect(200);
    const atr = await request(app).post('/api/defects/CIT-8842/atr').set(auth(maker)).send({summary:'Waterproofed the wall and replaced the damaged sealant.',media:['atr-waterproofing.jpg'],lat:28.6139,lng:77.2090,accuracyMeters:6}).expect(200);
    expect(atr.body.status).toBe('ATR Submitted');
    expect(atr.body.atr.lat).toBe(28.6139);
    const verified = await request(app).post('/api/defects/CIT-8842/verify-atr').set(auth(checker)).send({decision:'verify',note:'Site evidence and repair verified.'}).expect(200);
    expect(verified.body.status).toBe('Resolved');
    const closed = await request(app).post('/api/defects/CIT-8842/feedback').set(auth(citizen)).send({rating:5,comment:'The seepage has stopped.',reopen:false}).expect(200);
    expect(closed.body.status).toBe('Closed');
    expect(closed.body.feedback.rating).toBe(5);
  });

  it('queues stale offline edits for manual review instead of dropping them', async () => {
    const maker = await login('usr-maker-1');
    const result = await request(app).post('/api/sync').set(auth(maker)).send({operations:[{
      entityType:'Defect', entityId:'DEF-2287', clientUpdatedAt:'2020-01-01T00:00:00.000Z', payload:{status:'In Progress'},
    }]}).expect(200);
    expect(result.body.applied).toEqual([]);
    expect(result.body.conflicts).toHaveLength(1);
    expect(result.body.conflicts[0].status).toBe('Manual review');
    const conflicts = await request(app).get('/api/sync/conflicts').set(auth(maker)).expect(200);
    expect(conflicts.body).toHaveLength(1);
  });

  it('blocks field inspection completion while checklist items remain pending', async () => {
    const maker = await login('usr-maker-1');
    await request(app).patch('/api/inspections/INS-1140').set(auth(maker)).send({status:'Completed'}).expect(404);
    const completed = await request(app).patch('/api/inspections/INS-1140').set(auth(maker)).send({
      status:'Completed', checklist:[
        {item:'Expansion joints',status:'Pass'}, {item:'Deck surface',status:'Pass'},
        {item:'Bearings',status:'Pass'}, {item:'Parapets',status:'Flag',note:'Minor repair required'},
      ],
    }).expect(200);
    expect(completed.body.status).toBe('Completed');
    expect(completed.body.defectIds).toHaveLength(1);
    const defects = await request(app).get('/api/defects').set(auth(maker)).expect(200);
    const raised = defects.body.find((item:{sourceInspectionId?:string}) => item.sourceInspectionId === 'INS-1140');
    expect(raised).toMatchObject({
      sourceChecklistItem:'Parapets', projectId:'prj-1', assetId:'asset-1', makerId:'usr-maker-1', checkerId:'usr-checker-1', status:'Assigned',
    });
    await request(app).patch('/api/inspections/INS-1140').set(auth(maker)).send({status:'Completed'}).expect(200);
    const afterRepeat = await request(app).get('/api/defects').set(auth(maker)).expect(200);
    expect(afterRepeat.body.filter((item:{sourceInspectionId?:string}) => item.sourceInspectionId === 'INS-1140')).toHaveLength(1);
  });

  it('raises linked defects when an offline inspection completion syncs', async () => {
    const maker = await login('usr-maker-2');
    const synced = await request(app).post('/api/sync').set(auth(maker)).send({ operations:[{
      entityType:'Inspection', entityId:'INS-1138', clientUpdatedAt:new Date(Date.now()+60_000).toISOString(), payload:{
        status:'Completed', checklist:[
          {item:'Structural cracks',status:'Pass'}, {item:'Electrical wiring',status:'Pass'},
          {item:'Fire safety equipment',status:'Flag',note:'Two extinguishers expired'}, {item:'Roof waterproofing',status:'Pass'},
        ],
      },
    }] }).expect(200);
    expect(synced.body.applied).toContain('INS-1138');
    const defects = await request(app).get('/api/defects').set(auth(maker)).expect(200);
    const raised = defects.body.filter((item:{sourceInspectionId?:string}) => item.sourceInspectionId === 'INS-1138');
    expect(raised).toHaveLength(1);
    expect(raised[0]).toMatchObject({ sourceChecklistItem:'Fire safety equipment', makerId:'usr-maker-2', checkerId:'usr-checker-2' });
    const inspections = await request(app).get('/api/inspections').set(auth(maker)).expect(200);
    expect(inspections.body.find((item:{id:string}) => item.id === 'INS-1138').defectIds).toEqual([raised[0].id]);
  });

  it('returns scoped full records for native search drill-down', async () => {
    const authority = await login('usr-auth-1');
    const result = await request(app).get('/api/search?q=NH-44').set(auth(authority)).expect(200);
    expect(result.body.length).toBeGreaterThan(0);
    expect(result.body[0].record).toBeTruthy();
    expect(result.body[0].record.tenantId).toBe('tenant-nhai');
  });
});
