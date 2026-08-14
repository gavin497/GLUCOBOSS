import { NextResponse } from 'next/server';

const NIGHTSCOUT_BASE = 'https://jazzcgm.up.railway.app';
const NIGHTSCOUT_ENDPOINTS = [
  '/api/v1/entries/sgv.json?count=144',
  '/api/v1/entries.json?count=144',
];

type Reading = {
  glucose: number;
  timestamp: string;
  trend?: string;
};

function normalizeEntry(input: any): Reading | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input.sgv ?? input.glucose ?? input.mgdl ?? input.value;
  const glucose = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(glucose)) return null;

  const rawTime = input.date ?? input.dateString ?? input.timestamp ?? input.created_at;
  let timestamp = new Date().toISOString();
  if (typeof rawTime === 'number') {
    timestamp = new Date(rawTime < 10_000_000_000 ? rawTime * 1000 : rawTime).toISOString();
  } else if (typeof rawTime === 'string') {
    const parsed = new Date(rawTime);
    if (!Number.isNaN(parsed.getTime())) timestamp = parsed.toISOString();
  }

  const trend = input.direction ?? input.trend ?? input.trendArrow;
  return {
    glucose: Math.round(glucose),
    timestamp,
    trend: typeof trend === 'string' ? trend : undefined,
  };
}

async function getNightscoutEntries() {
  let lastError = 'No Nightscout endpoint succeeded';

  for (const path of NIGHTSCOUT_ENDPOINTS) {
    try {
      const response = await fetch(`${NIGHTSCOUT_BASE}${path}`, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        lastError = `${path} returned ${response.status}`;
        continue;
      }

      const payload = await response.json();
      const source = Array.isArray(payload) ? payload : payload?.entries ?? payload?.data ?? [];
      const readings = source
        .map(normalizeEntry)
        .filter((r: Reading | null): r is Reading => Boolean(r))
        .sort((a: Reading, b: Reading) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      if (readings.length) return { readings, endpoint: path };
      lastError = `${path} returned no recognizable glucose readings`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  throw new Error(lastError);
}

export async function GET() {
  try {
    const { readings, endpoint } = await getNightscoutEntries();
    const latest = readings[readings.length - 1];
    const previous = readings.length > 1 ? readings[readings.length - 2] : null;

    return NextResponse.json(
      {
        ok: true,
        source: 'Jazz Nightscout',
        endpoint,
        unit: 'mg/dL',
        readings,
        latest,
        previous,
      },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Unable to reach Nightscout CGM API',
      },
      { status: 502, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
