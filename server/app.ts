import crypto from 'node:crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import { z, ZodError } from 'zod';
import type { Defect, HelpdeskTicket, Inspection, Payment, Role, StoreData, User } from '../shared/types.js';
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

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '2mb' }));

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
    const body = z.object({ name:z.string().min(3), shortName:z.string().min(2).max(12), type:z.string().min(3), hierarchy:z.string().min(3), modules:z.array(z.string()).min(2), assetTypes:z.array(z.object({ name:z.string(), attributes:z.array(z.string()), checklist:z.array(z.string()) })), dataMigration:z.boolean().default(false) }).parse(req.body);
    const tenant = await store.mutate((data) => {
      const created = { id:id('tenant'), name:body.name, shortName:body.shortName, type:body.type, hierarchy:body.hierarchy, status:'Provisioning' as const, modules:Array.from(new Set(['Access & Onboarding','Project Management',...body.modules])), assetTypes:body.assetTypes.map((a) => ({ ...a, id:id('at') })), slas:{Critical:24,High:72,Medium:168,Low:360}, dataMigration:body.dataMigration, primaryColor:'#104685', users:0 };
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

  app.get('/api/projects', auth, async (req, res) => res.json(tenantScope((await store.all()).projects, req.user!)));
  app.post('/api/projects', auth, allow('authority'), async (req, res) => {
    const body = z.object({ code:z.string().min(3), name:z.string().min(3), location:z.string().min(3), assetType:z.string().min(2), makerIds:z.array(z.string()).default([]), checkerIds:z.array(z.string()).default([]) }).parse(req.body);
    const created = await store.mutate((data) => {
      const project = { id:id('prj'), tenantId:req.user!.tenantId!, ...body, status:'Pending' as const, progress:0, milestones:[] };
      data.projects.unshift(project);
      return project;
    });
    await log(req.user!, 'CREATED_PROJECT', 'Project', created.id, `Created ${created.code} · ${created.name}.`);
    res.status(201).json(created);
  });

  app.get('/api/assets', auth, async (req, res) => res.json(tenantScope((await store.all()).assets, req.user!)));
  app.post('/api/assets', auth, allow('authority'), async (req, res) => {
    const body = z.object({ projectId:z.string(), type:z.string(), name:z.string().min(3), location:z.string(), condition:z.enum(['Good','Fair','Attention','Critical']), attributes:z.record(z.string()).default({}) }).parse(req.body);
    const created = await store.mutate((data) => {
      const asset = { id:id('asset'), tenantId:req.user!.tenantId!, ...body, lastInspected:'Not inspected' };
      data.assets.unshift(asset);
      return asset;
    });
    await log(req.user!, 'REGISTERED_ASSET', 'Asset', created.id, `Registered ${created.name}.`);
    res.status(201).json(created);
  });

  app.get('/api/attendance', auth, async (req, res) => res.json(tenantScope((await store.all()).attendance, req.user!)));
  app.post('/api/attendance', auth, allow('maker'), async (req, res) => {
    const body = z.object({ projectId:z.string(), lat:z.number(), lng:z.number(), withinGeofence:z.boolean(), offline:z.boolean().default(false) }).parse(req.body);
    const today = new Date().toISOString().slice(0,10);
    const created = await store.mutate((data) => {
      const existing = data.attendance.find((a) => a.makerId === req.user!.id && a.projectId === body.projectId && a.date === today);
      if (existing) return existing;
      const record = { id:id('att'), tenantId:req.user!.tenantId!, projectId:body.projectId, makerId:req.user!.id, date:today, checkIn:new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:false}), checkOut:null, lat:body.lat, lng:body.lng, withinGeofence:body.withinGeofence, status:(body.offline ? 'Pending sync' : body.withinGeofence ? 'Present' : 'Out of radius') as 'Pending sync'|'Present'|'Out of radius' };
      data.attendance.unshift(record);
      return record;
    });
    await log(req.user!, 'MARKED_ATTENDANCE', 'Attendance', created.id, `${created.status} at ${created.lat.toFixed(4)}, ${created.lng.toFixed(4)}.`);
    res.status(201).json(created);
  });

  app.get('/api/inspections', auth, async (req, res) => res.json(tenantScope((await store.all()).inspections, req.user!)));
  app.post('/api/inspections', auth, allow('authority','maker','checker'), async (req, res) => {
    const body = z.object({ projectId:z.string(), assetId:z.string(), type:z.enum(['Joint','Requested']), makerId:z.string(), checkerId:z.string(), scheduledAt:z.string().datetime(), checklist:z.array(z.string()) }).parse(req.body);
    const created = await store.mutate((data) => {
      const inspection: Inspection = { id:`INS-${Math.floor(1000 + Math.random()*9000)}`, tenantId:req.user!.tenantId!, ...body, status:'Scheduled', checklist:body.checklist.map((item) => ({ item,status:'Pending' })), offlineState:'Synced' };
      data.inspections.unshift(inspection);
      return inspection;
    });
    await log(req.user!, 'SCHEDULED_INSPECTION', 'Inspection', created.id, `${created.type} inspection scheduled.`);
    res.status(201).json(created);
  });
  app.patch('/api/inspections/:id', auth, allow('maker','checker','authority'), async (req, res) => {
    const body = z.object({ status:z.enum(['Accepted','Rejected','Not Ready','In Progress','Paused','Completed']).optional(), checklist:z.array(z.object({ item:z.string(), status:z.enum(['Pending','Pass','Flag']), note:z.string().optional() })).optional(), offlineState:z.enum(['Synced','Queued','Conflict review']).optional() }).parse(req.body);
    const updated = await store.mutate((data) => {
      const item = data.inspections.find((i) => i.id === req.params.id && i.tenantId === req.user!.tenantId);
      if (!item) return null;
      Object.assign(item, body);
      return item;
    });
    if (!updated) return res.status(404).json({ error:'Inspection not found' });
    await log(req.user!, 'UPDATED_INSPECTION', 'Inspection', updated.id, `Inspection moved to ${updated.status}.`);
    res.json(updated);
  });

  app.get('/api/defects', auth, async (req, res) => res.json(visibleToUser((await store.all()).defects, req.user!)));
  app.post('/api/defects', auth, async (req, res) => {
    const body = z.object({ title:z.string().min(4), description:z.string().min(8), location:z.string().min(3), lat:z.number(), lng:z.number(), severity:z.enum(['Critical','High','Medium','Low']).default('Medium'), projectId:z.string().nullable().default(null), assetId:z.string().nullable().default(null), media:z.array(z.string()).default([]) }).parse(req.body);
    const data = await store.all();
    const source = req.user!.role === 'citizen' ? 'Citizen' : 'Internal';
    if (source === 'Citizen') {
      const duplicate = data.defects.find((d) => d.tenantId === req.user!.tenantId && activeStatuses.has(d.status) && ((body.assetId && d.assetId === body.assetId) || Math.hypot(d.lat-body.lat,d.lng-body.lng) < 0.003));
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
      const defect: Defect = { id:`${source === 'Citizen' ? 'CIT':'DEF'}-${Math.floor(1000+Math.random()*9000)}`, tenantId:req.user!.tenantId!, projectId:body.projectId, assetId:body.assetId, source, reporterId:req.user!.id, title:body.title, description:body.description, location:body.location, lat:body.lat, lng:body.lng, severity:body.severity, status:source === 'Citizen' ? 'Under Checker Review':'Assigned', checkerValidation:source === 'Citizen' ? 'Pending':'Not required', makerId:source === 'Citizen' ? null : req.user!.role === 'maker' ? req.user!.id : null, checkerId:checker?.id ?? null, duplicateOf:null, duplicateCount:0, createdAt:new Date().toISOString(), dueAt:new Date(Date.now()+dueHours*3_600_000).toISOString(), media:body.media };
      state.defects.unshift(defect);
      return defect;
    });
    await log(req.user!, 'REPORTED_DEFECT', 'Defect', created.id, `${created.source} defect created with ${created.severity} severity.`);
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
      }
      return defect;
    });
    if (!updated) return res.status(409).json({ error:'Defect is not awaiting validation.' });
    await log(req.user!, body.decision === 'approve' ? 'VALIDATED_CITIZEN_DEFECT':'REJECTED_CITIZEN_DEFECT', 'Defect', updated.id, `Checker ${body.decision}d citizen submission.`);
    res.json(updated);
  });
  app.post('/api/defects/:id/atr', auth, allow('maker'), async (req, res) => {
    const body = z.object({ summary:z.string().min(10) }).parse(req.body);
    const updated = await store.mutate((data) => {
      const defect = data.defects.find((d) => d.id === req.params.id && d.makerId === req.user!.id && ['Assigned','In Progress','Reopened'].includes(d.status));
      if (!defect) return null;
      defect.atr = { summary:body.summary, submittedAt:new Date().toISOString() };
      defect.status = 'ATR Submitted';
      return defect;
    });
    if (!updated) return res.status(409).json({ error:'This defect cannot accept an ATR from this Maker.' });
    await log(req.user!, 'SUBMITTED_ATR', 'Defect', updated.id, body.summary);
    res.json(updated);
  });
  app.post('/api/defects/:id/verify-atr', auth, allow('checker'), async (req, res) => {
    const body = z.object({ decision:z.enum(['verify','rework']) }).parse(req.body);
    const updated = await store.mutate((data) => {
      const defect = data.defects.find((d) => d.id === req.params.id && d.checkerId === req.user!.id && d.status === 'ATR Submitted' && d.atr);
      if (!defect) return null;
      defect.status = body.decision === 'verify' ? 'Resolved':'Reopened';
      if (body.decision === 'verify') defect.atr!.verifiedAt = new Date().toISOString();
      return defect;
    });
    if (!updated) return res.status(409).json({ error:'ATR is not ready for verification.' });
    await log(req.user!, body.decision === 'verify' ? 'VERIFIED_ATR':'RETURNED_ATR', 'Defect', updated.id, `Checker decision: ${body.decision}.`);
    res.json(updated);
  });

  app.get('/api/payments', auth, async (req, res) => res.json(tenantScope((await store.all()).payments, req.user!)));
  app.post('/api/payments', auth, allow('maker'), async (req, res) => {
    const body = z.object({ projectId:z.string(), invoiceNo:z.string().min(4), checkerId:z.string(), authorityId:z.string(), amount:z.number().positive(), attendanceReference:z.string(), inspectionReference:z.string() }).parse(req.body);
    const created = await store.mutate((data) => {
      const payment: Payment = { id:`PAY-${Math.floor(1000+Math.random()*9000)}`, tenantId:req.user!.tenantId!, makerId:req.user!.id, ...body, status:'Submitted', submittedAt:new Date().toISOString() };
      data.payments.unshift(payment);
      return payment;
    });
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

  app.get('/api/search', auth, async (req, res) => {
    const query = String(req.query.q ?? '').trim().toLowerCase();
    if (query.length < 2) return res.json([]);
    const data = await store.all();
    const result = [
      ...tenantScope(data.projects, req.user!).map((p) => ({ type:'Project', id:p.id, title:p.name, subtitle:`${p.code} · ${p.location}` })),
      ...tenantScope(data.assets, req.user!).map((a) => ({ type:'Asset', id:a.id, title:a.name, subtitle:`${a.type} · ${a.location}` })),
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
