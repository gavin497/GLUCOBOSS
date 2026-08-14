import { NextResponse } from 'next/server';

const CGM_URL = 'https://jazzcgm.up.railway.app/';

type Reading = {
  glucose: number;
  timestamp: string;
  trend?: string;
};

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function normalizeTimestamp(value: unknown): string {
  if (typeof value === 'number') {
    const ms = value < 10_000_000_000 ? value * 1000 : value;
    return new Date(ms).toISOString();
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return new Date().toISOString();
}

function normalizeOne(input: any): Reading | null {
  if (!input || typeof input !== 'object') return null;

  const rawGlucose =
    input.glucose ??
    input.mgdl ??
    input.mg_dl ??
    input.sgv ??
    input.value ??
    input.currentGlucose ??
    input.current_glucose ??
    input.reading;

  let glucose = toNumber(rawGlucose);
  if (glucose == null) return null;

  const unit = String(input.unit ?? input.units ?? '').toLowerCase();
  if (unit.includes('mmol')) glucose = Math.round(glucose * 18.0182);

  const timestamp = normalizeTimestamp(
    input.timestamp ??
      input.time ??
      input.datetime ??
      input.dateString ??
      input.date ??
      input.created_at ??
      input.createdAt
  );

  const trend = input.trend ?? input.direction ?? input.trendArrow ?? input.trend_arrow;

  return {
    glucose: Math.round(glucose),
    timestamp,
    trend: typeof trend === 'string' ? trend : undefined,
  };
}

function extractReadings(payload: any): Reading[] {
  const candidates: any[] = [];

  if (Array.isArray(payload)) candidates.push(...payload);

  if (payload && typeof payload === 'object') {
    const arrays = [payload.readings, payload.entries, payload.data, payload.history, payload.values];
    for (const arr of arrays) {
      if (Array.isArray(arr)) candidates.push(...arr);
    }

    const singles = [payload.current, payload.latest, payload.reading, payload.glucose];
    for (const item of singles) {
      if (item && typeof item === 'object') candidates.push(item);
    }

    candidates.push(payload);
  }

  const readings = candidates
    .map(normalizeOne)
    .filter((r): r is Reading => Boolean(r))
    .filter((r, i, all) => all.findIndex((x) => x.timestamp === r.timestamp && x.glucose === r.glucose) === i)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  return readings.slice(-144);
}

export async function GET() {
  try {
    const response = await fetch(CGM_URL, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      return NextResponse.json(
        { ok: false, error: `CGM source returned ${response.status}` },
        { status: 502, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const text = await response.text();
    let payload: any;

    try {
      payload = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { ok: false, error: 'CGM source did not return JSON', preview: text.slice(0, 200) },
        { status: 502, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const readings = extractReadings(payload);
    if (!readings.length) {
      return NextResponse.json(
        { ok: false, error: 'No glucose readings could be identified in the CGM response' },
        { status: 502, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        source: 'Jazz CGM',
        unit: 'mg/dL',
        readings,
        latest: readings[readings.length - 1],
        previous: readings.length > 1 ? readings[readings.length - 2] : null,
      },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Unable to reach CGM source' },
      { status: 502, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
