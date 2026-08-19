import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { store } from './store.js';

const app = createApp();

async function login(userId:string) {
  const response = await request(app).post('/api/auth/login').send({ userId }).expect(200);
  return response.body.token as string;
}

const auth = (token:string) => ({ Authorization:`Bearer ${token}` });

describe('IIMM API', () => {
  beforeEach(async () => { await store.reset(); });

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

  it('returns tenant-scoped GIS layers, assets, projects and defects', async () => {
    const authority = await login('usr-auth-1');
    const result = await request(app).get('/api/gis/overview').set(auth(authority)).expect(200);
    expect(result.body.provider).toBe('Mappls');
    expect(result.body.layers).toHaveLength(1);
    expect(result.body.layers[0].id).toBe('layer-nh44');
    expect(result.body.layers.every((item:{tenantId:string}) => item.tenantId === 'tenant-nhai')).toBe(true);
    expect(result.body.assets.every((item:{tenantId:string}) => item.tenantId === 'tenant-nhai')).toBe(true);
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
  });
});
