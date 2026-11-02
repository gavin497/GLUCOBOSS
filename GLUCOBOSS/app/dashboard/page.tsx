'use client';

import { useEffect, useRef, useState } from 'react';
import { activeEntries, applyServerLogReset, cacheEntries, fetchAllLogRows, getSession, migrateLocalEntries, removeEntry, saveEntry, sortEntries } from '../../lib/glucoboss-cloud';

type Modal = 'insulin' | 'food' | null;
type TimelineItem = {
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
type CgmReading = { glucose: number; timestamp: string; trend?: string };
type CgmResponse = { ok: boolean; readings?: CgmReading[]; latest?: CgmReading; previous?: CgmReading | null; error?: string };

const insulinOptions = [0.5, 1, 1.5, 2, 2.5, 3];
const carbOptions = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];
const chartRanges = [2, 4, 6, 12, 24];

function currentTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function timestampAt(time: string, original?: string) {
  const date = original && Number.isFinite(Date.parse(original)) ? new Date(original) : new Date();
  const [hours, minutes] = time.split(':').map(Number);
  date.setHours(hours, minutes, 0, 0);
  return date.toISOString();
}

function loggedDate(item: TimelineItem) {
  const timestamp = item.occurredAt || item.createdAt;
  const date = timestamp ? new Date(timestamp) : null;
  if (!date || !Number.isFinite(date.getTime())) return item.time;
  return `${date.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })} · ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function loggedClock(item: TimelineItem) {
  const value = item.occurredAt || item.createdAt;
  const time = value ? new Date(value) : null;
  return time && Number.isFinite(time.getTime())
    ? time.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
    : item.time;
}

function loggedDay(item: TimelineItem) {
  const value = item.occurredAt || item.createdAt;
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime())
    ? date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    : 'Date unavailable';
}

// A visual recency cue only, not a pharmacokinetic IOB/COB calculation.
 // Rapid insulin can act beyond four hours; meal absorption varies substantially.
function isRecentlyLogged(item: TimelineItem, now: number) {
  const timestamp = Date.parse(item.occurredAt || item.createdAt || '');
  if (!Number.isFinite(timestamp)) return false;
  const age = now - timestamp;
  const windowMs = item.kind === 'insulin' ? 4 * 60 * 60 * 1000 : 2 * 60 * 60 * 1000;
  return age >= 0 && age < windowMs;
}

function insulinElapsed(item: TimelineItem, now: number) {
  const timestamp = item.occurredAt || item.createdAt;
  if (!timestamp) return 'Injection time not available';
  const minutes = Math.floor((now - Date.parse(timestamp)) / 60_000);
  if (!Number.isFinite(minutes)) return 'Injection time not available';
  if (minutes < 0) return `Check injection date/time · ${loggedDate(item)}`;
  if (minutes >= 24 * 60) return `Historical entry · ${loggedDate(item)}`;
  if (minutes >= 6 * 60) return `Logged ${Math.floor(minutes / 60)} hr ago · ${loggedDate(item)}`;
  if (minutes < 60) return `${minutes} min since injection · 1-hour mark in ${60 - minutes} min`;
  if (minutes === 60) return '1 hr since injection · 1-hour mark reached';
  return `${Math.floor(minutes / 60)} hr ${String(minutes % 60).padStart(2, '0')} min since injection · 1-hour mark passed`;
}

function trendArrow(trend?: string, delta = 0) {
  const t = (trend ?? '').toLowerCase().replace(/[^a-z]/g, '');
  if (t.includes('doubleup')) return '⇈';
  if (t.includes('fortyfiveup') || t.includes('slightup') || t.includes('singelup')) return '↗';
  if (t === 'up' || t.includes('singleup') || t.includes('rise')) return '↑';
  if (t.includes('doubledown')) return '⇊';
  if (t.includes('fortyfivedown') || t.includes('slightdown')) return '↘';
  if (t === 'down' || t.includes('singledown') || t.includes('fall')) return '↓';
  if (t.includes('flat') || t.includes('steady')) return '→';
  if (delta >= 8) return '↗';
  if (delta <= -8) return '↘';
  return '→';
}

function glucoseColour(v: number) {
  if (v < 70) return '#dc2626';
  if (v > 180) return '#eab308';
  return '#00a889';
}

function isTimelineItem(value: unknown): value is TimelineItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as TimelineItem;
  return typeof item.id === 'string' &&
    (item.kind === 'insulin' || item.kind === 'food') &&
    typeof item.value === 'number' &&
    typeof item.time === 'string' &&
    typeof item.title === 'string';
}

function CgmChart({ readings, hours, events, onSelectEvent }: { readings: CgmReading[]; hours: number; events: TimelineItem[]; onSelectEvent: (item: TimelineItem) => void }) {
  const chartWrapRef = useRef<HTMLDivElement | null>(null);
  const [chartWidth, setChartWidth] = useState(1000);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const height = 220;

  useEffect(() => {
    const element = chartWrapRef.current;
    if (!element) return;

    const updateWidth = () => {
      const nextWidth = Math.max(320, Math.round(element.getBoundingClientRect().width));
      setChartWidth(nextWidth);
    };

    updateWidth();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateWidth);
      return () => window.removeEventListener('resize', updateWidth);
    }

    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const width = chartWidth;
  const validReadings = readings.filter((r) => Number.isFinite(new Date(r.timestamp).getTime()));
  const latestMs = validReadings.length ? new Date(validReadings[validReadings.length - 1].timestamp).getTime() : Date.now();
  const endMs = Math.max(Date.now(), latestMs);
  const cutoff = endMs - hours * 60 * 60 * 1000;
  const filtered = validReadings.filter((r) => Date.parse(r.timestamp) >= cutoff && Date.parse(r.timestamp) <= endMs);
  const chartReadings = filtered.length > 1 ? filtered : [];
  const values = chartReadings.map((r) => r.glucose);
  const min = Math.min(50, ...values) - 5;
  const max = Math.max(220, ...values) + 10;
  const xForTime = (timestamp: string) => ((Date.parse(timestamp) - cutoff) / (endMs - cutoff)) * width;
  const y = (v: number) => height - ((v - min) / (max - min)) * height;
  const points = chartReadings.map((r) => `${xForTime(r.timestamp)},${y(r.glucose)}`).join(' ');
  const chartEvents = events.filter((event) => {
    const time = Date.parse(event.occurredAt || event.createdAt || '');
    return Number.isFinite(time) && time >= cutoff && time <= endMs;
  }).sort((a, b) => Date.parse(a.occurredAt || a.createdAt || '') - Date.parse(b.occurredAt || b.createdAt || '')).slice(-8);
  const highBoundary = Math.max(0, Math.min(100, (y(180) / height) * 100));
  const lowBoundary = Math.max(0, Math.min(100, (y(70) / height) * 100));
  const hoverReading = hoveredIndex != null && chartReadings.length ? chartReadings[hoveredIndex] : null;
  const hoverDelta = hoverReading && hoveredIndex != null && hoveredIndex > 0
    ? hoverReading.glucose - chartReadings[hoveredIndex - 1].glucose
    : null;

  function updateHover(clientX: number, element: SVGSVGElement) {
    if (!chartReadings.length) return;
    const rect = element.getBoundingClientRect();
    const position = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * width;
    let nearest = 0;
    for (let i = 1; i < chartReadings.length; i++) {
      if (Math.abs(xForTime(chartReadings[i].timestamp) - position) < Math.abs(xForTime(chartReadings[nearest].timestamp) - position)) nearest = i;
    }
    setHoveredIndex(nearest);
  }

  if (!chartReadings.length) return <div className="chartInteractive" ref={chartWrapRef} style={{ minHeight: 220, display: 'grid', placeItems: 'center', color: '#64748b' }}>No live CGM readings available for this period. No simulated values are shown.</div>;

  return (
    <div className="chartInteractive" ref={chartWrapRef}>
      <div className="chartHoverReadout">
        {hoverReading ? (
          <>
            <b>{hoverReading.glucose} mg/dL</b>
            <span>{new Date(hoverReading.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            <span>{hoverDelta == null ? '—' : `${hoverDelta > 0 ? '+' : ''}${hoverDelta} from prior`}</span>
          </>
        ) : <span>Hover or touch the chart to inspect a reading</span>}
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        style={{ display: 'block', width: '100%', height: `${height}px` }}
        role="img"
        aria-label={`${hours} hour live glucose trend with logged insulin and food markers`}
        onPointerMove={(e) => updateHover(e.clientX, e.currentTarget)}
        onPointerDown={(e) => updateHover(e.clientX, e.currentTarget)}
        onPointerLeave={() => setHoveredIndex(null)}
      >
        <defs>
          <linearGradient id="glucoseRangeGradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#eab308" />
            <stop offset={`${highBoundary}%`} stopColor="#eab308" />
            <stop offset={`${Math.min(100, highBoundary + 0.1)}%`} stopColor="#00a889" />
            <stop offset={`${lowBoundary}%`} stopColor="#00a889" />
            <stop offset={`${Math.min(100, lowBoundary + 0.1)}%`} stopColor="#dc2626" />
            <stop offset="100%" stopColor="#dc2626" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width={width} height={Math.max(0, y(180))} fill="rgba(234,179,8,.12)" />
        <rect x="0" y={y(180)} width={width} height={Math.max(0, y(70) - y(180))} fill="rgba(0,168,137,.07)" />
        <rect x="0" y={y(70)} width={width} height={Math.max(0, height - y(70))} fill="rgba(220,38,38,.09)" />
        <line x1="0" x2={width} y1={y(180)} y2={y(180)} className="targetLine" />
        <line x1="0" x2={width} y1={y(70)} y2={y(70)} className="targetLine" />
        {chartEvents.map((event) => {
          const x = xForTime(event.occurredAt || event.createdAt || '');
          return <line key={`line-${event.id}`} x1={x} x2={x} y1="8" y2={height} stroke={event.kind === 'insulin' ? '#6d28d9' : '#b45309'} strokeWidth="2.5" strokeDasharray="6 5" opacity=".78" />;
        })}
        <polyline points={points} fill="none" stroke="url(#glucoseRangeGradient)" className="glucoseLine" />
        {chartReadings.map((r, i) => <circle key={i} cx={xForTime(r.timestamp)} cy={y(r.glucose)} r="4" fill="#fff" stroke={glucoseColour(r.glucose)} strokeWidth="3" />)}
        {chartEvents.map((event, i) => {
          const x = Math.max(17, Math.min(width - 17, xForTime(event.occurredAt || event.createdAt || '')));
          const top = i % 2 === 0 ? 22 : 55;
          return <g key={event.id} pointerEvents="none">
            <title>{`${event.kind === 'insulin' ? 'Insulin' : 'Food'}: ${event.kind === 'insulin' ? `${event.value.toFixed(1)} units` : `${Math.round(event.value * 20)} g carbs`} at ${loggedClock(event)} on ${loggedDay(event)}`}</title>
            <circle cx={x} cy={top} r="15" fill={event.kind === 'insulin' ? '#6d28d9' : '#b45309'} stroke="#fff" strokeWidth="3" />
            <text x={x} y={top + 5} textAnchor="middle" fontSize="15" fontWeight="900" fill="#fff">{event.kind === 'insulin' ? 'I' : 'F'}</text>
          </g>;
        })}
        {hoveredIndex != null && chartReadings.length > 0 && <>
          <line x1={xForTime(chartReadings[hoveredIndex].timestamp)} x2={xForTime(chartReadings[hoveredIndex].timestamp)} y1="0" y2={height} className="hoverGuide" />
          <circle cx={xForTime(chartReadings[hoveredIndex].timestamp)} cy={y(chartReadings[hoveredIndex].glucose)} r="7" fill="#fff" stroke={glucoseColour(chartReadings[hoveredIndex].glucose)} strokeWidth="4" />
        </>}
      </svg>
      {chartEvents.length > 0 && <div className="chartEventStrip" aria-label="Insulin and food entries shown on the glucose graph">
        {chartEvents.map((event) => <button type="button" key={event.id} className={`chartEventChip ${event.kind}`} onClick={() => onSelectEvent(event)} aria-label={`${event.kind === 'insulin' ? 'Insulin' : 'Food'} at ${loggedClock(event)}, ${event.kind === 'insulin' ? `${event.value.toFixed(1)} units` : `${Math.round(event.value * 20)} grams carbohydrates`}. View entry`}>
          <span aria-hidden="true">{event.kind === 'insulin' ? '💉' : '🍴'}</span>
          <strong>{loggedClock(event)}</strong>
          <span>{event.kind === 'insulin' ? `${event.value.toFixed(1)} u` : `${Math.round(event.value * 20)} g`}</span>
        </button>)}
      </div>}
      {events.length > 0 && chartEvents.length === 0 && <p className="chartEventNotice">No food or insulin entries in this {hours}-hour view. Choose a longer range to see older entries.</p>}
    </div>
  );
}

export default function Dashboard() {
  const [modal, setModal] = useState<Modal>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<TimelineItem | null>(null);
  const [selectedInsulin, setSelectedInsulin] = useState<number | null>(null);
  const [selectedCarbs, setSelectedCarbs] = useState<number | null>(null);
  const [selectedTime, setSelectedTime] = useState(currentTime());
  const [foodDetails, setFoodDetails] = useState('');
  const [cgm, setCgm] = useState<CgmResponse | null>(null);
  const [cgmLoading, setCgmLoading] = useState(true);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [timelineLoaded, setTimelineLoaded] = useState(false);
  const [syncStatus, setSyncStatus] = useState('Connecting to private family log…');
  const [savingLog, setSavingLog] = useState(false);
  const syncBusy = useRef(false);
  const [clockTick, setClockTick] = useState(Date.now());
  const [chartHours, setChartHours] = useState(6);
  const [voiceMessage, setVoiceMessage] = useState('');

  async function loadCgm() {
    try {
      const session = await getSession();
      if (!session) throw new Error('Please sign in to view glucose readings.');
      const response = await fetch('/api/cgm', { cache: 'no-store', headers: { Authorization: `Bearer ${session.access_token}` } });
      if (!response.ok) throw new Error(`CGM request failed (${response.status})`);
      const data = (await response.json()) as CgmResponse;
      setCgm(data);
      setClockTick(Date.now());
    } catch (error) {
      setCgm({ ok: false, error: error instanceof Error ? error.message : 'Unable to load CGM' });
    } finally {
      setCgmLoading(false);
    }
  }

  useEffect(() => {
    loadCgm();
    const cgmTimer = window.setInterval(loadCgm, 60_000);
    const ageTimer = window.setInterval(() => setClockTick(Date.now()), 15_000);
    return () => {
      window.clearInterval(cgmTimer);
      window.clearInterval(ageTimer);
    };
  }, []);

  useEffect(() => {
    let active = true;
    let initialLoadComplete = false;
    setTimeline([]); // Wait for verified cloud state rather than showing potentially reset local records.
    async function initialLoad() {
      syncBusy.current = true;
      try {
        const entries = await migrateLocalEntries();
        if (!active) return;
        setTimeline(entries);
        setSyncStatus('Synced securely across devices');
      } catch (error) {
        if (active) setSyncStatus(`Cloud sync unavailable: ${error instanceof Error ? error.message : 'unknown error'}`);
      } finally {
        syncBusy.current = false;
        initialLoadComplete = true;
        if (active) setTimelineLoaded(true);
      }
    }
    async function refresh() {
      if (!active || !initialLoadComplete || syncBusy.current) return;
      syncBusy.current = true;
      try {
        await applyServerLogReset();
        const entries = activeEntries(await fetchAllLogRows());
        if (!active) return;
        setTimeline(entries);
        setSyncStatus('Synced securely across devices');
      } catch (error) {
        if (active) setSyncStatus(`Cloud sync unavailable: ${error instanceof Error ? error.message : 'unknown error'}`);
      } finally { syncBusy.current = false; }
    }
    void initialLoad();
    const interval = window.setInterval(() => { void refresh(); }, 30_000);
    const onFocus = () => { void refresh(); };
    window.addEventListener('focus', onFocus);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  useEffect(() => {
    if (timelineLoaded) cacheEntries(timeline);
  }, [timeline, timelineLoaded]);

  const readings = cgm?.readings ?? [];
  const latest = cgm?.latest;
  const previous = cgm?.previous;
  const currentValue = latest?.glucose ?? 110;
  const previousValue = previous?.glucose ?? currentValue;
  const delta = currentValue - previousValue;
  const arrow = trendArrow(latest?.trend, delta);
  const live = Boolean(cgm?.ok && latest);
  const latestTime = latest ? new Date(latest.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null;
  const latestTimestamp = latest ? new Date(latest.timestamp).getTime() : null;
  const latestAgeMinutes = latestTimestamp == null || Number.isNaN(latestTimestamp) ? null : Math.max(0, Math.floor((clockTick - latestTimestamp) / 60_000));
  const stale = live && latestAgeMinutes != null && latestAgeMinutes >= 8;
  const ageText = latestAgeMinutes == null ? '' : latestAgeMinutes < 1 ? '<1 min ago' : `${latestAgeMinutes} min${latestAgeMinutes === 1 ? '' : 's'} ago`;
  const statusText = !live ? 'OFFLINE' : `${stale ? 'STALE' : 'LIVE'} · ${latestAgeMinutes != null && latestAgeMinutes < 1 ? '<1 MIN' : `${latestAgeMinutes ?? '?'} MIN${latestAgeMinutes === 1 ? '' : 'S'} AGO`}`;
  const statusStyle = stale ? { background: '#fee2e2', color: '#b91c1c' } : undefined;

  const insulinEntries = timeline.filter((item) => item.kind === 'insulin');
  const foodEntries = timeline.filter((item) => item.kind === 'food');

  const cgmTimeline = readings.slice(-3).reverse().map((r, i, arr) => {
    const next = arr[i + 1];
    const d = next ? r.glucose - next.glucose : 0;
    return {
      time: new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      icon: '📈',
      title: `Glucose ${r.glucose} ${trendArrow(r.trend, d)}`,
      detail: 'Live CGM reading',
    };
  });

  function makeId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function openNew(kind: 'insulin' | 'food') {
    setSelectedEntry(null);
    setEditingId(null);
    setSelectedTime(currentTime());
    setVoiceMessage('');
    setFoodDetails('');
    if (kind === 'insulin') {
      setSelectedInsulin(null);
      setSelectedCarbs(null);
    } else {
      setSelectedCarbs(null);
      setSelectedInsulin(null);
    }
    setModal(kind);
  }

  function openEdit(item: TimelineItem) {
    setSelectedEntry(null);
    setEditingId(item.id);
    setSelectedTime(item.time);
    setVoiceMessage('');
    if (item.kind === 'insulin') {
      setSelectedInsulin(item.value);
      setSelectedCarbs(null);
      setFoodDetails('');
      setModal('insulin');
    } else {
      setSelectedCarbs(item.value);
      setSelectedInsulin(null);
      setFoodDetails(item.foodDetails ?? '');
      setModal('food');
    }
  }

  async function persistEntry(entry: TimelineItem) {
    setSavingLog(true);
    syncBusy.current = true;
    try {
      const saved = await saveEntry(entry);
      setTimeline(items => sortEntries([saved, ...items.filter(item => item.id !== saved.id)]));
      setSyncStatus('Synced securely across devices');
      closeLogModal();
    } catch (error) {
      setSyncStatus(`Cloud save failed: ${error instanceof Error ? error.message : 'unknown error'}`);
      window.alert('The entry was NOT saved. Check your connection and try again.');
    } finally {
      setSavingLog(false);
      syncBusy.current = false;
    }
  }

  async function deleteEntry(item: TimelineItem) {
    if (!window.confirm(`Delete this ${item.kind === 'insulin' ? 'insulin' : 'food'} entry?`)) return;
    setSavingLog(true);
    syncBusy.current = true;
    try {
      await removeEntry(item.id);
      setTimeline(items => items.filter(entry => entry.id !== item.id));
      setSelectedEntry(null);
      if (editingId === item.id) setEditingId(null);
      setSyncStatus('Synced securely across devices');
    } catch (error) {
      setSyncStatus(`Cloud delete failed: ${error instanceof Error ? error.message : 'unknown error'}`);
      window.alert('Could not delete this entry. It has not been removed.');
    } finally {
      setSavingLog(false);
      syncBusy.current = false;
    }
  }

  function closeLogModal() {
    setModal(null);
    setEditingId(null);
    setSelectedInsulin(null);
    setSelectedCarbs(null);
    setSelectedTime(currentTime());
    setFoodDetails('');
    setVoiceMessage('');
  }

  function confirmInsulin() {
    if (savingLog || selectedInsulin == null || selectedInsulin <= 0 || !selectedTime) return;
    const previous = editingId ? timeline.find(item => item.id === editingId) : undefined;
    const base = previous?.occurredAt || previous?.createdAt;
    const entry: TimelineItem = {
      id: previous?.id || makeId(),
      kind: 'insulin',
      value: selectedInsulin,
      time: selectedTime,
      icon: '💉',
      title: `${selectedInsulin.toFixed(1)} units rapid insulin`,
      detail: previous ? 'Edited entry' : 'Manual entry',
      createdAt: previous?.createdAt || new Date().toISOString(),
      occurredAt: timestampAt(selectedTime, base),
    };
    void persistEntry(entry);
  }

  function confirmFood() {
    if (savingLog || selectedCarbs == null || selectedCarbs <= 0 || !selectedTime) return;
    const previous = editingId ? timeline.find(item => item.id === editingId) : undefined;
    const portions = selectedCarbs;
    const grams = Math.round(portions * 20);
    const description = foodDetails.trim();
    const entry: TimelineItem = {
      id: previous?.id || makeId(),
      kind: 'food',
      value: portions,
      time: selectedTime,
      icon: '🍴',
      foodDetails: description || undefined,
      title: description || `${portions} carb portion${portions === 1 ? '' : 's'}`,
      detail: `${portions} portion${portions === 1 ? '' : 's'} · ${grams}g carbohydrate${previous ? ' · edited' : ''}`,
      createdAt: previous?.createdAt || new Date().toISOString(),
      occurredAt: timestampAt(selectedTime, previous?.occurredAt || previous?.createdAt),
    };
    void persistEntry(entry);
  }

  function spokenNumber(text: string) {
    const numeric = text.match(/\d+(?:\.\d+)?/);
    if (numeric) return Number(numeric[0]);
    const words: Record<string, number> = { half: 0.5, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
    const lower = text.toLowerCase();
    for (const [word, value] of Object.entries(words)) if (lower.includes(word)) return value;
    return null;
  }

  function startVoice(kind: 'insulin' | 'food') {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceMessage('Voice input is not supported in this browser.');
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-GB';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    setVoiceMessage('Listening…');
    recognition.onresult = (event: any) => {
      const transcript = String(event.results?.[0]?.[0]?.transcript ?? '');
      const value = spokenNumber(transcript);
      if (value == null || value <= 0) {
        setVoiceMessage(`Heard “${transcript}” but could not find a quantity.`);
        return;
      }
      if (kind === 'insulin') {
        setSelectedInsulin(value);
        setVoiceMessage(`Heard “${transcript}” → ${value} units. Please confirm.`);
      } else {
        const lower = transcript.toLowerCase();
        const portions = lower.includes('gram') ? value / 20 : value;
        setSelectedCarbs(portions);
        setVoiceMessage(`Heard “${transcript}” → ${portions} portion${portions === 1 ? '' : 's'}. Please confirm.`);
      }
    };
    recognition.onerror = () => setVoiceMessage('Voice input did not complete. Try again or enter the quantity manually.');
    recognition.start();
  }

  const fieldStyle = { width: '100%', boxSizing: 'border-box' as const, padding: '10px 12px', borderRadius: 12, border: '1px solid #cbd5e1', fontSize: 17, marginBottom: 8 };
  const labelStyle = { display: 'block', fontWeight: 800, margin: '8px 0 5px' };

  return (
    <main className="pageShell">
      <header className="topbar"><div><div className="brand">GLUCO<span>BOSS</span></div><div className="subtitle">MDI daily management cockpit</div></div><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><a href="/recipes" style={{ color: '#087c70', fontWeight: 800, fontSize: 13 }}>🍽️ Recipe Guide</a><a className="profileButton" href="/" aria-label="Back to home">G</a></div></header>

      <section className="glucoseHero">
        <div className="readingGroup previous"><span className="eyebrow">PREVIOUS</span><strong style={{ color: live ? glucoseColour(previousValue) : undefined }}>{live ? previousValue : '—'}</strong><span className="unit">mg/dL</span></div>
        <div className="readingGroup current"><span className="eyebrow">CURRENT</span><div className="currentLine"><strong style={{ color: live ? glucoseColour(currentValue) : undefined }}>{live ? currentValue : '—'}</strong><span className="trend" style={{ color: live ? glucoseColour(currentValue) : undefined }}>{arrow}</span></div><span className="unit">mg/dL {live && latestTime ? `· ${latestTime}${ageText ? ` · ${ageText}` : ''}` : ''}</span><div className="changeBadge"><span className="changeBadgeLabel">GLUCOSE CHANGE</span><span className="changeBadgeValue">{live ? `${delta > 0 ? '+' : ''}${delta} mg/dL` : '—'}</span></div></div>
        <div className="onBoardSummary" aria-label="Last logged insulin and food. Green indicates recent entries only, not measured insulin or carbohydrate activity.">
          <div className="onBoardMetric" aria-label="Last logged rapid insulin">
            <span className="onBoardLabel">💉 INSULIN</span>
            {insulinEntries.length ? <div className={`onBoardInline${isRecentlyLogged(insulinEntries[0], clockTick) ? ' isRecent' : ''}`}
              title="Green indicates a dose logged within the last four hours, not measured insulin on board or dosing guidance."
              aria-live="polite">
              <strong className="onBoardLoggedValue">{insulinEntries[0].value.toFixed(1)} u</strong>
              <span className="onBoardEventTime">{loggedClock(insulinEntries[0])}</span>
              <span className="onBoardEventDate">{loggedDay(insulinEntries[0])}</span>
            </div> : <span className="onBoardEmpty">{timelineLoaded ? 'No insulin logged' : 'Loading…'}</span>}
          </div>
          <div className="onBoardMetric" aria-label="Last logged food">
            <span className="onBoardLabel">🍴 FOOD</span>
            {foodEntries.length ? <div className={`onBoardInline${isRecentlyLogged(foodEntries[0], clockTick) ? ' isRecent' : ''}`}
              title="Green indicates food logged within the last two hours, not measured carbs on board or a prediction of absorption."
              aria-live="polite">
              <strong className="onBoardLoggedValue">{Math.round(foodEntries[0].value * 20)} g</strong>
              <span className="onBoardEventTime">{loggedClock(foodEntries[0])}</span>
              <span className="onBoardEventDate">{loggedDay(foodEntries[0])}</span>
            </div> : <span className="onBoardEmpty">{timelineLoaded ? 'No food logged' : 'Loading…'}</span>}
          </div>
        </div>
      </section>

      <section className="card graphCard">
        <div className="cardHeader"><div><h2>Live glucose</h2><p>{cgmLoading ? 'Connecting to CGM…' : live ? `CGM connected · latest reading ${ageText}` : `CGM unavailable${cgm?.error ? ` · ${cgm.error}` : ''}`}</p></div><span className="statusPill" style={statusStyle}>{statusText}</span></div>
        <div className="chartControls" aria-label="Chart time range">
          {chartRanges.map((hours) => <button key={hours} className={chartHours === hours ? 'active' : ''} onClick={() => setChartHours(hours)}>{hours}h</button>)}
        </div>
        <div className="chartLegend"><span className="low">LOW &lt;70</span><span className="inRange">IN RANGE 70–180</span><span className="high">HIGH &gt;180</span></div>
        <div className="chartLogLegend"><span><b className="chartLogDot insulin">I</b> Insulin</span><span><b className="chartLogDot food">F</b> Food</span></div>
        <CgmChart readings={readings} hours={chartHours} events={timeline} onSelectEvent={setSelectedEntry} />
        <div className="timeAxis"><span>{chartHours} HOURS AGO</span><span>NOW</span></div>
      </section>

      <section className="metricsGrid">
        <article className="card metricCard">
          <div className="metricTitle">INSULIN LOG</div>
          <div className="metricValue">{insulinEntries.length ? insulinEntries[0].value.toFixed(1) : '—'} <span>u last recorded</span></div>{insulinEntries.length > 0 && <div style={{ fontSize: 12, color: '#087c70', marginBottom: 10, fontWeight: 700 }}>{insulinElapsed(insulinEntries[0], clockTick)}</div>}
          <div className="miniRows">
            {insulinEntries.length ? insulinEntries.slice(0, 3).map((item) => <div key={item.id} role="button" tabIndex={0} style={{ cursor: 'pointer' }} onClick={() => setSelectedEntry(item)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedEntry(item); }}><span title={loggedDate(item)}>{loggedDate(item)}</span><b>{item.value.toFixed(1)}u</b></div>) : <div><span>—</span><b>{timelineLoaded ? 'No insulin logged' : 'Loading log…'}</b></div>}
          </div>
          <button className="actionButton" onClick={() => openNew('insulin')}>💉 LOG INSULIN</button>
          <a href="/calculator" style={{ display: 'block', marginTop: 12, fontSize: 16, fontWeight: 850, color: '#087c70', textDecoration: 'underline' }}>🧮 Carb ratio &amp; dose estimator setup</a>
        </article>
        <article className="card metricCard">
          <div className="metricTitle">CARB LOG</div>
          <div className="metricValue">{foodEntries.length ? foodEntries[0].value : '—'} <span>portions last recorded</span></div>
          <div className="miniRows">
            {foodEntries.length ? foodEntries.slice(0, 3).map((item) => <div key={item.id} role="button" tabIndex={0} style={{ cursor: 'pointer' }} onClick={() => setSelectedEntry(item)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedEntry(item); }}><span title={loggedDate(item)}>{loggedDate(item)}</span><b>{item.foodDetails ? `${item.foodDetails} · ${item.value} portion${item.value === 1 ? '' : 's'}` : `${item.value} portion${item.value === 1 ? '' : 's'}`}</b></div>) : <div><span>—</span><b>{timelineLoaded ? 'No food logged' : 'Loading log…'}</b></div>}
          </div>
          <button className="actionButton" onClick={() => openNew('food')}>🍴 LOG FOOD</button>
        </article>
      </section>

      <section className="card actionNow"><div><span className="eyebrow">ACTION NOW</span><h2>Live CGM connected</h2><p>Glucose data is live. Treatment recommendations remain intentionally disabled while the clinical calculation engine is being designed and validated.</p></div><button className="voiceButton" title="Voice logging prototype" onClick={() => openNew('insulin')}>🎙️ SAY IT</button></section>

      <section className="card timelineCard">
        <div className="cardHeader"><div><h2>Unified timeline</h2><p>Live glucose, insulin and food in one place · {syncStatus}</p></div></div>
        <div className="timeline">
          {cgmTimeline.map((item, i) => <div className="timelineItem" key={`cgm-${item.time}-${i}`}><div className="timelineTime">{item.time}</div><div className="timelineIcon">{item.icon}</div><div><strong>{item.title}</strong><span>{item.detail}</span></div></div>)}
          {timeline.map((item) => <div className="timelineItem" key={item.id} role="button" tabIndex={0} title="Edit or delete this entry" style={{ cursor: 'pointer' }} onClick={() => setSelectedEntry(item)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedEntry(item); }}><div className="timelineTime" title={loggedDate(item)}>{loggedDate(item)}</div><div className="timelineIcon">{item.icon}</div><div><strong>{item.title}</strong><span>{item.detail}{item.kind === 'insulin' ? ` · ${insulinElapsed(item, clockTick)}` : ''} · Tap to edit</span></div></div>)}
        </div>
      </section>

      <nav className="mobileDock" aria-label="Quick actions"><button onClick={() => openNew('insulin')}>💉<span>Insulin</span></button><button onClick={() => openNew('food')}>🍴<span>Food</span></button><button onClick={() => openNew('insulin')}>🎙️<span>Voice</span></button></nav>

      {selectedEntry && <div className="modalBackdrop" onClick={() => setSelectedEntry(null)}><section className="modalSheet" onClick={(e) => e.stopPropagation()}><button className="closeButton" onClick={() => setSelectedEntry(null)}>×</button><span className="eyebrow">LOGGED ENTRY</span><h2>{selectedEntry.title}</h2><p className="modalIntro">{loggedDate(selectedEntry)} · {selectedEntry.detail}</p><button className="confirmButton" onClick={() => openEdit(selectedEntry)}>✏️ EDIT ENTRY</button><button className="secondaryButton" style={{ borderColor: '#dc2626', color: '#dc2626' }} disabled={savingLog} onClick={() => { void deleteEntry(selectedEntry); }}>🗑️ DELETE ENTRY</button></section></div>}

      {modal && <div className="modalBackdrop" onClick={closeLogModal}><section className="modalSheet compactLogModal" onClick={(e) => e.stopPropagation()}><button className="closeButton" onClick={closeLogModal}>×</button>{modal === 'insulin' ? <><span className="eyebrow">{editingId ? 'EDIT INSULIN' : 'LOG INSULIN'}</span><h2>Insulin dose</h2><p className="modalIntro">Choose a preset, speak it, or enter the exact quantity.</p><div className="bigButtonGrid compactGrid">{insulinOptions.map((n) => <button key={n} className={selectedInsulin === n ? 'selected' : ''} onClick={() => setSelectedInsulin(n)}>{n}</button>)}<button className="other" onClick={() => setSelectedInsulin((selectedInsulin ?? 0) + 0.5)}>+</button></div><button className="secondaryButton voiceLogButton" onClick={() => startVoice('insulin')}>🎙️ LOG INSULIN BY VOICE</button>{voiceMessage && <div className="voiceStatus">{voiceMessage}</div>}<div className="compactFields"><div><label style={labelStyle} htmlFor="insulinQuantity">Quantity (units)</label><input id="insulinQuantity" type="number" min="0.1" step="0.1" inputMode="decimal" style={fieldStyle} value={selectedInsulin ?? ''} onChange={(e) => setSelectedInsulin(e.target.value === '' ? null : Number(e.target.value))} /></div><div><label style={labelStyle} htmlFor="insulinTime">Time</label><input id="insulinTime" type="time" style={fieldStyle} value={selectedTime} onChange={(e) => setSelectedTime(e.target.value)} /></div></div><button className="confirmButton compactConfirm" disabled={savingLog || selectedInsulin == null || selectedInsulin <= 0 || !selectedTime} onClick={confirmInsulin}>{editingId ? 'SAVE CHANGES' : 'CONFIRM INSULIN'}</button></> : <><span className="eyebrow">{editingId ? 'EDIT FOOD' : 'LOG FOOD'}</span><h2>Carbohydrate quantity</h2><p className="modalIntro">1 portion = 20g carbohydrate. Add what Jazz ate, then choose or enter the quantity.</p><label style={labelStyle} htmlFor="foodDetails">Food details</label><input id="foodDetails" type="text" style={fieldStyle} placeholder="e.g. pasta + bread" value={foodDetails} onChange={(e) => setFoodDetails(e.target.value)} /><div className="bigButtonGrid carbs compactGrid">{carbOptions.map((n) => <button key={n} className={selectedCarbs === n ? 'selected' : ''} onClick={() => setSelectedCarbs(n)}>{n}</button>)}<button className="other" onClick={() => setSelectedCarbs((selectedCarbs ?? 0) + 0.5)}>+</button></div><button className="secondaryButton voiceLogButton" onClick={() => startVoice('food')}>🎙️ LOG CARBS BY VOICE</button>{voiceMessage && <div className="voiceStatus">{voiceMessage}</div>}<div className="compactFields"><div><label style={labelStyle} htmlFor="carbQuantity">Quantity (portions)</label><input id="carbQuantity" type="number" min="0.1" step="0.1" inputMode="decimal" style={fieldStyle} value={selectedCarbs ?? ''} onChange={(e) => setSelectedCarbs(e.target.value === '' ? null : Number(e.target.value))} /></div><div><label style={labelStyle} htmlFor="carbTime">Time</label><input id="carbTime" type="time" style={fieldStyle} value={selectedTime} onChange={(e) => setSelectedTime(e.target.value)} /></div></div><button className="secondaryButton" disabled title="Coming later">📷 Photo estimate (coming later)</button><button className="confirmButton compactConfirm" disabled={savingLog || selectedCarbs == null || selectedCarbs <= 0 || !selectedTime} onClick={confirmFood}>{editingId ? 'SAVE CHANGES' : 'CONFIRM FOOD'}</button></>}</section></div>}

      <style>{`
        .chartControls { display:flex; gap:7px; margin-top:14px; flex-wrap:wrap; }
        .chartControls button { border:1px solid #dce5ea; background:#fff; border-radius:999px; padding:7px 12px; font-weight:850; cursor:pointer; color:#526873; }
        .chartControls button.active { background:#10232f; color:#fff; border-color:#10232f; }
        .chartLegend { display:flex; gap:14px; align-items:center; margin-top:10px; font-size:11px; font-weight:850; flex-wrap:wrap; }
        .chartLegend span::before { content:''; display:inline-block; width:9px; height:9px; border-radius:50%; margin-right:6px; }
        .chartLegend .low { color:#b91c1c; } .chartLegend .low::before { background:#dc2626; }
        .chartLegend .inRange { color:#087966; } .chartLegend .inRange::before { background:#00a889; }
        .chartLegend .high { color:#a16207; } .chartLegend .high::before { background:#eab308; }
        .chartInteractive { position:relative; margin-top:8px; width:100%; }
        .chartInteractive svg { touch-action:none; cursor:crosshair; margin-top:4px; max-width:none !important; }
        .chartHoverReadout { min-height:36px; display:flex; gap:16px; align-items:center; flex-wrap:wrap; color:#526873; font-size:17px; font-weight:750; }
        .chartHoverReadout b { color:#10232f; font-size:24px; line-height:1; }
        .hoverGuide { stroke:#8da0a8; stroke-width:1; stroke-dasharray:4 4; }
        .compactGrid { gap:7px !important; margin-top:12px !important; }
        .compactGrid button { min-height:54px !important; font-size:22px !important; border-radius:14px !important; }
        .compactFields { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
        .voiceStatus { margin-top:7px; padding:8px 10px; border-radius:10px; background:#f3f8f7; color:#526873; font-size:12px; }
        .voiceLogButton { min-height:44px !important; margin-top:8px !important; }
        .compactConfirm { min-height:50px !important; margin-top:8px !important; }
        @media (max-width:720px) {
          .compactLogModal { padding:18px 14px 16px !important; max-height:96vh !important; }
          .compactLogModal h2 { font-size:27px !important; margin-top:3px !important; }
          .compactLogModal .modalIntro { margin:4px 0 0; font-size:13px; }
          .compactGrid { grid-template-columns:repeat(4,1fr) !important; }
          .compactGrid button { min-height:48px !important; font-size:20px !important; }
          .compactFields { grid-template-columns:1fr 1fr; }
          .chartControls { justify-content:center; }
          .chartLegend { justify-content:center; gap:10px; }
          .chartHoverReadout { justify-content:center; text-align:center; font-size:16px; }
          .chartHoverReadout b { font-size:22px; }
        }
      `}</style>
    </main>
  );
}
