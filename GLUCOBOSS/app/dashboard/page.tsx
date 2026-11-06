'use client';

import { useEffect, useRef, useState } from 'react';
import GlucoseAlarms from './GlucoseAlarms';
import { activeEntries, applyServerLogReset, cacheEntries, fetchAllLogRows, fetchInsulinSettings, getSession, migrateLocalEntries, removeEntry, saveEntry, sortEntries } from '../../lib/glucoboss-cloud';

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
const basalOptions = [8, 8.5, 9, 9.5, 10, 10.5];
const isBasalEntry = (item: TimelineItem) => item.kind === 'insulin' && item.detail.startsWith('BASAL_LANTUS:');
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

function trendArrow(trend?: string, _delta = 0) {
  // Preserve Dexcom/Nightscout direction exactly; adjacent-reading delta is NOT a trend arrow.
  const raw = (trend ?? '').trim();
  const t = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (raw === '↑↑' || raw === '⇈' || t.includes('doubleup')) return '↑↑';
  if (raw === '↓↓' || raw === '⇊' || t.includes('doubledown')) return '↓↓';
  if (raw === '↗' || t.includes('fortyfiveup') || t.includes('slightup')) return '↗';
  if (raw === '↘' || t.includes('fortyfivedown') || t.includes('slightdown')) return '↘';
  if (raw === '↑' || t === 'up' || t.includes('singleup')) return '↑';
  if (raw === '↓' || t === 'down' || t.includes('singledown')) return '↓';
  if (raw === '→' || t === 'flat' || t === 'steady') return '→';
  return '—'; // Never claim steady when the trend is missing or unrecognised.
}

