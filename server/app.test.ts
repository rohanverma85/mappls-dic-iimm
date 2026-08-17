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

  it('requires a Checker to validate citizen defects before Maker assignment', async () => {
    const maker = await login('usr-maker-2');
    const checker = await login('usr-checker-2');
    await request(app).post('/api/defects/CIT-8842/validate').set(auth(maker)).send({decision:'approve'}).expect(403);
    const result = await request(app).post('/api/defects/CIT-8842/validate').set(auth(checker)).send({decision:'approve',makerId:'usr-maker-2',projectId:'prj-3'}).expect(200);
    expect(result.body.checkerValidation).toBe('Approved');
    expect(result.body.status).toBe('Assigned');
  });
});
