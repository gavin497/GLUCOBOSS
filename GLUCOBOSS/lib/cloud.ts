'use client';

export type TimelineItem = {
  id: string;
  kind: 'insulin' | 'food';
  value: number;
  time: string;
  icon: string;
  title: string;
  detail: string;
  createdAt?: string;
  occurredAt?: string;
  foodDetails?: string;
};

type AuthResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user?: { email?: string };
};
type StoredSession = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  email: string;
};
type DbLog = {
  id: string; kind: 'insulin' | 'food'; value: number | string; time: string;
  icon: string; title: string; detail: string; food_details: string | null;
  occurred_at: string; created_at: string;
};

const SESSION_KEY = 'glucoboss-family-session-v1';
const LOG_STORAGE_KEY = 'glucoboss-manual-logs-v1';
const MIGRATION_KEY = 'glucoboss-cloud-imported-v1';
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';

function config() {
  if (!URL || !KEY) throw new Error('Cloud connection has not been configured.');
}
function readSession(): StoredSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null') as StoredSession | null;
    return s && s.access_token && s.refresh_token ? s : null;
  } catch { return null; }
}
function saveSession(data: AuthResponse, email: string) {
  const s: StoredSession = {
    access_token: data.access_token, refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
    email: (data.user?.email || email).toLowerCase()
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(s));
}
export function hasSavedSession() { return Boolean(readSession()); }
export function signedInEmail() { return readSession()?.email || ''; }
export function signOut() { localStorage.removeItem(SESSION_KEY); }

async function plainRequest(path: string, body: unknown) {
  config();
  const res = await fetch(URL + path, {
    method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body), cache: 'no-store'
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.msg || data.error_description || data.message || 'Sign-in failed');
  return data as AuthResponse;
}
export async function signIn(email: string, password: string) {
  const data = await plainRequest('/auth/v1/token?grant_type=password', { email, password });
  saveSession(data, email);
}
async function refreshToken() {
  const session = readSession();
  if (!session) throw new Error('Please sign in again.');
  try {
    const data = await plainRequest('/auth/v1/token?grant_type=refresh_token', {
      refresh_token: session.refresh_token
    });
    saveSession(data, session.email);
    return data.access_token;
  } catch (error) {
    signOut();
    throw error;
  }
}
async function token() {
  const s = readSession();
  if (!s) throw new Error('Please sign in again.');
  if (s.expires_at < Date.now() + 60000) return refreshToken();
  return s.access_token;
}
async function authorizedRequest(path: string, options: RequestInit = {}, retry = true): Promise<Response> {
  config();
  const jwt = await token();
  const res = await fetch(URL + path, {
    ...options,
    headers: {
      apikey: KEY, Authorization: 'Bearer ' + jwt,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    cache: 'no-store'
  });
  if (res.status === 401 && retry) {
    await refreshToken();
    return authorizedRequest(path, options, false);
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || data.error || 'Cloud request failed (' + res.status + ')');
  }
  return res;
}
export async function hasFamilyAccess() {
  const response = await authorizedRequest('/rest/v1/family_members?select=email&limit=1');
  const rows = await response.json();
  return Array.isArray(rows) && rows.length > 0;
}

export function occurredAtFor(time: string, anchor?: string) {
  const date = anchor ? new Date(anchor) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  const parts = time.split(':').map(Number);
  if (parts.length === 2 && parts[0] >= 0 && parts[0] <= 23 && parts[1] >= 0 && parts[1] <= 59) {
    date.setHours(parts[0], parts[1], 0, 0);
  }
  if (!anchor && date.getTime() > Date.now() + 5 * 60000) date.setDate(date.getDate() - 1);
  return date.toISOString();
}
function toDb(item: TimelineItem) {
  return {
    id: item.id, patient_id: 'jazz', kind: item.kind, value: item.value,
    time: item.time, icon: item.icon, title: item.title, detail: item.detail,
    food_details: item.foodDetails || null,
    occurred_at: item.occurredAt || occurredAtFor(item.time, item.createdAt),
    created_at: item.createdAt || new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}
function fromDb(row: DbLog): TimelineItem {
  return {
    id: row.id, kind: row.kind, value: Number(row.value), time: row.time,
    icon: row.icon, title: row.title, detail: row.detail,
    foodDetails: row.food_details || undefined,
    createdAt: row.created_at, occurredAt: row.occurred_at
  };
}
export async function importLocalLogsOnce() {
  if (localStorage.getItem(MIGRATION_KEY) === 'yes') return;
  let entries: TimelineItem[] = [];
  try {
    const raw = JSON.parse(localStorage.getItem(LOG_STORAGE_KEY) || '[]');
    if (Array.isArray(raw)) entries = raw.filter((x) => x && typeof x.id === 'string' &&
      (x.kind === 'insulin' || x.kind === 'food') && Number(x.value) > 0 && typeof x.time === 'string');
  } catch { /* Keep any malformed local data intact for manual recovery. */ }
  if (entries.length) {
    await authorizedRequest('/rest/v1/manual_logs?on_conflict=id', {
      method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify(entries.map(toDb))
    });
  }
  localStorage.setItem(MIGRATION_KEY, 'yes');
}
export async function fetchCloudLogs(): Promise<TimelineItem[]> {
  const res = await authorizedRequest('/rest/v1/manual_logs?select=*&patient_id=eq.jazz&deleted_at=is.null&order=occurred_at.desc&limit=3000');
  const rows = (await res.json()) as DbLog[];
  const items = rows.map(fromDb);
  try { localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(items)); } catch { /* Backup optional */ }
  return items;
}
export async function saveCloudLog(item: TimelineItem) {
  await authorizedRequest('/rest/v1/manual_logs?on_conflict=id', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(toDb(item))
  });
}
export async function deleteCloudLog(id: string) {
  await authorizedRequest('/rest/v1/manual_logs?id=eq.' + encodeURIComponent(id), {
    method: 'PATCH', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
  });
}
