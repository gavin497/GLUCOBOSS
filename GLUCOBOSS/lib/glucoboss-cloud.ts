'use client';

export type FamilySession = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user?: { email?: string };
};

export type ManualEntry = {
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

type LogRow = {
  id: string;
  patient_id: string;
  kind: 'insulin' | 'food';
  value: number;
  time: string;
  icon: string;
  title: string;
  detail: string;
  food_details: string | null;
  occurred_at: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const apiKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';
const SESSION_KEY = 'glucoboss-family-session-v1';
export const LOG_STORAGE_KEY = 'glucoboss-manual-logs-v1';
let refreshInFlight: Promise<FamilySession | null> | null = null;

function configured() {
  if (!url || !apiKey) throw new Error('Cloud login is not configured. Contact the GLUCOBOSS administrator.');
}

function message(body: any, fallback: string) {
  return String(body?.msg || body?.error_description || body?.message || body?.error || fallback);
}

async function call(path: string, init: RequestInit = {}, token?: string) {
  configured();
  const headers: Record<string, string> = {
    apikey: apiKey,
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(init.headers as Record<string, string> || {}),
  };
  const response = await fetch(`${url}${path}`, { ...init, headers, cache: 'no-store' });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(message(body, `Request failed (${response.status})`));
  return body;
}

function saveSession(body: any): FamilySession {
  if (!body?.access_token || !body?.refresh_token) throw new Error('The login response did not contain a session.');
  const session: FamilySession = {
    access_token: body.access_token,
    refresh_token: body.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + Number(body.expires_in || 3600),
    user: body.user,
  };
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export async function signIn(email: string, password: string) {
  const data = await call('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
  });
  return saveSession(data);
}

export async function signUp(email: string, password: string) {
  const redirect = encodeURIComponent(`${window.location.origin}/dashboard`);
  const data = await call(`/auth/v1/signup?redirect_to=${redirect}`, {
    method: 'POST',
    body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
  });
  if (data?.access_token) return saveSession(data);
  return null; // Supabase requires email confirmation.
}

export function signOut() {
  window.localStorage.removeItem(SESSION_KEY);
}

export async function getSession(): Promise<FamilySession | null> {
  if (typeof window === 'undefined') return null;
  let session: FamilySession;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    session = JSON.parse(raw) as FamilySession;
    if (!session.access_token || !session.refresh_token) return null;
  } catch {
    return null;
  }
  if (session.expires_at > Date.now() / 1000 + 90) return session;
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const data = await call('/auth/v1/token?grant_type=refresh_token', {
          method: 'POST',
          body: JSON.stringify({ refresh_token: session.refresh_token }),
        });
        return saveSession(data);
      } catch {
        signOut();
        return null;
      }
    })().finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
}

async function authorized(path: string, init: RequestInit = {}) {
  const session = await getSession();
  if (!session) throw new Error('Please sign in to sync your family log.');
  return call(path, init, session.access_token);
}

export async function verifyFamilyMember(): Promise<boolean> {
  const rows = await authorized('/rest/v1/family_members?select=email&enabled=eq.true&limit=1');
  return Array.isArray(rows) && rows.length > 0;
}

export function readCachedEntries(): ManualEntry[] {
  try {
    const raw = window.localStorage.getItem(LOG_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((entry: any) =>
      entry && typeof entry.id === 'string' &&
      (entry.kind === 'insulin' || entry.kind === 'food') &&
      typeof entry.value === 'number' && Number.isFinite(entry.value) &&
      typeof entry.time === 'string' && typeof entry.title === 'string'
    ) as ManualEntry[] : [];
  } catch { return []; }
}

export function cacheEntries(entries: ManualEntry[]) {
  try { window.localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(entries)); } catch { /* Storage optional */ }
}

function timestampFor(entry: ManualEntry): string {
  if (entry.occurredAt && Number.isFinite(Date.parse(entry.occurredAt))) return entry.occurredAt;
  const base = entry.createdAt && Number.isFinite(Date.parse(entry.createdAt)) ? new Date(entry.createdAt) : new Date();
  const parts = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(entry.time);
  if (parts) base.setHours(Number(parts[1]), Number(parts[2]), 0, 0);
  return base.toISOString();
}

function toRow(entry: ManualEntry): Partial<LogRow> {
  return {
    id: entry.id,
    patient_id: 'jazz',
    kind: entry.kind,
    value: entry.value,
    time: entry.time,
    icon: entry.icon,
    title: entry.title,
    detail: entry.detail,
    food_details: entry.foodDetails || null,
    occurred_at: timestampFor(entry),
    updated_at: new Date().toISOString(),
  };
}

function fromRow(row: LogRow): ManualEntry {
  return {
    id: row.id,
    kind: row.kind,
    value: Number(row.value),
    time: row.time,
    icon: row.icon,
    title: row.title,
    detail: row.detail,
    createdAt: row.created_at,
    occurredAt: row.occurred_at,
    foodDetails: row.food_details || undefined,
  };
}

export function sortEntries(entries: ManualEntry[]) {
  return [...entries].sort((a, b) => Date.parse(timestampFor(b)) - Date.parse(timestampFor(a)));
}

export async function fetchAllLogRows(): Promise<LogRow[]> {
  const rows = await authorized('/rest/v1/manual_logs?select=*&patient_id=eq.jazz&order=occurred_at.desc&limit=1000');
  if (!Array.isArray(rows)) throw new Error('Unexpected cloud log response.');
  return rows as LogRow[];
}

export function activeEntries(rows: LogRow[]) {
  return sortEntries(rows.filter(row => !row.deleted_at).map(fromRow));
}

export async function saveEntry(entry: ManualEntry) {
  if (!Number.isFinite(entry.value) || entry.value <= 0 || entry.value >= 10000) throw new Error('Invalid log quantity.');
  const result = await authorized('/rest/v1/manual_logs?on_conflict=id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(toRow(entry)),
  });
  if (!Array.isArray(result) || !result.length) throw new Error('Cloud did not confirm the saved entry.');
  return fromRow(result[0] as LogRow);
}

export async function removeEntry(id: string) {
  const result = await authorized(`/rest/v1/manual_logs?id=eq.${encodeURIComponent(id)}&patient_id=eq.jazz`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
  });
  if (!Array.isArray(result) || result.length !== 1) throw new Error('Cloud did not confirm the deletion.');
}

export async function migrateLocalEntries(): Promise<ManualEntry[]> {
  const session = await getSession();
  if (!session) throw new Error('Please sign in.');
  const marker = `glucoboss-migrated-v1-${session.user?.email || 'family'}`;
  let rows = await fetchAllLogRows();
  if (window.localStorage.getItem(marker) !== 'done') {
    const existingIds = new Set(rows.map(row => row.id)); // Includes tombstones: never resurrect deleted entries.
    for (const entry of readCachedEntries()) {
      if (!existingIds.has(entry.id)) {
        await saveEntry(entry);
        existingIds.add(entry.id);
      }
    }
    window.localStorage.setItem(marker, 'done');
    rows = await fetchAllLogRows();
  }
  const entries = activeEntries(rows);
  cacheEntries(entries);
  return entries;
}
