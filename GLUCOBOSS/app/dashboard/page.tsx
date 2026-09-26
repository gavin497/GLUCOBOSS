'use client';

import { useEffect, useRef, useState } from 'react';

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
};
type CgmReading = { glucose: number; timestamp: string; trend?: string };
type CgmResponse = { ok: boolean; readings?: CgmReading[]; latest?: CgmReading; previous?: CgmReading | null; error?: string };

const insulinOptions = [0.5, 1, 1.5, 2, 2.5, 3];
const carbOptions = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];
const fallbackPoints = [105, 108, 112, 118, 125, 132, 142, 151, 145, 136, 128, 121, 116, 112, 110];
const chartRanges = [2, 4, 6, 12, 24];
const LOG_STORAGE_KEY = 'glucoboss-manual-logs-v1';

function currentTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
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
  if (v < 70) return '#3b82f6';
  if (v > 180) return '#ef4444';
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

function CgmChart({ readings, hours }: { readings: CgmReading[]; hours: number }) {
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
  const cutoff = latestMs - hours * 60 * 60 * 1000;
  const filtered = validReadings.filter((r) => new Date(r.timestamp).getTime() >= cutoff);
  const chartReadings = filtered.length > 1 ? filtered : [];
  const values = chartReadings.length ? chartReadings.map((r) => r.glucose) : fallbackPoints;
  const min = Math.min(50, ...values) - 5;
  const max = Math.max(220, ...values) + 10;
  const step = width / Math.max(1, values.length - 1);
  const y = (v: number) => height - ((v - min) / (max - min)) * height;
  const points = values.map((v, i) => `${i * step},${y(v)}`).join(' ');
  const highBoundary = Math.max(0, Math.min(100, (y(180) / height) * 100));
  const lowBoundary = Math.max(0, Math.min(100, (y(70) / height) * 100));
  const hoverReading = hoveredIndex != null && chartReadings.length ? chartReadings[hoveredIndex] : null;
  const hoverDelta = hoverReading && hoveredIndex != null && hoveredIndex > 0
    ? hoverReading.glucose - chartReadings[hoveredIndex - 1].glucose
    : null;

  function updateHover(clientX: number, element: SVGSVGElement) {
    if (!chartReadings.length) return;
    const rect = element.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    setHoveredIndex(Math.round(ratio * (chartReadings.length - 1)));
  }

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
        aria-label={`${hours} hour live glucose trend`}
        onPointerMove={(e) => updateHover(e.clientX, e.currentTarget)}
        onPointerDown={(e) => updateHover(e.clientX, e.currentTarget)}
        onPointerLeave={() => setHoveredIndex(null)}
      >
        <defs>
          <linearGradient id="glucoseRangeGradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#ef4444" />
            <stop offset={`${highBoundary}%`} stopColor="#ef4444" />
            <stop offset={`${Math.min(100, highBoundary + 0.1)}%`} stopColor="#00a889" />
            <stop offset={`${lowBoundary}%`} stopColor="#00a889" />
            <stop offset={`${Math.min(100, lowBoundary + 0.1)}%`} stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#3b82f6" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width={width} height={Math.max(0, y(180))} fill="rgba(239,68,68,.06)" />
        <rect x="0" y={y(180)} width={width} height={Math.max(0, y(70) - y(180))} fill="rgba(0,168,137,.07)" />
        <rect x="0" y={y(70)} width={width} height={Math.max(0, height - y(70))} fill="rgba(59,130,246,.07)" />
        <line x1="0" x2={width} y1={y(180)} y2={y(180)} className="targetLine" />
        <line x1="0" x2={width} y1={y(70)} y2={y(70)} className="targetLine" />
        <polyline points={points} fill="none" stroke="url(#glucoseRangeGradient)" className="glucoseLine" />
        {values.map((v, i) => <circle key={i} cx={i * step} cy={y(v)} r="4" fill="#fff" stroke={glucoseColour(v)} strokeWidth="3" />)}
        {hoveredIndex != null && chartReadings.length > 0 && <>
          <line x1={(hoveredIndex / Math.max(1, chartReadings.length - 1)) * width} x2={(hoveredIndex / Math.max(1, chartReadings.length - 1)) * width} y1="0" y2={height} className="hoverGuide" />
          <circle cx={(hoveredIndex / Math.max(1, chartReadings.length - 1)) * width} cy={y(chartReadings[hoveredIndex].glucose)} r="7" fill="#fff" stroke={glucoseColour(chartReadings[hoveredIndex].glucose)} strokeWidth="4" />
        </>}
      </svg>
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
  const [cgm, setCgm] = useState<CgmResponse | null>(null);
  const [cgmLoading, setCgmLoading] = useState(true);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [timelineLoaded, setTimelineLoaded] = useState(false);
  const [clockTick, setClockTick] = useState(Date.now());
  const [chartHours, setChartHours] = useState(6);
  const [voiceMessage, setVoiceMessage] = useState('');

  async function loadCgm() {
    try {
      const response = await fetch('/api/cgm', { cache: 'no-store' });
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
    try {
      const stored = window.localStorage.getItem(LOG_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) setTimeline(parsed.filter(isTimelineItem));
      }
    } catch {
      // Ignore malformed or unavailable browser storage and keep the log usable.
    } finally {
      setTimelineLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!timelineLoaded) return;
    try {
      window.localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(timeline));
    } catch {
      // If browser storage is unavailable, the current session still works normally.
    }
  }, [timeline, timelineLoaded]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== LOG_STORAGE_KEY || !event.newValue) return;
      try {
        const parsed = JSON.parse(event.newValue);
        if (Array.isArray(parsed)) setTimeline(parsed.filter(isTimelineItem));
      } catch {
        // Ignore invalid storage events.
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
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
      setModal('insulin');
    } else {
      setSelectedCarbs(item.value);
      setSelectedInsulin(null);
      setModal('food');
    }
  }

  function deleteEntry(item: TimelineItem) {
    if (!window.confirm(`Delete this ${item.kind === 'insulin' ? 'insulin' : 'food'} entry?`)) return;
    setTimeline((items) => items.filter((entry) => entry.id !== item.id));
    setSelectedEntry(null);
    if (editingId === item.id) setEditingId(null);
  }

  function closeLogModal() {
    setModal(null);
    setEditingId(null);
    setSelectedInsulin(null);
    setSelectedCarbs(null);
    setSelectedTime(currentTime());
    setVoiceMessage('');
  }

  function confirmInsulin() {
    if (selectedInsulin == null || selectedInsulin <= 0 || !selectedTime) return;
    if (editingId) {
      setTimeline((items) => items.map((item) => item.id === editingId ? {
        ...item,
        value: selectedInsulin,
        time: selectedTime,
        title: `${selectedInsulin.toFixed(1)} units rapid insulin`,
        detail: 'Edited entry',
      } : item));
    } else {
      setTimeline((items) => [{
        id: makeId(),
        kind: 'insulin',
        value: selectedInsulin,
        time: selectedTime,
        icon: '💉',
        title: `${selectedInsulin.toFixed(1)} units rapid insulin`,
        detail: 'Manual entry',
        createdAt: new Date().toISOString(),
      }, ...items]);
    }
    closeLogModal();
  }

  function confirmFood() {
    if (selectedCarbs == null || selectedCarbs <= 0 || !selectedTime) return;
    const grams = Math.round(selectedCarbs * 10);
    if (editingId) {
      setTimeline((items) => items.map((item) => item.id === editingId ? {
        ...item,
        value: selectedCarbs,
        time: selectedTime,
        title: `${selectedCarbs} carb portion${selectedCarbs === 1 ? '' : 's'}`,
        detail: `${grams}g carbohydrate at 10g/portion · edited`,
      } : item));
    } else {
      setTimeline((items) => [{
        id: makeId(),
        kind: 'food',
        value: selectedCarbs,
        time: selectedTime,
        icon: '🍴',
        title: `${selectedCarbs} carb portion${selectedCarbs === 1 ? '' : 's'}`,
        detail: `${grams}g carbohydrate at 10g/portion`,
        createdAt: new Date().toISOString(),
      }, ...items]);
    }
    closeLogModal();
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
        const portions = lower.includes('gram') ? value / 10 : value;
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
      <header className="topbar"><div><div className="brand">GLUCO<span>BOSS</span></div><div className="subtitle">MDI daily management cockpit</div></div><a className="profileButton" href="/" aria-label="Back to home">G</a></header>

      <section className="glucoseHero">
        <div className="readingGroup previous"><span className="eyebrow">PREVIOUS</span><strong>{previousValue}</strong><span className="unit">mg/dL</span></div>
        <div className="readingGroup current"><span className="eyebrow">CURRENT</span><div className="currentLine"><strong>{currentValue}</strong><span className="trend">{arrow}</span></div><span className="unit">mg/dL {live && latestTime ? `· ${latestTime}${ageText ? ` · ${ageText}` : ''}` : ''}</span></div>
        <div className="changeBadge">{delta > 0 ? '+' : ''}{delta}</div>
      </section>

      <section className="card graphCard">
        <div className="cardHeader"><div><h2>Live glucose</h2><p>{cgmLoading ? 'Connecting to CGM…' : live ? `CGM connected · latest reading ${ageText}` : `CGM unavailable${cgm?.error ? ` · ${cgm.error}` : ''}`}</p></div><span className="statusPill" style={statusStyle}>{statusText}</span></div>
        <div className="chartControls" aria-label="Chart time range">
          {chartRanges.map((hours) => <button key={hours} className={chartHours === hours ? 'active' : ''} onClick={() => setChartHours(hours)}>{hours}h</button>)}
        </div>
        <div className="chartLegend"><span className="low">LOW &lt;70</span><span className="inRange">IN RANGE 70–180</span><span className="high">HIGH &gt;180</span></div>
        <CgmChart readings={readings} hours={chartHours} />
        <div className="timeAxis"><span>{chartHours} HOURS AGO</span><span>NOW</span></div>
      </section>

      <section className="metricsGrid">
        <article className="card metricCard">
          <div className="metricTitle">INSULIN LOG</div>
          <div className="metricValue">{insulinEntries.length ? insulinEntries[0].value.toFixed(1) : '—'} <span>u latest</span></div>
          <div className="miniRows">
            {insulinEntries.length ? insulinEntries.slice(0, 3).map((item) => <div key={item.id} role="button" tabIndex={0} style={{ cursor: 'pointer' }} onClick={() => setSelectedEntry(item)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedEntry(item); }}><span>{item.time}</span><b>{item.value.toFixed(1)}u</b></div>) : <div><span>—</span><b>{timelineLoaded ? 'No insulin logged' : 'Loading log…'}</b></div>}
          </div>
          <button className="actionButton" onClick={() => openNew('insulin')}>💉 LOG INSULIN</button>
        </article>
        <article className="card metricCard">
          <div className="metricTitle">CARB LOG</div>
          <div className="metricValue">{foodEntries.length ? foodEntries[0].value : '—'} <span>portions latest</span></div>
          <div className="miniRows">
            {foodEntries.length ? foodEntries.slice(0, 3).map((item) => <div key={item.id} role="button" tabIndex={0} style={{ cursor: 'pointer' }} onClick={() => setSelectedEntry(item)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedEntry(item); }}><span>{item.time}</span><b>{item.value} portion{item.value === 1 ? '' : 's'}</b></div>) : <div><span>—</span><b>{timelineLoaded ? 'No food logged' : 'Loading log…'}</b></div>}
          </div>
          <button className="actionButton" onClick={() => openNew('food')}>🍴 LOG FOOD</button>
        </article>
      </section>

      <section className="card actionNow"><div><span className="eyebrow">ACTION NOW</span><h2>Live CGM connected</h2><p>Glucose data is live. Treatment recommendations remain intentionally disabled while the clinical calculation engine is being designed and validated.</p></div><button className="voiceButton" title="Voice logging prototype" onClick={() => openNew('insulin')}>🎙️ SAY IT</button></section>

      <section className="card timelineCard">
        <div className="cardHeader"><div><h2>Unified timeline</h2><p>Live glucose, insulin and food in one place · manual entries are saved on this device</p></div></div>
        <div className="timeline">
          {cgmTimeline.map((item, i) => <div className="timelineItem" key={`cgm-${item.time}-${i}`}><div className="timelineTime">{item.time}</div><div className="timelineIcon">{item.icon}</div><div><strong>{item.title}</strong><span>{item.detail}</span></div></div>)}
          {timeline.map((item) => <div className="timelineItem" key={item.id} role="button" tabIndex={0} title="Edit or delete this entry" style={{ cursor: 'pointer' }} onClick={() => setSelectedEntry(item)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedEntry(item); }}><div className="timelineTime">{item.time}</div><div className="timelineIcon">{item.icon}</div><div><strong>{item.title}</strong><span>{item.detail} · Tap to edit</span></div></div>)}
        </div>
      </section>

      <nav className="mobileDock" aria-label="Quick actions"><button onClick={() => openNew('insulin')}>💉<span>Insulin</span></button><button onClick={() => openNew('food')}>🍴<span>Food</span></button><button onClick={() => openNew('insulin')}>🎙️<span>Voice</span></button></nav>

      {selectedEntry && <div className="modalBackdrop" onClick={() => setSelectedEntry(null)}><section className="modalSheet" onClick={(e) => e.stopPropagation()}><button className="closeButton" onClick={() => setSelectedEntry(null)}>×</button><span className="eyebrow">LOGGED ENTRY</span><h2>{selectedEntry.title}</h2><p className="modalIntro">{selectedEntry.time} · {selectedEntry.detail}</p><button className="confirmButton" onClick={() => openEdit(selectedEntry)}>✏️ EDIT ENTRY</button><button className="secondaryButton" style={{ borderColor: '#dc2626', color: '#dc2626' }} onClick={() => deleteEntry(selectedEntry)}>🗑️ DELETE ENTRY</button></section></div>}

      {modal && <div className="modalBackdrop" onClick={closeLogModal}><section className="modalSheet compactLogModal" onClick={(e) => e.stopPropagation()}><button className="closeButton" onClick={closeLogModal}>×</button>{modal === 'insulin' ? <><span className="eyebrow">{editingId ? 'EDIT INSULIN' : 'LOG INSULIN'}</span><h2>Insulin dose</h2><p className="modalIntro">Choose a preset, speak it, or enter the exact quantity.</p><div className="bigButtonGrid compactGrid">{insulinOptions.map((n) => <button key={n} className={selectedInsulin === n ? 'selected' : ''} onClick={() => setSelectedInsulin(n)}>{n}</button>)}<button className="other" onClick={() => setSelectedInsulin((selectedInsulin ?? 0) + 0.5)}>+</button></div><button className="secondaryButton voiceLogButton" onClick={() => startVoice('insulin')}>🎙️ LOG INSULIN BY VOICE</button>{voiceMessage && <div className="voiceStatus">{voiceMessage}</div>}<div className="compactFields"><div><label style={labelStyle} htmlFor="insulinQuantity">Quantity (units)</label><input id="insulinQuantity" type="number" min="0.1" step="0.1" inputMode="decimal" style={fieldStyle} value={selectedInsulin ?? ''} onChange={(e) => setSelectedInsulin(e.target.value === '' ? null : Number(e.target.value))} /></div><div><label style={labelStyle} htmlFor="insulinTime">Time</label><input id="insulinTime" type="time" style={fieldStyle} value={selectedTime} onChange={(e) => setSelectedTime(e.target.value)} /></div></div><button className="confirmButton compactConfirm" disabled={selectedInsulin == null || selectedInsulin <= 0 || !selectedTime} onClick={confirmInsulin}>{editingId ? 'SAVE CHANGES' : 'CONFIRM INSULIN'}</button></> : <><span className="eyebrow">{editingId ? 'EDIT FOOD' : 'LOG FOOD'}</span><h2>Carbohydrate quantity</h2><p className="modalIntro">1 portion = 10g carbohydrate. Choose a preset, speak it, or enter the exact quantity.</p><div className="bigButtonGrid carbs compactGrid">{carbOptions.map((n) => <button key={n} className={selectedCarbs === n ? 'selected' : ''} onClick={() => setSelectedCarbs(n)}>{n}</button>)}<button className="other" onClick={() => setSelectedCarbs((selectedCarbs ?? 0) + 0.5)}>+</button></div><button className="secondaryButton voiceLogButton" onClick={() => startVoice('food')}>🎙️ LOG CARBS BY VOICE</button>{voiceMessage && <div className="voiceStatus">{voiceMessage}</div>}<div className="compactFields"><div><label style={labelStyle} htmlFor="carbQuantity">Quantity (portions)</label><input id="carbQuantity" type="number" min="0.1" step="0.1" inputMode="decimal" style={fieldStyle} value={selectedCarbs ?? ''} onChange={(e) => setSelectedCarbs(e.target.value === '' ? null : Number(e.target.value))} /></div><div><label style={labelStyle} htmlFor="carbTime">Time</label><input id="carbTime" type="time" style={fieldStyle} value={selectedTime} onChange={(e) => setSelectedTime(e.target.value)} /></div></div><button className="secondaryButton">📷 Estimate from photo</button><button className="confirmButton compactConfirm" disabled={selectedCarbs == null || selectedCarbs <= 0 || !selectedTime} onClick={confirmFood}>{editingId ? 'SAVE CHANGES' : 'CONFIRM FOOD'}</button></>}</section></div>}

      <style>{`
        .chartControls { display:flex; gap:7px; margin-top:14px; flex-wrap:wrap; }
        .chartControls button { border:1px solid #dce5ea; background:#fff; border-radius:999px; padding:7px 12px; font-weight:850; cursor:pointer; color:#526873; }
        .chartControls button.active { background:#10232f; color:#fff; border-color:#10232f; }
        .chartLegend { display:flex; gap:14px; align-items:center; margin-top:10px; font-size:11px; font-weight:850; flex-wrap:wrap; }
        .chartLegend span::before { content:''; display:inline-block; width:9px; height:9px; border-radius:50%; margin-right:6px; }
        .chartLegend .low { color:#2563eb; } .chartLegend .low::before { background:#3b82f6; }
        .chartLegend .inRange { color:#087966; } .chartLegend .inRange::before { background:#00a889; }
        .chartLegend .high { color:#dc2626; } .chartLegend .high::before { background:#ef4444; }
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
