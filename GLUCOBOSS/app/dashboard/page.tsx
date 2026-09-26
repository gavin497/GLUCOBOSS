'use client';

import { useEffect, useState } from 'react';

type Modal = 'insulin' | 'food' | null;
type TimelineItem = {
  id: string;
  kind: 'insulin' | 'food';
  value: number;
  time: string;
  icon: string;
  title: string;
  detail: string;
};
type CgmReading = { glucose: number; timestamp: string; trend?: string };
type CgmResponse = { ok: boolean; readings?: CgmReading[]; latest?: CgmReading; previous?: CgmReading | null; error?: string };

const insulinOptions = [0.5, 1, 1.5, 2, 2.5, 3];
const carbOptions = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];
const fallbackPoints = [105, 108, 112, 118, 125, 132, 142, 151, 145, 136, 128, 121, 116, 112, 110];

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

function Sparkline({ readings }: { readings: CgmReading[] }) {
  const width = 800;
  const height = 170;
  const values = readings.length > 1 ? readings.map((r) => r.glucose) : fallbackPoints;
  const min = Math.min(55, ...values) - 5;
  const max = Math.max(200, ...values) + 5;
  const step = width / Math.max(1, values.length - 1);
  const y = (v: number) => height - ((v - min) / (max - min)) * height;
  const points = values.map((v, i) => `${i * step},${y(v)}`).join(' ');

  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Live glucose trend">
      <line x1="0" x2={width} y1={y(180)} y2={y(180)} className="targetLine" />
      <line x1="0" x2={width} y1={y(70)} y2={y(70)} className="targetLine" />
      <polyline points={points} fill="none" className="glucoseLine" />
      {values.map((v, i) => <circle key={i} cx={i * step} cy={y(v)} r="4" className="glucoseDot" />)}
    </svg>
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

  async function loadCgm() {
    try {
      const response = await fetch('/api/cgm', { cache: 'no-store' });
      const data = (await response.json()) as CgmResponse;
      setCgm(data);
    } catch (error) {
      setCgm({ ok: false, error: error instanceof Error ? error.message : 'Unable to load CGM' });
    } finally {
      setCgmLoading(false);
    }
  }

  useEffect(() => {
    loadCgm();
    const timer = window.setInterval(loadCgm, 60_000);
    return () => window.clearInterval(timer);
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
      }, ...items]);
    }
    closeLogModal();
  }

  const fieldStyle = { width: '100%', boxSizing: 'border-box' as const, padding: '14px 16px', borderRadius: 12, border: '1px solid #cbd5e1', fontSize: 18, marginBottom: 14 };
  const labelStyle = { display: 'block', fontWeight: 800, margin: '14px 0 7px' };

  return (
    <main className="pageShell">
      <header className="topbar"><div><div className="brand">GLUCO<span>BOSS</span></div><div className="subtitle">MDI daily management cockpit</div></div><a className="profileButton" href="/" aria-label="Back to home">G</a></header>

      <section className="glucoseHero">
        <div className="readingGroup previous"><span className="eyebrow">PREVIOUS</span><strong>{previousValue}</strong><span className="unit">mg/dL</span></div>
        <div className="readingGroup current"><span className="eyebrow">CURRENT</span><div className="currentLine"><strong>{currentValue}</strong><span className="trend">{arrow}</span></div><span className="unit">mg/dL {live && latestTime ? `· ${latestTime}` : ''}</span></div>
        <div className="changeBadge">{delta > 0 ? '+' : ''}{delta}</div>
      </section>

      <section className="card graphCard">
        <div className="cardHeader"><div><h2>Live glucose</h2><p>{cgmLoading ? 'Connecting to CGM…' : live ? 'CGM connected · refreshes every minute' : `CGM unavailable${cgm?.error ? ` · ${cgm.error}` : ''}`}</p></div><span className="statusPill">{live ? 'LIVE' : 'OFFLINE'}</span></div>
        <Sparkline readings={readings} />
        <div className="timeAxis"><span>EARLIER</span><span></span><span></span><span>NOW</span></div>
      </section>

      <section className="metricsGrid">
        <article className="card metricCard">
          <div className="metricTitle">INSULIN LOG</div>
          <div className="metricValue">{insulinEntries.length ? insulinEntries[0].value.toFixed(1) : '—'} <span>u latest</span></div>
          <div className="miniRows">
            {insulinEntries.length ? insulinEntries.slice(0, 3).map((item) => <div key={item.id} role="button" tabIndex={0} style={{ cursor: 'pointer' }} onClick={() => setSelectedEntry(item)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedEntry(item); }}><span>{item.time}</span><b>{item.value.toFixed(1)}u</b></div>) : <div><span>—</span><b>No insulin logged</b></div>}
          </div>
          <button className="actionButton" onClick={() => openNew('insulin')}>💉 LOG INSULIN</button>
        </article>
        <article className="card metricCard">
          <div className="metricTitle">CARB LOG</div>
          <div className="metricValue">{foodEntries.length ? foodEntries[0].value : '—'} <span>portions latest</span></div>
          <div className="miniRows">
            {foodEntries.length ? foodEntries.slice(0, 3).map((item) => <div key={item.id} role="button" tabIndex={0} style={{ cursor: 'pointer' }} onClick={() => setSelectedEntry(item)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedEntry(item); }}><span>{item.time}</span><b>{item.value} portion{item.value === 1 ? '' : 's'}</b></div>) : <div><span>—</span><b>No food logged</b></div>}
          </div>
          <button className="actionButton" onClick={() => openNew('food')}>🍴 LOG FOOD</button>
        </article>
      </section>

      <section className="card actionNow"><div><span className="eyebrow">ACTION NOW</span><h2>Live CGM connected</h2><p>Glucose data is live. Treatment recommendations remain intentionally disabled while the clinical calculation engine is being designed and validated.</p></div><button className="voiceButton" title="Voice logging prototype">🎙️ SAY IT</button></section>

      <section className="card timelineCard">
        <div className="cardHeader"><div><h2>Unified timeline</h2><p>Live glucose, insulin and food in one place · tap a manual entry to edit</p></div></div>
        <div className="timeline">
          {cgmTimeline.map((item, i) => <div className="timelineItem" key={`cgm-${item.time}-${i}`}><div className="timelineTime">{item.time}</div><div className="timelineIcon">{item.icon}</div><div><strong>{item.title}</strong><span>{item.detail}</span></div></div>)}
          {timeline.map((item) => <div className="timelineItem" key={item.id} role="button" tabIndex={0} title="Edit or delete this entry" style={{ cursor: 'pointer' }} onClick={() => setSelectedEntry(item)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedEntry(item); }}><div className="timelineTime">{item.time}</div><div className="timelineIcon">{item.icon}</div><div><strong>{item.title}</strong><span>{item.detail} · Tap to edit</span></div></div>)}
        </div>
      </section>

      <nav className="mobileDock" aria-label="Quick actions"><button onClick={() => openNew('insulin')}>💉<span>Insulin</span></button><button onClick={() => openNew('food')}>🍴<span>Food</span></button><button>🎙️<span>Voice</span></button></nav>

      {selectedEntry && <div className="modalBackdrop" onClick={() => setSelectedEntry(null)}><section className="modalSheet" onClick={(e) => e.stopPropagation()}><button className="closeButton" onClick={() => setSelectedEntry(null)}>×</button><span className="eyebrow">LOGGED ENTRY</span><h2>{selectedEntry.title}</h2><p className="modalIntro">{selectedEntry.time} · {selectedEntry.detail}</p><button className="confirmButton" onClick={() => openEdit(selectedEntry)}>✏️ EDIT ENTRY</button><button className="secondaryButton" style={{ borderColor: '#dc2626', color: '#dc2626' }} onClick={() => deleteEntry(selectedEntry)}>🗑️ DELETE ENTRY</button></section></div>}

      {modal && <div className="modalBackdrop" onClick={closeLogModal}><section className="modalSheet" onClick={(e) => e.stopPropagation()}><button className="closeButton" onClick={closeLogModal}>×</button>{modal === 'insulin' ? <><span className="eyebrow">{editingId ? 'EDIT INSULIN' : 'LOG INSULIN'}</span><h2>Insulin dose</h2><p className="modalIntro">Choose a preset or enter the exact quantity.</p><div className="bigButtonGrid">{insulinOptions.map((n) => <button key={n} className={selectedInsulin === n ? 'selected' : ''} onClick={() => setSelectedInsulin(n)}>{n}</button>)}<button className="other" onClick={() => setSelectedInsulin((selectedInsulin ?? 0) + 0.5)}>+</button></div><label style={labelStyle} htmlFor="insulinQuantity">Quantity (units)</label><input id="insulinQuantity" type="number" min="0.1" step="0.1" inputMode="decimal" style={fieldStyle} value={selectedInsulin ?? ''} onChange={(e) => setSelectedInsulin(e.target.value === '' ? null : Number(e.target.value))} /><label style={labelStyle} htmlFor="insulinTime">Time</label><input id="insulinTime" type="time" style={fieldStyle} value={selectedTime} onChange={(e) => setSelectedTime(e.target.value)} /><button className="confirmButton" disabled={selectedInsulin == null || selectedInsulin <= 0 || !selectedTime} onClick={confirmInsulin}>{editingId ? 'SAVE CHANGES' : 'CONFIRM INSULIN'}</button></> : <><span className="eyebrow">{editingId ? 'EDIT FOOD' : 'LOG FOOD'}</span><h2>Carbohydrate quantity</h2><p className="modalIntro">Prototype setting: 1 portion = 10g carbohydrate. Choose a preset or enter the exact quantity.</p><div className="bigButtonGrid carbs">{carbOptions.map((n) => <button key={n} className={selectedCarbs === n ? 'selected' : ''} onClick={() => setSelectedCarbs(n)}>{n}</button>)}<button className="other" onClick={() => setSelectedCarbs((selectedCarbs ?? 0) + 0.5)}>+</button></div><label style={labelStyle} htmlFor="carbQuantity">Quantity (portions)</label><input id="carbQuantity" type="number" min="0.1" step="0.1" inputMode="decimal" style={fieldStyle} value={selectedCarbs ?? ''} onChange={(e) => setSelectedCarbs(e.target.value === '' ? null : Number(e.target.value))} /><label style={labelStyle} htmlFor="carbTime">Time</label><input id="carbTime" type="time" style={fieldStyle} value={selectedTime} onChange={(e) => setSelectedTime(e.target.value)} /><button className="secondaryButton">📷 Estimate from photo</button><button className="secondaryButton">🎙️ Log with voice</button><button className="confirmButton" disabled={selectedCarbs == null || selectedCarbs <= 0 || !selectedTime} onClick={confirmFood}>{editingId ? 'SAVE CHANGES' : 'CONFIRM FOOD'}</button></>}</section></div>}
    </main>
  );
}
