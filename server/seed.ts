import type { StoreData } from '../shared/types.js';

const now = new Date('2026-08-17T10:00:00.000Z');
const iso = (offsetHours = 0) => new Date(now.getTime() + offsetHours * 3_600_000).toISOString();

export const seedData: StoreData = {
  users: [
    { id: 'usr-ta-1', name: 'Aarav Verma', email: 'aarav.verma@digitalindia.gov.in', mobile: '+91 98100 22001', role: 'tenant_admin', tenantId: null, designation: 'Platform Operations Lead', active: true },
    { id: 'usr-auth-1', name: 'Ashok Sharma', email: 'ashok.sharma@nhai.gov.in', mobile: '+91 98200 41042', role: 'authority', tenantId: 'tenant-nhai', designation: 'Super Admin · HQ', active: true },
    { id: 'usr-auth-2', name: 'Meera Iyer', email: 'meera.iyer@pwd.gov.in', mobile: '+91 98200 41043', role: 'authority', tenantId: 'tenant-pwd', designation: 'Chief Engineer', active: true },
    { id: 'usr-maker-1', name: 'Ramesh Yadav', email: 'ramesh@ltinfra.example', mobile: '+91 98200 41044', role: 'maker', tenantId: 'tenant-nhai', designation: 'Site Engineer', active: true },
    { id: 'usr-maker-2', name: 'Suresh Menon', email: 'suresh@urbanworks.example', mobile: '+91 98200 41045', role: 'maker', tenantId: 'tenant-pwd', designation: 'Maintenance Engineer', active: true },
    { id: 'usr-checker-1', name: 'Priya Nair', email: 'priya@apexconsult.example', mobile: '+91 98200 41046', role: 'checker', tenantId: 'tenant-nhai', designation: 'Quality Engineer', active: true },
    { id: 'usr-checker-2', name: 'Kavita Iyer', email: 'kavita@inspection.example', mobile: '+91 98200 41047', role: 'checker', tenantId: 'tenant-pwd', designation: 'Third-party Inspector', active: true },
    { id: 'usr-citizen-1', name: 'Neha Singh', email: '', mobile: '+91 98200 41048', role: 'citizen', tenantId: 'tenant-pwd', designation: 'Citizen', active: true },
  ],
  tenants: [
    {
      id: 'tenant-nhai', name: 'National Highways Authority of India', shortName: 'NHAI', type: 'National Highway Authority', hierarchy: 'HQ → 25 Regional Offices → 210 Project Units', status: 'Live',
      modules: ['Access & Onboarding','Project Management','Asset Management','Attendance','Inspections','Defect Management','Payments','Helpdesk','Citizen App','Dashboards & Reports','Notifications','Activity Log','Search'],
      assetTypes: [
        { id: 'at-road', name: 'Highway Section', attributes: ['Chainage','Lane count','Surface type'], checklist: ['Surface condition','Lane markings','Crash barriers','Drainage'] },
        { id: 'at-toll', name: 'Toll Plaza', attributes: ['Lane capacity','Operator'], checklist: ['Lane equipment','Canopy structure','Safety signage'] },
        { id: 'at-bridge', name: 'Bridge / Culvert', attributes: ['Span','Structure type'], checklist: ['Expansion joints','Deck surface','Bearings','Parapets'] },
      ],
      slas: { Critical: 24, High: 72, Medium: 168, Low: 360 }, dataMigration: true, primaryColor: '#104685', users: 2140,
    },
    {
      id: 'tenant-pwd', name: 'State Public Works Department', shortName: 'PWD', type: 'Buildings & Roads Department', hierarchy: 'HQ → 4 Zones → 14 Divisions → 82 Offices', status: 'Live',
      modules: ['Access & Onboarding','Project Management','Asset Management','Attendance','Inspections','Defect Management','Payments','Helpdesk','Citizen App','Dashboards & Reports'],
      assetTypes: [
        { id: 'at-building', name: 'Municipal Building', attributes: ['Year built','Floor count','Occupancy'], checklist: ['Structural cracks','Electrical wiring','Fire safety equipment','Roof waterproofing'] },
        { id: 'at-district-road', name: 'District Road', attributes: ['Length','Width','Surface type'], checklist: ['Surface condition','Shoulders','Drainage','Signage'] },
        { id: 'at-pump', name: 'Pump Station', attributes: ['Capacity','Pump count'], checklist: ['Motor condition','Leakage','Control panel','Safety'] },
      ],
      slas: { Critical: 24, High: 72, Medium: 168, Low: 360 }, dataMigration: false, primaryColor: '#8a38f5', users: 640,
    },
    {
      id: 'tenant-smc', name: 'Sunrise Municipal Corporation', shortName: 'SMC', type: 'Urban Local Body', hierarchy: 'HQ → 4 Zones → 14 Ward Offices', status: 'Provisioning',
      modules: ['Access & Onboarding','Project Management','Asset Management','Attendance','Inspections','Defect Management','Helpdesk','Citizen App','Dashboards & Reports'],
      assetTypes: [
        { id: 'at-light', name: 'Streetlight', attributes: ['Pole type','Wattage','Feeder'], checklist: ['Luminaire','Pole stability','Wiring','Timer'] },
        { id: 'at-drain', name: 'Drain', attributes: ['Width','Depth','Construction'], checklist: ['Blockage','Silt level','Cover condition'] },
      ],
      slas: { Critical: 12, High: 48, Medium: 120, Low: 240 }, dataMigration: false, primaryColor: '#008751', users: 0,
    },
    {
      id: 'tenant-water', name: 'State Water Board', shortName: 'SWB', type: 'Water & Sanitation Utility', hierarchy: 'Pending configuration', status: 'Requested', modules: ['Access & Onboarding','Project Management'], assetTypes: [], slas: { Critical: 12, High: 48, Medium: 120, Low: 240 }, dataMigration: false, primaryColor: '#1291d0', users: 0,
    },
  ],
  projects: [
    { id: 'prj-1', tenantId: 'tenant-nhai', code: 'NHAI/2026/001', name: 'NH-44 Widening · Jhansi to Lakhnadon', location: 'NH-44, Uttar Pradesh–Madhya Pradesh', assetType: 'Highway Section', status: 'Active', progress: 78, makerIds: ['usr-maker-1'], checkerIds: ['usr-checker-1'], milestones: [{ name:'Land acquisition & clearance', due:'2026-02-28', done:true },{ name:'Earthwork & pavement · Phase 1', due:'2026-10-31', done:false },{ name:'Structures & bridges', due:'2027-03-31', done:false }], center:{lat:23.1462,lng:79.9341}, geofenceRadiusMeters:500, documents:[{id:'doc-1',name:'Detailed Project Report.pdf',category:'DPR',uploadedAt:iso(-720)},{id:'doc-2',name:'Environmental Clearance.pdf',category:'Clearance',uploadedAt:iso(-600)}] },
    { id: 'prj-2', tenantId: 'tenant-nhai', code: 'NHAI/2026/002', name: 'NH-48 Safety Upgrade', location: 'NH-48, Rajasthan', assetType: 'Highway Section', status: 'Pending', progress: 34, makerIds: ['usr-maker-1'], checkerIds: ['usr-checker-1'], milestones: [{ name:'Safety audit', due:'2026-08-30', done:false }], center:{lat:26.9124,lng:75.7873}, geofenceRadiusMeters:750, documents:[] },
    { id: 'prj-3', tenantId: 'tenant-pwd', code: 'PWD/2026/014', name: 'Ward 7 Civic Assets Renewal', location: 'Ward 7 · Central', assetType: 'Municipal Building', status: 'Active', progress: 62, makerIds: ['usr-maker-2'], checkerIds: ['usr-checker-2'], milestones: [{ name:'Condition survey', due:'2026-06-15', done:true },{ name:'Priority repairs', due:'2026-09-30', done:false }], center:{lat:28.6139,lng:77.2090}, geofenceRadiusMeters:250, documents:[{id:'doc-3',name:'Ward 7 Condition Survey.pdf',category:'Survey',uploadedAt:iso(-240)}] },
    { id: 'prj-4', tenantId: 'tenant-pwd', code: 'PWD/2026/019', name: 'Station Road Rehabilitation', location: 'Ward 3 · Riverside', assetType: 'District Road', status: 'Overdue', progress: 41, makerIds: ['usr-maker-2'], checkerIds: ['usr-checker-2'], milestones: [{ name:'Drainage works', due:'2026-08-10', done:false }], center:{lat:28.6145,lng:77.2101}, geofenceRadiusMeters:350, documents:[] },
  ],
  assets: [
    { id:'asset-1', tenantId:'tenant-nhai', projectId:'prj-1', type:'Bridge / Culvert', name:'NH-44 Km 82 · Bridge deck', location:'23.1462, 79.9341', condition:'Fair', attributes:{ Span:'86 m','Structure type':'PSC Girder' }, lastInspected:'2026-08-12', geometry:{type:'Point',coordinates:[79.9341,23.1462]}, layerId:'layer-nh44' },
    { id:'asset-2', tenantId:'tenant-nhai', projectId:'prj-1', type:'Highway Section', name:'NH-44 Km 72–88', location:'Jhansi–Lakhnadon corridor', condition:'Good', attributes:{ Chainage:'72–88 km','Lane count':'4','Surface type':'Bituminous' }, lastInspected:'2026-08-10', geometry:{type:'LineString',coordinates:[[79.9020,23.1210],[79.9180,23.1340],[79.9341,23.1462],[79.9510,23.1580],[79.9690,23.1710]]}, layerId:'layer-nh44' },
    { id:'asset-3', tenantId:'tenant-pwd', projectId:'prj-3', type:'Municipal Building', name:'Ward 7 Administrative Office', location:'Ward 7 · Central', condition:'Attention', attributes:{ 'Year built':'1998','Floor count':'4', Occupancy:'Office' }, lastInspected:'2026-08-16', geometry:{type:'Polygon',coordinates:[[[77.2086,28.6136],[77.2094,28.6136],[77.2094,28.6142],[77.2086,28.6142],[77.2086,28.6136]]]}, layerId:'layer-pwd-network' },
    { id:'asset-4', tenantId:'tenant-pwd', projectId:'prj-4', type:'District Road', name:'Station Road', location:'Ward 3 · Riverside', condition:'Critical', attributes:{ Length:'3.2 km', Width:'9 m','Surface type':'Bituminous' }, lastInspected:'2026-08-12', geometry:{type:'LineString',coordinates:[[77.2028,28.6101],[77.2064,28.6124],[77.2101,28.6145],[77.2143,28.6170],[77.2182,28.6194]]}, layerId:'layer-pwd-network' },
  ],
  attendance: [
    { id:'att-1', tenantId:'tenant-nhai', projectId:'prj-1', makerId:'usr-maker-1', date:'2026-08-17', checkIn:'09:02', checkOut:null, lat:23.1462, lng:79.9341, withinGeofence:true, status:'Present' },
    { id:'att-2', tenantId:'tenant-pwd', projectId:'prj-3', makerId:'usr-maker-2', date:'2026-08-17', checkIn:'08:58', checkOut:'18:05', lat:28.6139, lng:77.2090, withinGeofence:true, status:'Present' },
  ],
  inspections: [
    { id:'INS-1140', tenantId:'tenant-nhai', projectId:'prj-1', assetId:'asset-1', type:'Joint', makerId:'usr-maker-1', checkerId:'usr-checker-1', scheduledAt:'2026-08-18T05:30:00.000Z', status:'Scheduled', checklist:[{item:'Expansion joints',status:'Pending'},{item:'Deck surface',status:'Pending'},{item:'Bearings',status:'Pending'},{item:'Parapets',status:'Pending'}], offlineState:'Synced' },
    { id:'INS-1138', tenantId:'tenant-pwd', projectId:'prj-3', assetId:'asset-3', type:'Requested', makerId:'usr-maker-2', checkerId:'usr-checker-2', scheduledAt:'2026-08-16T05:30:00.000Z', status:'Accepted', checklist:[{item:'Structural cracks',status:'Pass'},{item:'Electrical wiring',status:'Pass'},{item:'Fire safety equipment',status:'Flag',note:'Two extinguishers expired'},{item:'Roof waterproofing',status:'Pass'}], offlineState:'Synced' },
  ],
  defects: [
    { id:'CIT-8842', tenantId:'tenant-pwd', projectId:null, assetId:'asset-3', source:'Citizen', reporterId:'usr-citizen-1', title:'Water seepage near public records room', description:'Water marks and active seepage after rain.', location:'Municipal Building · Ward 7 office', lat:28.6139, lng:77.2090, severity:'High', status:'Under Checker Review', checkerValidation:'Pending', makerId:null, checkerId:'usr-checker-2', duplicateOf:null, duplicateCount:2, createdAt:iso(-2), dueAt:iso(70), media:['photo-ward7-seepage.jpg'], geofence:{within:true,distanceMeters:0,radiusMeters:75,sourceType:'Asset',sourceId:'asset-3'}, locationAccuracyMeters:8 },
    { id:'CIT-8839', tenantId:'tenant-pwd', projectId:null, assetId:'asset-4', source:'Citizen', reporterId:'usr-citizen-1', title:'Deep pothole close to school crossing', description:'Pothole creates a hazard during peak hours.', location:'District Road · MG Road, Ward 3', lat:28.6145, lng:77.2101, severity:'Medium', status:'Under Checker Review', checkerValidation:'Pending', makerId:null, checkerId:'usr-checker-2', duplicateOf:null, duplicateCount:1, createdAt:iso(-5), dueAt:iso(163), media:['photo-pothole.jpg'], geofence:{within:true,distanceMeters:0,radiusMeters:100,sourceType:'Asset',sourceId:'asset-4'}, locationAccuracyMeters:11 },
    { id:'DEF-2291', tenantId:'tenant-pwd', projectId:'prj-3', assetId:'asset-3', source:'Internal', reporterId:'usr-checker-2', title:'Fire safety equipment expired', description:'Two extinguishers require replacement.', location:'Municipal Building · Block C corridor', lat:28.6139, lng:77.2090, severity:'Medium', status:'ATR Submitted', checkerValidation:'Not required', makerId:'usr-maker-2', checkerId:'usr-checker-2', duplicateOf:null, duplicateCount:0, createdAt:iso(-96), dueAt:iso(72), media:[], geofence:{within:true,distanceMeters:0,radiusMeters:75,sourceType:'Asset',sourceId:'asset-3'}, locationAccuracyMeters:6, atr:{summary:'Replaced both extinguishers and updated service labels.',submittedAt:iso(-4),media:['atr-fire-safety.jpg'],lat:28.6139,lng:77.2090,accuracyMeters:7} },
    { id:'DEF-2287', tenantId:'tenant-nhai', projectId:'prj-1', assetId:'asset-1', source:'Internal', reporterId:'usr-auth-1', title:'Bridge expansion joint wear', description:'Joint seal is visibly degraded on east lane.', location:'NH-44 Km 82 · Bridge deck', lat:23.1462, lng:79.9341, severity:'High', status:'Assigned', checkerValidation:'Not required', makerId:'usr-maker-1', checkerId:'usr-checker-1', duplicateOf:null, duplicateCount:0, createdAt:iso(-40), dueAt:iso(32), media:['bridge-joint.jpg'], geofence:{within:true,distanceMeters:0,radiusMeters:75,sourceType:'Asset',sourceId:'asset-1'}, locationAccuracyMeters:9 },
  ],
  payments: [
    { id:'PAY-0341', tenantId:'tenant-pwd', projectId:'prj-3', invoiceNo:'PWD/INV/2026/0341', makerId:'usr-maker-2', checkerId:'usr-checker-2', authorityId:'usr-auth-2', amount:482600, attendanceReference:'22 days · verified', inspectionReference:'ATR-3391 · verified', status:'Checker Verified', submittedAt:iso(-28), checkerNote:'Claim matches attendance and ATR records; no deductions applicable.' },
    { id:'PAY-0927', tenantId:'tenant-nhai', projectId:'prj-1', invoiceNo:'NHAI/INV/2026/0927', makerId:'usr-maker-1', checkerId:'usr-checker-1', authorityId:'usr-auth-1', amount:1248500, attendanceReference:'24 days · verified', inspectionReference:'INS-1122 · completed', status:'Submitted', submittedAt:iso(-8) },
  ],
  tickets: [
    { id:'HD-4471', tenantId:'tenant-pwd', raisedBy:'usr-citizen-1', category:'Citizen App', priority:'Medium', subject:'Unable to upload photo while reporting issue', description:'Upload stalls on a low network connection.', status:'Open', createdAt:iso(-12), dueAt:iso(60) },
    { id:'HD-4459', tenantId:'tenant-nhai', raisedBy:'usr-maker-1', category:'Payments', priority:'High', subject:'Payment not reflecting after Authority approval', description:'Approved claim is not visible in disbursement list.', status:'In Progress', createdAt:iso(-40), dueAt:iso(8) },
  ],
  notifications: [
    { id:'not-1', userId:'usr-auth-2', title:'Payment awaiting approval', message:'PAY-0341 was verified by Checker and requires final authorisation.', createdAt:iso(-1), read:false, kind:'approval' },
    { id:'not-2', userId:'usr-checker-2', title:'Citizen defect validation', message:'CIT-8842 may duplicate an open issue nearby. Review before assignment.', createdAt:iso(-2), read:false, kind:'assignment' },
    { id:'not-3', userId:'usr-maker-1', title:'Defect assigned', message:'DEF-2287 requires an Action Taken Report within the High-severity SLA.', createdAt:iso(-16), read:false, kind:'sla' },
    { id:'not-4', userId:'usr-citizen-1', title:'Report under review', message:'Your report CIT-8842 is with the Checker for validation.', createdAt:iso(-2), read:true, kind:'status' },
  ],
  activities: [
    { id:'act-1', tenantId:'tenant-pwd', actorId:'usr-checker-2', actorRole:'checker', action:'VERIFIED_PAYMENT', entityType:'Payment', entityId:'PAY-0341', timestamp:iso(-1), detail:'Verified against attendance and ATR records.' },
    { id:'act-2', tenantId:'tenant-pwd', actorId:'usr-citizen-1', actorRole:'citizen', action:'REPORTED_ISSUE', entityType:'Defect', entityId:'CIT-8842', timestamp:iso(-2), detail:'Citizen issue submitted with geo-tagged media.' },
    { id:'act-3', tenantId:'tenant-nhai', actorId:'usr-auth-1', actorRole:'authority', action:'ASSIGNED_DEFECT', entityType:'Defect', entityId:'DEF-2287', timestamp:iso(-16), detail:'Assigned expansion-joint repair to Maker.' },
    { id:'act-4', tenantId:null, actorId:'usr-ta-1', actorRole:'tenant_admin', action:'TENANT_DATA_ACCESS', entityType:'Tenant', entityId:'tenant-pwd', timestamp:iso(-24), detail:'Support ticket HD-4471 · defect SLA investigation.' },
  ],
  gisLayers: [
    { id:'layer-nh44', tenantId:'tenant-nhai', projectId:'prj-1', name:'NH-44 project network', description:'Authoritative project corridor and bridge locations for defect and inspection context.', source:'Mappls mGIS', geometryType:'Mixed', status:'Published', version:3, visible:true, style:{color:'#104685',width:5,opacity:0.82}, createdAt:iso(-1440), updatedAt:iso(-48), featureCollection:{type:'FeatureCollection',features:[
      {type:'Feature',id:'network-nh44',geometry:{type:'LineString',coordinates:[[79.9020,23.1210],[79.9180,23.1340],[79.9341,23.1462],[79.9510,23.1580],[79.9690,23.1710]]},properties:{name:'NH-44 · Chainage 72–88',assetType:'Highway Section',chainageFrom:72,chainageTo:88}},
      {type:'Feature',id:'bridge-82',geometry:{type:'Point',coordinates:[79.9341,23.1462]},properties:{name:'Bridge deck · Km 82',assetId:'asset-1'}},
    ]}},
    { id:'layer-pwd-network', tenantId:'tenant-pwd', projectId:null, name:'PWD civic asset network', description:'Ward buildings and district-road network used as the underlying operational layer.', source:'Mappls mGIS', geometryType:'Mixed', status:'Published', version:5, visible:true, style:{color:'#8a38f5',width:5,opacity:0.78}, createdAt:iso(-2160), updatedAt:iso(-12), featureCollection:{type:'FeatureCollection',features:[
      {type:'Feature',id:'ward7-office',geometry:{type:'Polygon',coordinates:[[[77.2086,28.6136],[77.2094,28.6136],[77.2094,28.6142],[77.2086,28.6142],[77.2086,28.6136]]]},properties:{name:'Ward 7 Administrative Office',assetId:'asset-3'}},
      {type:'Feature',id:'station-road',geometry:{type:'LineString',coordinates:[[77.2028,28.6101],[77.2064,28.6124],[77.2101,28.6145],[77.2143,28.6170],[77.2182,28.6194]]},properties:{name:'Station Road',assetId:'asset-4',surface:'Bituminous'}},
    ]}},
  ],
  syncConflicts: [],
};