function spokenTrend(trend?: string) {
  const arrow = trendArrow(trend);
  switch (arrow) {
    case '↑↑': return 'double arrow up';
    case '↑': return 'single arrow up';
    case '↗': return 'angled arrow up';
    case '→': return 'straight arrow';
    case '↘': return 'angled arrow down';
    case '↓': return 'single arrow down';
    case '↓↓': return 'double arrow down';
    default: return 'arrow unavailable';
  }
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
        ) : null}
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
          return <line key={`line-${event.id}`} x1={x} x2={x} y1="8" y2={height} stroke={isBasalEntry(event) ? '#0f766e' : event.kind === 'insulin' ? '#6d28d9' : '#b45309'} strokeWidth="2.5" strokeDasharray="6 5" opacity=".78" />;
        })}
        <polyline points={points} fill="none" stroke="url(#glucoseRangeGradient)" className="glucoseLine" />
        {chartReadings.map((r, i) => <circle key={i} cx={xForTime(r.timestamp)} cy={y(r.glucose)} r="4" fill="#fff" stroke={glucoseColour(r.glucose)} strokeWidth="3" />)}
        {chartEvents.map((event, i) => {
          const basal = isBasalEntry(event);
          const x = Math.max(35, Math.min(width - 35, xForTime(event.occurredAt || event.createdAt || '')));
          const top = i % 2 === 0 ? 24 : 66;
          const colour = basal ? '#0f766e' : event.kind === 'insulin' ? '#6d28d9' : '#b45309';
          const marker = basal ? `S${event.value.toString()}` : event.kind === 'insulin' ? 'I' : 'F';
          return <g key={event.id} pointerEvents="none">
            <title>{`${basal ? 'Slow insulin (Lantus)' : event.kind === 'insulin' ? 'Rapid insulin' : 'Food'}: ${event.kind === 'insulin' ? `${event.value.toFixed(1)} units` : `${Math.round(event.value * 10)} g carbs`} at ${loggedClock(event)} on ${loggedDay(event)}`}</title>
            <circle cx={x} cy={top} r={basal ? 19 : 15} fill={colour} stroke="#fff" strokeWidth="3" />
            <text x={x} y={top + 5} textAnchor="middle" fontSize={basal ? "12" : "15"} fontWeight="900" fill="#fff">{marker}</text>
            {basal && <g>
              <rect x={x - 27} y={top + 20} width="54" height="18" rx="8" fill="#fff" stroke="#0f766e" strokeWidth="1" />
              <text x={x} y={top + 33} textAnchor="middle" fontSize="11" fontWeight="800" fill="#0f766e">{loggedClock(event)}</text>
            </g>}
          </g>;
        })}
        {hoveredIndex != null && chartReadings.length > 0 && <>
          <line x1={xForTime(chartReadings[hoveredIndex].timestamp)} x2={xForTime(chartReadings[hoveredIndex].timestamp)} y1="0" y2={height} className="hoverGuide" />
          <circle cx={xForTime(chartReadings[hoveredIndex].timestamp)} cy={y(chartReadings[hoveredIndex].glucose)} r="7" fill="#fff" stroke={glucoseColour(chartReadings[hoveredIndex].glucose)} strokeWidth="4" />
        </>}
      </svg>
      {chartEvents.length > 0 && <div className="chartEventStrip" aria-label="Insulin and food entries shown on the glucose graph">
        {chartEvents.map((event) => <button type="button" key={event.id} className={`chartEventChip ${event.kind}`} onClick={() => onSelectEvent(event)} aria-label={`${event.kind === 'insulin' ? 'Insulin' : 'Food'} at ${loggedClock(event)}, ${event.kind === 'insulin' ? `${event.value.toFixed(1)} units` : `${Math.round(event.value * 10)} grams carbohydrates`}. View entry`}>
          <span aria-hidden="true">{event.kind === 'insulin' ? '💉' : '🍴'}</span>
          <strong>{loggedClock(event)}</strong>
          <span>{event.kind === 'insulin' ? `${event.value.toFixed(1)} u` : `${Math.round(event.value * 10)} g`}</span>
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
  const [basalMode, setBasalMode] = useState(false);
  const [mealRatios, setMealRatios] = useState<Record<string, string> | null>(null);
  const [mealContext, setMealContext] = useState<'breakfast' | 'lunch' | 'dinner'>('breakfast');
  const [exerciseContext, setExerciseContext] = useState('unknown');
  const [cgm, setCgm] = useState<CgmResponse | null>(null);
  const [cgmLoading, setCgmLoading] = useState(true);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [timelineLoaded, setTimelineLoaded] = useState(false);
  const [syncStatus, setSyncStatus] = useState('Connecting to private family log…');
  const [savingLog, setSavingLog] = useState(false);
  const syncBusy = useRef(false);
  const [clockTick, setClockTick] = useState(Date.now());
  const [chartHours, setChartHours] = useState(6);
  const [reportPeriod, setReportPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [reportHistory, setReportHistory] = useState<CgmReading[]>([]);
  const [activeView, setActiveView] = useState<'home' | 'reports' | 'timeline'>('home');
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState('');
  const [voiceMessage, setVoiceMessage] = useState('');
  const [assistantListening, setAssistantListening] = useState(false);
  const [assistantMessage, setAssistantMessage] = useState('Tap to talk to GLUCOBOSS.');
  const assistantRecognition = useRef<any>(null);
  const assistantSpeaking = useRef(false);

  function speakAssistant(message: string) {
    setAssistantMessage(message);
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.lang = 'en-GB';
    utterance.rate = 0.95;
    assistantSpeaking.current = true;
    utterance.onend = () => { assistantSpeaking.current = false; };
    utterance.onerror = () => { assistantSpeaking.current = false; };
    window.speechSynthesis.speak(utterance);
  }

  function respondToAssistant(question: string) {
    const q = question.toLowerCase().replace(/gluco\s*boss[,.]?/g, '').trim();
    const fresh = Boolean(cgm?.ok && cgm.latest && Number.isFinite(Date.parse(cgm.latest.timestamp)));
    const minutes = fresh ? Math.max(0, Math.floor((Date.now() - Date.parse(cgm!.latest!.timestamp)) / 60000)) : null;
    const reading = fresh ? cgm!.latest!.glucose : null;
    const valid = reading !== null && minutes !== null && minutes < 8;
    const glucoseReply = () => {
      if (!valid) return 'I do not have a recent glucose reading for Jazz. Please check Dexcom directly.';
      const range = reading! < 70 ? 'low' : reading! > 180 ? 'above range' : 'in range';
      const trendText = spokenTrend(cgm!.latest!.trend);
      return `Jazz's latest reading is ${reading} milligrams per decilitre, from ${minutes} minute${minutes === 1 ? '' : 's'} ago. He is ${range}. His Dexcom shows ${trendText}.` + (reading! < 70 ? ' This is low. Follow Jazz\'s prescribed hypo treatment plan and check his Dexcom.' : '');
    };
    if (/glucose|sugar|reading|level|how is jazz|how.s jazz|high|low|dropping|rising|trend/.test(q)) return speakAssistant(glucoseReply());
    if (/insulin|injection|dose|units/.test(q)) {
      const last = timeline.filter(x => x.kind === 'insulin' && !isBasalEntry(x)).sort((a,b) => Date.parse(b.occurredAt || b.createdAt || '') - Date.parse(a.occurredAt || a.createdAt || ''))[0];
      return speakAssistant(last ? `The last recorded insulin entry was ${last.value} units at ${loggedClock(last)}. This is a recorded entry, not an insulin-on-board calculation.` : 'No recorded insulin entry is available. Please verify against your insulin records.');
    }
    if (/food|carb|portion|eat|meal/.test(q)) {
      const last = timeline.filter(x => x.kind === 'food').sort((a,b) => Date.parse(b.occurredAt || b.createdAt || '') - Date.parse(a.occurredAt || a.createdAt || ''))[0];
      return speakAssistant(last ? `The last recorded food entry was ${last.value} portions, equivalent to ${last.value * 10} grams of carbohydrate, at ${loggedClock(last)}. Older entries may have used a different portion definition.` : 'No recorded food entry is available.');
    }
    speakAssistant('You can ask me about Jazz\'s latest glucose reading, glucose trend, last recorded insulin, or food portions.');
  }

  function startAssistant() {
    if (assistantListening) {
      assistantRecognition.current?.stop();
      return;
    }
    const Recognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Recognition) {
      setAssistantMessage('Speech recognition is unavailable in this browser. Try Chrome on Android.');
      return;
    }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    const recognition = new Recognition();
    assistantRecognition.current = recognition;
    recognition.lang = 'en-GB';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => { setAssistantListening(true); setAssistantMessage('Listening…'); };
    recognition.onresult = (event: any) => {
      const transcript = String(event.results?.[0]?.[0]?.transcript || '');
      setAssistantListening(false);
      respondToAssistant(transcript);
    };
    recognition.onerror = (event: any) => { setAssistantListening(false); setAssistantMessage(`Microphone error: ${event.error || 'unknown'}. Try again.`); };
    recognition.onend = () => setAssistantListening(false);
    try { recognition.start(); } catch { setAssistantMessage('Unable to start microphone. Check permissions.'); setAssistantListening(false); }
  }


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

  useEffect(() => {
    if (activeView !== 'reports') return;
    let cancelled = false;
    async function loadReport() {
      setReportLoading(true);
      setReportError('');
      setReportHistory([]);
      try {
        const session = await getSession();
        if (!session) throw new Error('Sign in to view reports.');
        const response = await fetch(`/api/cgm?report=${reportPeriod}`, { cache: 'no-store', headers: { Authorization: `Bearer ${session.access_token}` } });
        if (!response.ok) throw new Error('CGM history unavailable.');
        const result = await response.json() as CgmResponse;
        if (!result.ok) throw new Error(result.error || 'CGM history unavailable.');
        if (!cancelled) setReportHistory(result.readings ?? []);
      } catch (error) { if (!cancelled) setReportError(error instanceof Error ? error.message : 'Unable to load report'); }
      finally { if (!cancelled) setReportLoading(false); }
    }
    void loadReport();
    return () => { cancelled = true; };
  }, [reportPeriod, activeView]);

  useEffect(() => {
    let active = true;
    void fetchInsulinSettings().then(settings => { if (active) setMealRatios(settings?.values ?? null); }).catch(() => { if (active) setMealRatios(null); });
    return () => { active = false; };
  }, []);
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

  const insulinEntries = timeline.filter((item) => item.kind === 'insulin' && !isBasalEntry(item));
  const foodEntries = timeline.filter((item) => item.kind === 'food');
  const basalEntries = timeline.filter(isBasalEntry);

  // Compare calendar days, Monday-start calendar weeks and calendar months.
  // Local clock boundaries are intentional: families review daily insulin by date.
  const reportSource = reportHistory;
  const reportRows = Array.from({ length: reportPeriod === 'daily' ? 7 : reportPeriod === 'weekly' ? 6 : 3 }, (_, index) => {
    const nowDate = new Date(clockTick);
    let start: Date;
    let end: Date;
    let label: string;
    if (reportPeriod === 'daily') {
      start = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate() - index);
      end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
      label = start.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
    } else if (reportPeriod === 'weekly') {
      const mondayOffset = (nowDate.getDay() + 6) % 7;
      start = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate() - mondayOffset - index * 7);
      end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
      label = `Week of ${start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
    } else {
      start = new Date(nowDate.getFullYear(), nowDate.getMonth() - index, 1);
      end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
      label = start.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    }
    const startMs = start.getTime();
    const endMs = Math.min(end.getTime(), clockTick);
    const samples = reportSource.filter(r => {
      const t = Date.parse(r.timestamp);
      return Number.isFinite(r.glucose) && Number.isFinite(t) && t >= startMs && t < endMs;
    });
    const insulin = insulinEntries.filter(item => {
      const t = Date.parse(item.occurredAt || item.createdAt || '');
      return Number.isFinite(t) && t >= startMs && t < endMs;
    });
    const carbs = foodEntries.filter(item => {
      const t = Date.parse(item.occurredAt || item.createdAt || '');
      return Number.isFinite(t) && t >= startMs && t < endMs;
    });
    const expected = Math.max(1, (endMs - startMs) / 300000);
    const coverage = Math.min(100, Math.round(samples.length / expected * 100));
    const tir = samples.length && coverage >= 70 ? Math.round(samples.filter(r => r.glucose >= 70 && r.glucose <= 180).length / samples.length * 100) : null;
    const low = samples.length && coverage >= 70 ? Math.round(samples.filter(r => r.glucose < 70).length / samples.length * 100) : null;
    const high = samples.length && coverage >= 70 ? Math.round(samples.filter(r => r.glucose > 180).length / samples.length * 100) : null;
    return { label, tir, low, high, coverage, samples: samples.length, insulinUnits: insulin.reduce((total, item) => total + item.value, 0), insulinCount: insulin.length, carbGrams: carbs.reduce((total, item) => total + item.value * 10, 0), isCurrent: index === 0 };
  });
  const bestReport = reportRows.filter(row => row.tir !== null).sort((a, b) => (b.tir ?? 0) - (a.tir ?? 0))[0];
  const validReportRows = reportRows.filter(row => row.tir !== null);
  const averageTimeInRange = validReportRows.length ? Math.round(validReportRows.reduce((total, row) => total + (row.tir ?? 0), 0) / validReportRows.length) : null;
  const mealUnits = Number(mealRatios?.[`${mealContext}Units`] ?? '');
  const mealGrams = Number(mealRatios?.[`${mealContext}Grams`] ?? '');
  const validMealRatio = Boolean(mealRatios?.[`${mealContext}Units`] && mealRatios?.[`${mealContext}Grams`] && mealUnits > 0 && mealGrams > 0);
  const foodCarbs = (selectedCarbs ?? 0) * 10;
  const carbohydrateMath = validMealRatio && selectedCarbs !== null ? foodCarbs * mealUnits / mealGrams : null;
  const recentContext = [3, 6, 9].map(hours => {
    const subset = readings.filter(r => {
      const t = Date.parse(r.timestamp);
      return Number.isFinite(t) && t >= clockTick - hours * 3600000 && t <= clockTick;
    });
    const lowCount = subset.filter(r => r.glucose < 70).length;
    const highCount = subset.filter(r => r.glucose > 180).length;
    const coverage = Math.min(100, Math.round(subset.length / (hours * 12) * 100));
    return { hours, lowCount, highCount, coverage, percentInRange: subset.length ? Math.round(subset.filter(r => r.glucose >= 70 && r.glucose <= 180).length / subset.length * 100) : null };
  });
  const lastInsulinTime = insulinEntries.length ? Date.parse(insulinEntries[0].occurredAt || insulinEntries[0].createdAt || '') : NaN;
  const oneHourRemaining = Number.isFinite(lastInsulinTime) ? Math.ceil((lastInsulinTime + 3600000 - clockTick) / 60000) : null;

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
    setBasalMode(false);
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
      setBasalMode(isBasalEntry(item));
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
    setBasalMode(false);
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
      title: basalMode ? `${selectedInsulin.toFixed(1)} units Lantus (slow)` : `${selectedInsulin.toFixed(1)} units rapid insulin`,
      detail: basalMode ? 'BASAL_LANTUS: nightly slow-acting insulin' : (previous ? 'Edited entry' : 'Manual entry'),
      createdAt: previous?.createdAt || new Date().toISOString(),
      occurredAt: timestampAt(selectedTime, base),
    };
    void persistEntry(entry);
  }

  function confirmFood() {
    if (savingLog || selectedCarbs == null || selectedCarbs <= 0 || !selectedTime) return;
    const previous = editingId ? timeline.find(item => item.id === editingId) : undefined;
    const portions = selectedCarbs;
    const grams = Math.round(portions * 10);
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
        <div className="readingGroup current"><span className="eyebrow">CURRENT</span><div className="currentLine"><strong style={{ color: live ? glucoseColour(currentValue) : undefined }}>{live ? currentValue : '—'}</strong><span className="trend" style={{ color: live ? glucoseColour(currentValue) : undefined }}>{arrow}</span></div><span className="unit">mg/dL {live && latestTime ? <>· {latestTime}{ageText ? <> · <strong style={{ fontSize: '1.18em', fontWeight: 800 }}>{ageText}</strong></> : null}</> : null}</span><div className="changeBadge"><span className="changeBadgeLabel">GLUCOSE CHANGE</span><span className="changeBadgeValue">{live ? `${delta > 0 ? '+' : ''}${delta} mg/dL` : '—'}</span></div></div>
        <div className="onBoardSummary" aria-label="Last logged insulin and food. Green indicates recent entries only, not measured insulin or carbohydrate activity.">
          <div className="onBoardMetric" aria-label="Last logged rapid insulin">
            <span className="onBoardLabel">💉 INSULIN</span>
            {insulinEntries.length ? <div className={`onBoardInline${isRecentlyLogged(insulinEntries[0], clockTick) ? ' isRecent' : ''}`}
              title="Green indicates a dose logged within the last four hours, not measured insulin on board or dosing guidance."
              aria-live="polite">
              <strong className="onBoardLoggedValue">{insulinEntries[0].value.toFixed(1)} u</strong>
              <span className="onBoardEventTime">{loggedClock(insulinEntries[0])}</span>
              {oneHourRemaining !== null && oneHourRemaining > 0 && oneHourRemaining <= 60 && <span className="onBoardEventTime" style={{ color: '#b91c1c', fontWeight: 700, background: '#ffffff', borderRadius: 10, padding: '3px 7px', whiteSpace: 'nowrap', lineHeight: 'inherit' }} title="Minutes until one hour after the logged injection. Not a prediction of Fiasp action or advice to redose.">{oneHourRemaining} min</span>}
              {oneHourRemaining !== null && oneHourRemaining <= 0 && <span className="onBoardEventTime" style={{ color: '#b91c1c', fontWeight: 700, background: '#ffffff', borderRadius: 10, padding: '3px 7px', whiteSpace: 'nowrap', lineHeight: 'inherit' }} title="More than one hour since the logged injection; rapid insulin may still be active.">1 hr+</span>}
            </div> : <span className="onBoardEmpty">{timelineLoaded ? 'No insulin logged' : 'Loading…'}</span>}
          </div>
          <div className="onBoardMetric" aria-label="Last logged slow insulin">
            <span className="onBoardLabel">💉 SLOW</span>
            {basalEntries.length ? <div className="onBoardInline" style={{ background: '#ecfdf5', borderRadius: 10, padding: '5px 8px' }}>
              <strong className="onBoardLoggedValue" style={{ color: '#0f766e' }}>S{basalEntries[0].value.toFixed(1)}</strong>
              <span className="onBoardEventTime">{loggedClock(basalEntries[0])}</span>
            </div> : <span className="onBoardEmpty">{timelineLoaded ? 'Not logged' : 'Loading…'}</span>}
          </div>
          <div className="onBoardMetric" aria-label="Last logged food">
            <span className="onBoardLabel">🍴 FOOD</span>
            {foodEntries.length ? <div className={`onBoardInline${isRecentlyLogged(foodEntries[0], clockTick) ? ' isRecent' : ''}`}
              title="Green indicates food logged within the last two hours, not measured carbs on board or a prediction of absorption."
              aria-live="polite">
              <strong className="onBoardLoggedValue">{Math.round(foodEntries[0].value * 10)} g</strong>
              <span className="onBoardEventTime">{loggedClock(foodEntries[0])}</span>
              
            </div> : <span className="onBoardEmpty">{timelineLoaded ? 'No food logged' : 'Loading…'}</span>}
          </div>
        </div>
      </section>

      <section className="card graphCard">
        {!live && <p role="status">{cgmLoading ? 'Connecting to CGM…' : `CGM unavailable${cgm?.error ? ` · ${cgm.error}` : ''}`}</p>}
        <CgmChart readings={readings} hours={chartHours} events={timeline} onSelectEvent={setSelectedEntry} />
        <div className="timeAxis">{Array.from({ length: 5 }, (_, i) => <span key={i}>{new Date(clockTick - (chartHours * 3600000) * (1 - i / 4)).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false })}</span>)}</div>
        <div className="chartControls" aria-label="Chart time range">
          {chartRanges.map((hours) => <button key={hours} className={chartHours === hours ? 'active' : ''} onClick={() => setChartHours(hours)}>{hours}h</button>)}
        </div>
        <div className="chartLegend"><span className="low">LOW &lt;70</span><span className="inRange">IN RANGE 70–180</span><span className="high">HIGH &gt;180</span></div>
        <div className="chartLogLegend"><span><b className="chartLogDot insulin">I</b> Rapid</span><span><b style={{ background: "#0f766e", color: "#fff", borderRadius: 12, padding: "3px 5px", fontSize: 11 }}>S</b> Slow (Lantus)</span><span><b className="chartLogDot food">F</b> Food</span></div>

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

      <nav aria-label="Dashboard views" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '16px 0' }}>
        {(['home', 'reports', 'timeline'] as const).map(view => <button key={view} type="button" onClick={() => setActiveView(view)} aria-pressed={activeView === view} style={{ border: '1px solid #cbd5e1', borderRadius: 12, padding: '10px 14px', fontWeight: 800, background: activeView === view ? '#123243' : '#fff', color: activeView === view ? '#fff' : '#123243' }}>{view === 'home' ? '🏠 Dashboard' : view === 'reports' ? '📊 Reports' : '🕘 Timeline'}</button>)}
      </nav>
      {activeView === 'reports' && <section className="card" aria-label="Glucose and insulin reports" style={{ margin: '14px 0', padding: 18 }}>
        <h2 style={{ margin: '0 0 8px' }}>📊 Reports</h2>
        <div role="tablist" aria-label="Report period" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {(['daily', 'weekly', 'monthly'] as const).map(period => <button type="button" role="tab" aria-selected={reportPeriod === period} key={period} onClick={() => setReportPeriod(period)} style={{ padding: '10px 16px', borderRadius: 12, border: '1px solid #cbd5e1', fontWeight: 800, background: reportPeriod === period ? '#10232f' : '#fff', color: reportPeriod === period ? '#fff' : '#10232f' }}>{period[0].toUpperCase() + period.slice(1)}</button>)}
        </div>
        <p style={{ fontSize: 13, color: '#526873', marginBottom: 12 }}>{reportPeriod === 'daily' ? 'Today and the previous six calendar days' : reportPeriod === 'weekly' ? 'This week and five previous Monday–Sunday weeks' : 'This month and the previous two calendar months'} · target 70–180 mg/dL</p>
        {reportLoading ? <p>Loading historical CGM readings…</p> : reportError ? <p role="alert" style={{ color: '#b91c1c' }}>{reportError}</p> : <>
          <div style={{ padding: '14px 16px', borderRadius: 12, background: '#f1f5f9', marginBottom: 12 }}>
            <div style={{ fontSize: 13, color: '#526873', fontWeight: 750 }}>Average time in range · {reportPeriod === 'daily' ? 'last 7 days' : reportPeriod === 'weekly' ? 'last 6 weeks' : 'last 3 months'}</div>
            <strong style={{ fontSize: 30, color: '#087c70' }}>{averageTimeInRange === null ? '—' : `${averageTimeInRange}%`}</strong>
            <div style={{ fontSize: 12, color: '#526873' }}>{validReportRows.length} of {reportRows.length} periods with sufficient CGM coverage · equal-weight average of period percentages</div>
          </div>
          {bestReport && <p style={{ padding: 10, borderRadius: 10, background: '#ecfdf5', color: '#065f46', fontWeight: 800 }}>🏆 Best {reportPeriod === 'daily' ? 'day' : reportPeriod === 'weekly' ? 'week' : 'month'}: {bestReport.label} · {bestReport.tir}% in range</p>}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 570 }}>
              <thead><tr style={{ textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>
                {['Period', 'In range', 'Low', 'High', 'Rapid insulin', 'Carbs', 'Coverage'].map(h => <th key={h} style={{ padding: '10px 6px' }}>{h}</th>)}
              </tr></thead>
              <tbody>{reportRows.map(row => <tr key={row.label} style={{ borderBottom: '1px solid #e2e8f0', background: bestReport?.label === row.label ? '#f0fdf4' : undefined }}>
                <td style={{ padding: '12px 6px', fontWeight: 800 }}>{row.label}{row.isCurrent ? ' · current' : ''}</td>
                <td style={{ padding: '12px 6px', fontWeight: 900, color: '#087c70' }}>{row.tir === null ? '—' : `${row.tir}%`}</td>
                <td style={{ padding: '12px 6px' }}>{row.low === null ? '—' : `${row.low}%`}</td>
                <td style={{ padding: '12px 6px' }}>{row.high === null ? '—' : `${row.high}%`}</td>
                <td style={{ padding: '12px 6px' }}>{row.insulinUnits.toFixed(1)} u</td>
                <td style={{ padding: '12px 6px' }}>{Math.round(row.carbGrams)} g</td>
                <td style={{ padding: '12px 6px' }}>{row.coverage}%</td>
              </tr>)}</tbody>
            </table>
          </div>
          <p style={{ fontSize: 12, color: '#526873', marginTop: 12 }}>Best period is ranked by time in range only, among periods with at least 70% estimated CGM coverage. A dash means insufficient data. Percentages are reading-based estimates, not time-weighted clinical metrics. Insulin totals include only logged rapid insulin, not basal doses; missing entries are not counted. Current periods are incomplete. No dose changes should be based on these rankings alone.</p>
        </>}
      </section>}

      {activeView === 'timeline' &&       <details open className="card timelineCard" style={{ marginBottom: 14 }}><summary style={{ cursor: "pointer", fontWeight: 850, fontSize: 18, padding: 12 }}>Unified timeline · expand to view history</summary>
        <div className="cardHeader"><div><h2>Unified timeline</h2><p>Live glucose, insulin and food in one place · {syncStatus}</p></div></div>
        <div className="timeline">
          {cgmTimeline.map((item, i) => <div className="timelineItem" key={`cgm-${item.time}-${i}`}><div className="timelineTime">{item.time}</div><div className="timelineIcon">{item.icon}</div><div><strong>{item.title}</strong><span>{item.detail}</span></div></div>)}
          {timeline.map((item) => <div className="timelineItem" key={item.id} role="button" tabIndex={0} title="Edit or delete this entry" style={{ cursor: 'pointer' }} onClick={() => setSelectedEntry(item)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedEntry(item); }}><div className="timelineTime" title={loggedDate(item)}>{loggedDate(item)}</div><div className="timelineIcon">{item.icon}</div><div><strong>{item.title}</strong><span>{item.detail}{item.kind === 'insulin' ? ` · ${insulinElapsed(item, clockTick)}` : ''} · Tap to edit</span></div></div>)}
        </div>
      </details>}

      <section aria-label="Talk to GLUCOBOSS" style={{ margin: '12px 0', padding: '12px 16px', border: '1px solid #dce5ea', borderRadius: 16, background: '#f8fafc' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button type="button" onClick={startAssistant} aria-pressed={assistantListening} style={{ border: 0, borderRadius: 999, background: assistantListening ? '#b91c1c' : '#087c70', color: 'white', padding: '13px 20px', fontWeight: 800, fontSize: 16, cursor: 'pointer' }}>{assistantListening ? '■ Stop listening' : '🎤 Tap to Talk'}</button>
          <span style={{ flex: 1, minWidth: 180, fontSize: 14, color: '#334155' }} role="status" aria-live="polite">{assistantMessage}</span>
        </div>
        <div style={{ marginTop: 6, fontSize: 12, color: '#64748b' }}>Ask: “GLUCOBOSS, what's Jazz's reading?” Voice answers use the latest loaded dashboard data, not continuous monitoring. Check Dexcom for urgent decisions.</div>
      </section>

      <GlucoseAlarms reading={live ? currentValue : undefined} timestamp={latest?.timestamp} connected={live} />

      <nav className="mobileDock" aria-label="Quick actions"><button onClick={() => openNew('insulin')}>💉<span>Insulin</span></button><button onClick={() => openNew('food')}>🍴<span>Food</span></button><button onClick={() => openNew('insulin')}>🎙️<span>Voice</span></button></nav>

      {selectedEntry && <div className="modalBackdrop" onClick={() => setSelectedEntry(null)}><section className="modalSheet" onClick={(e) => e.stopPropagation()}><button className="closeButton" onClick={() => setSelectedEntry(null)}>×</button><span className="eyebrow">LOGGED ENTRY</span><h2>{selectedEntry.title}</h2><p className="modalIntro">{loggedDate(selectedEntry)} · {selectedEntry.detail}</p><button className="confirmButton" onClick={() => openEdit(selectedEntry)}>✏️ EDIT ENTRY</button><button className="secondaryButton" style={{ borderColor: '#dc2626', color: '#dc2626' }} disabled={savingLog} onClick={() => { void deleteEntry(selectedEntry); }}>🗑️ DELETE ENTRY</button></section></div>}

      {modal && <div className="modalBackdrop" onClick={closeLogModal}><section className="modalSheet compactLogModal" onClick={(e) => e.stopPropagation()}><button className="closeButton" onClick={closeLogModal}>×</button>{modal === 'insulin' ? <><span className="eyebrow">{basalMode ? 'LOG SLOW · LANTUS' : editingId ? 'EDIT INSULIN' : 'LOG INSULIN'}</span><h2>{basalMode ? 'Slow insulin (Lantus)' : 'Rapid insulin dose'}</h2><p className="modalIntro">{basalMode ? 'Record the prescribed Lantus dose actually administered. This does not affect rapid-insulin calculations.' : 'Choose a preset, speak it, or enter the exact quantity.'}</p><div className="bigButtonGrid compactGrid">{(basalMode ? basalOptions : insulinOptions).map((n) => <button key={n} className={selectedInsulin === n ? 'selected' : ''} onClick={() => setSelectedInsulin(n)}>{n}</button>)}{!basalMode && <button className="other" onClick={() => setSelectedInsulin((selectedInsulin ?? 0) + 0.5)}>+</button>}</div>{!basalMode && <button className="secondaryButton voiceLogButton" onClick={() => startVoice('insulin')}>🎙️ LOG INSULIN BY VOICE</button>}{voiceMessage && <div className="voiceStatus">{voiceMessage}</div>}<div className="compactFields"><div><label style={labelStyle} htmlFor="insulinQuantity">Quantity (units)</label><input id="insulinQuantity" type="number" min="0.1" step="0.1" inputMode="decimal" style={fieldStyle} value={selectedInsulin ?? ''} onChange={(e) => setSelectedInsulin(e.target.value === '' ? null : Number(e.target.value))} /></div><div><label style={labelStyle} htmlFor="insulinTime">Time</label><input id="insulinTime" type="time" style={fieldStyle} value={selectedTime} onChange={(e) => setSelectedTime(e.target.value)} /></div></div><button className="confirmButton compactConfirm" disabled={savingLog || selectedInsulin == null || selectedInsulin <= 0 || !selectedTime} onClick={confirmInsulin}>{editingId ? 'SAVE CHANGES' : basalMode ? 'CONFIRM SLOW INSULIN' : 'CONFIRM INSULIN'}</button>{!editingId && <button type="button" className="secondaryButton" style={{ width: '100%', marginTop: 14, padding: 12 }} onClick={() => { setBasalMode(!basalMode); setSelectedInsulin(null); }}>{basalMode ? '← Back to rapid insulin' : '💉 LOG SLOW (LANTUS)'}</button>}</> : <><span className="eyebrow">{editingId ? 'EDIT FOOD' : 'LOG FOOD'}</span><h2>Carbohydrate quantity</h2><p className="modalIntro">1 portion = 10g carbohydrate. Add what Jazz ate, then choose or enter the quantity.</p><label style={labelStyle} htmlFor="foodDetails">Food details</label><input id="foodDetails" type="text" style={fieldStyle} placeholder="e.g. pasta + bread" value={foodDetails} onChange={(e) => setFoodDetails(e.target.value)} /><div className="bigButtonGrid carbs compactGrid">{carbOptions.map((n) => <button key={n} className={selectedCarbs === n ? 'selected' : ''} onClick={() => setSelectedCarbs(n)}>{n}</button>)}<button className="other" onClick={() => setSelectedCarbs((selectedCarbs ?? 0) + 0.5)}>+</button></div><button className="secondaryButton voiceLogButton" onClick={() => startVoice('food')}>🎙️ LOG CARBS BY VOICE</button>{voiceMessage && <div className="voiceStatus">{voiceMessage}</div>}<div style={{ padding: 14, borderRadius: 14, background: '#eff6ff', marginTop: 12, color: '#10232f' }}>
  <strong style={{ fontSize: 18 }}>🧮 Food carbohydrate estimator</strong>
  <p style={{ fontSize: 12, margin: '6px 0 10px' }}>Arithmetic guide only — not a safe insulin dose recommendation. Always follow Jazz’s current diabetes care plan.</p>
  <label style={labelStyle} htmlFor="mealContext">Meal ratio</label>
  <select id="mealContext" value={mealContext} onChange={e => setMealContext(e.target.value as 'breakfast' | 'lunch' | 'dinner')} style={{ width: '100%', padding: 10, borderRadius: 10, marginBottom: 10 }}>
    <option value="breakfast">Breakfast</option><option value="lunch">Lunch</option><option value="dinner">Dinner</option>
  </select>
  <div style={{ fontWeight: 850, fontSize: 21 }}>{selectedCarbs == null ? 'Enter portions to calculate' : `${selectedCarbs} portions = ${foodCarbs} g carbs`}</div>
  {carbohydrateMath !== null ? <p style={{ fontSize: 16, fontWeight: 800 }}>Carb-ratio arithmetic: {carbohydrateMath.toFixed(2)} units <span style={{ fontSize: 12, fontWeight: 500 }}>(based only on saved {mealContext} ratio of {mealUnits} u per {mealGrams} g)</span></p> : <p style={{ fontSize: 13 }}>No verified {mealContext} ratio available. <a href="/calculator">Set prescribed meal ratios</a> to enable arithmetic.</p>}
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
    {recentContext.map(ctx => <div key={ctx.hours} style={{ padding: 8, background: '#fff', borderRadius: 9, fontSize: 12 }}><b>{ctx.hours}h history</b><div>{ctx.coverage >= 70 ? `${ctx.percentInRange}% in range` : 'Incomplete CGM'}</div><div>{ctx.lowCount} low · {ctx.highCount} high readings</div></div>)}
  </div>
  <label style={{ ...labelStyle, marginTop: 10 }} htmlFor="exerciseContext">Exercise/activity context</label>
  <select id="exerciseContext" value={exerciseContext} onChange={e => setExerciseContext(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 10 }}>
    <option value="unknown">Not recorded</option><option value="recent">Recent exercise</option><option value="planned">Exercise planned</option><option value="none">No exercise reported</option>
  </select>
  <p style={{ fontSize: 12, marginTop: 10, color: '#9f1239', fontWeight: 700 }}>Check current Dexcom reading and trend, recent lows, active Fiasp, exercise, illness and the clinician-approved plan before any injection. CGM history and activity do not automatically adjust this calculation. Fiasp can remain active beyond one hour.</p>
</div><div className="compactFields"><div><label style={labelStyle} htmlFor="carbQuantity">Quantity (portions)</label><input id="carbQuantity" type="number" min="0.1" step="0.1" inputMode="decimal" style={fieldStyle} value={selectedCarbs ?? ''} onChange={(e) => setSelectedCarbs(e.target.value === '' ? null : Number(e.target.value))} /></div><div><label style={labelStyle} htmlFor="carbTime">Time</label><input id="carbTime" type="time" style={fieldStyle} value={selectedTime} onChange={(e) => setSelectedTime(e.target.value)} /></div></div><button className="secondaryButton" disabled title="Coming later">📷 Photo estimate (coming later)</button><button className="confirmButton compactConfirm" disabled={savingLog || selectedCarbs == null || selectedCarbs <= 0 || !selectedTime} onClick={confirmFood}>{editingId ? 'SAVE CHANGES' : 'CONFIRM FOOD'}</button></>}</section></div>}

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
