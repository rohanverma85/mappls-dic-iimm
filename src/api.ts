import type { Session } from '../shared/types';

const SESSION_KEY = 'iimm-session';

export function getStoredSession(): Session | null {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null') as Session | null; }
  catch { return null; }
}

export function storeSession(session: Session | null) {
  if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else localStorage.removeItem(SESSION_KEY);
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const session = getStoredSession();
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(session ? { authorization: `Bearer ${session.token}` } : {}),
      ...options.headers,
    },
  });
  const isJson = response.headers.get('content-type')?.includes('json');
  const payload = isJson ? await response.json() : await response.text();
  if (!response.ok) throw new Error(typeof payload === 'object' && payload?.error ? payload.error : `Request failed (${response.status})`);
  return payload as T;
}

export const post = <T>(path: string, body: unknown) => api<T>(path, { method:'POST', body:JSON.stringify(body) });
export const patch = <T>(path: string, body: unknown) => api<T>(path, { method:'PATCH', body:JSON.stringify(body) });
