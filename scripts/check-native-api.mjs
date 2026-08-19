const base = process.env.IIMM_API_BASE_URL || 'https://mappls-dic-iimm.replit.app';

async function request(path, token, accept = 'application/json') {
  const response = await fetch(`${base}${path}`, {
    headers: { accept, ...(token ? { authorization: `Bearer ${token}` } : {}) },
  });
  if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
  return accept === 'text/csv' ? response.text() : response.json();
}

const users = await request('/api/demo-users');
if (!Array.isArray(users) || users.length < 5) throw new Error('Demo role directory is incomplete.');

const endpoints = {
  tenant_admin: ['/api/dashboard', '/api/tenants', '/api/users', '/api/notifications', '/api/activities'],
  authority: ['/api/dashboard', '/api/users', '/api/projects', '/api/assets', '/api/gis/layers', '/api/gis/imports', '/api/gis/overview', '/api/attendance', '/api/inspections', '/api/defects', '/api/payments', '/api/tickets', '/api/notifications', '/api/activities', '/api/sync/conflicts'],
  maker: ['/api/dashboard', '/api/projects', '/api/assets', '/api/gis/overview', '/api/attendance', '/api/inspections', '/api/defects', '/api/payments', '/api/tickets', '/api/notifications', '/api/sync/conflicts'],
  checker: ['/api/dashboard', '/api/projects', '/api/assets', '/api/gis/overview', '/api/attendance', '/api/inspections', '/api/defects', '/api/payments', '/api/tickets', '/api/notifications', '/api/activities', '/api/sync/conflicts'],
  citizen: ['/api/dashboard', '/api/defects', '/api/tickets', '/api/notifications'],
};

for (const role of Object.keys(endpoints)) {
  const user = users.find((item) => item.role === role);
  if (!user) throw new Error(`No demo account for ${role}.`);
  const response = await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId: user.id }),
  });
  if (!response.ok) throw new Error(`Login failed for ${role}: ${response.status}`);
  const session = await response.json();
  for (const endpoint of endpoints[role]) {
    const value = await request(endpoint, session.token);
    if (endpoint !== '/api/dashboard' && endpoint !== '/api/gis/overview' && !Array.isArray(value)) {
      throw new Error(`${role} ${endpoint} did not return a list.`);
    }
  }
  const reverse = await request('/api/mappls/reverse-geocode?lat=28.6139&lng=77.2090', session.token);
  if (!reverse.address) throw new Error(`${role} reverse geocoding returned no address.`);
  if (['tenant_admin', 'authority', 'checker'].includes(role)) {
    const csv = await request('/api/reports/defects.csv', session.token, 'text/csv');
    if (!csv.includes(',')) throw new Error(`${role} report export is not CSV.`);
  }
  console.log(`ok ${role}`);
}

console.log(`Native API contract healthy at ${base}`);
