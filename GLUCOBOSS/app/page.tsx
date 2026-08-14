'use client';

import { useEffect, useMemo, useState } from 'react';

type Modal = 'insulin' | 'food' | null;
type TimelineItem = { time: string; icon: string; title: string; detail: string };
type CgmReading = { glucose: number; timestamp: string; trend?: string };
type CgmResponse = { ok: boolean; readings?: CgmReading[]; latest?: CgmReading; previous?: CgmReading | null; error?: string };

const insulinOptions = [0.5, 1, 1.5, 2, 2.5, 3];
const carbOptions = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];
const fallbackPoints = [105, 108, 112, 118, 125, 132, 142, 151, 145, 136, 128, 121, 116, 112, 110];

function trendArrow(trend?: string, delta = 0) {
  const t = (trend ?? '').toLowerCase().replace(/[^a-z]/g, '');

  // Nightscout/Dexcom directions. Check diagonal values before generic up/down
  // so FortyFiveDown does not get caught by the broader "down" match.
  if (t.includes('doubleup')) return '⇈';
  if (t.includes('fortyfiveup') || t.includes('slightup') || t.includes('singelup')) return '↗';
  if (t === 'up' || t.includes('singleup') || t.includes('rise')) return '↑';
  if (t.includes('doubledown')) return '⇊';
  if (t.includes('fortyfivedown') || t.includes('slightdown')) return '↘';
  if (t === 'down' || t.includes('singledown') || t.includes('fall')) return '↓';
  if (t.includes('flat') || t.includes('steady')) return '→';

  // Fallback only when the source gives no usable direction string.
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

export default function Home() {
  const [modal, setModal] = useState<Modal>(null);
  const [selectedInsulin, setSelectedInsulin] = useState<number | null>(null);
  const [selectedCarbs, setSelectedCarbs] = useState<number | null>(null);
  const [cgm, setCgm] = useState<CgmResponse | null>(null);
  const [cgmLoading, setCgmLoading] = useState(true);
  const [timeline, setTimeline] = useState<TimelineItem[]>([
    { time: '14:22', icon: '🍝', title: '2 portions · Pasta + bread', detail: '20g estimated carbohydrate' },
    { time: '14:08', icon: '💉', title: '2.0 units rapid insulin', detail: 'Logged by caregiver' },
  ]);

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
  const now = useMemo(() => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), [timeline]);

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

  function confirmInsulin() {
    if (selectedInsulin == null) return;
    setTimeline((items) => [{ time: now, icon: '💉', title: `${selectedInsulin.toFixed(1)} units rapid insulin`, detail: 'Confirmed just now' }, ...items]);
    setSelectedInsulin(null); setModal(null);
  }

  function confirmFood() {
    if (selectedCarbs == null) return;
    const grams = Math.round(selectedCarbs * 10);
    setTimeline((items) => [{ time: now, icon: '🍴', title: `${selectedCarbs} carb portion${selectedCarbs === 1 ? '' : 's'}`, detail: `${grams}g carbohydrate at 10g/portion` }, ...items]);
    setSelectedCarbs(null); setModal(null);
  }

  return (
    <main className="pageShell">
      <header className="topbar"><div><div className="brand">GLUCO<span>BOSS</span></div><div className="subtitle">MDI daily management cockpit</div></div><button className="profileButton" aria-label="Open profile">J</button></header>

      <section className="glucoseHero">
        <div className="readingGroup previous"><span className="eyebrow">PREVIOUS</span><strong>{previousValue}</strong><span className="unit">mg/dL</span></div>
        <div className="readingGroup current"><span className="eyebrow">CURRENT</span><div className="currentLine"><strong>{currentValue}</strong><span className="trend">{arrow}</span></div><span className="unit">mg/dL {live && latestTime ? `· ${latestTime}` : ''}</span></div>
        <div className="changeBadge">{delta > 0 ? '+' : ''}{delta}</div>
      </section>

      <section className="card graphCard">
        <div className="cardHeader"><div><h2>Live glucose</h2><p>{cgmLoading ? 'Connecting to Jazz CGM…' : live ? 'Jazz CGM · refreshes every minute' : `CGM unavailable${cgm?.error ? ` · ${cgm.error}` : ''}`}</p></div><span className="statusPill">{live ? 'LIVE' : 'OFFLINE'}</span></div>
        <Sparkline readings={readings} />
        <div className="timeAxis"><span>EARLIER</span><span></span><span></span><span>NOW</span></div>
      </section>

      <section className="metricsGrid">
        <article className="card metricCard"><div className="metricTitle">INSULIN ON BOARD</div><div className="metricValue">2.1 <span>u</span></div><div className="miniRows"><div><span>14:08</span><b>2.0u</b></div><div><span>12:50</span><b>0.5u</b></div></div><button className="actionButton" onClick={() => setModal('insulin')}>💉 LOG INSULIN</button></article>
        <article className="card metricCard"><div className="metricTitle">CARBS ON BOARD</div><div className="metricValue">1.5 <span>portions</span></div><div className="miniRows"><div><span>14:22</span><b>Pasta + bread</b></div><div><span>13:10</span><b>½ portion</b></div></div><button className="actionButton" onClick={() => setModal('food')}>🍴 LOG FOOD</button></article>
      </section>

      <section className="card actionNow"><div><span className="eyebrow">ACTION NOW</span><h2>Live CGM connected</h2><p>Glucose data is live. Treatment recommendations remain intentionally disabled while the clinical calculation engine is being designed and validated.</p></div><button className="voiceButton" title="Voice logging prototype">🎙️ SAY IT</button></section>

      <section className="card timelineCard"><div className="cardHeader"><div><h2>Unified timeline</h2><p>Live glucose, insulin and food in one place</p></div></div><div className="timeline">{[...cgmTimeline, ...timeline].map((item, i) => <div className="timelineItem" key={`${item.time}-${i}`}><div className="timelineTime">{item.time}</div><div className="timelineIcon">{item.icon}</div><div><strong>{item.title}</strong><span>{item.detail}</span></div></div>)}</div></section>

      <nav className="mobileDock" aria-label="Quick actions"><button onClick={() => setModal('insulin')}>💉<span>Insulin</span></button><button onClick={() => setModal('food')}>🍴<span>Food</span></button><button>🎙️<span>Voice</span></button></nav>

      {modal && <div className="modalBackdrop" onClick={() => setModal(null)}><section className="modalSheet" onClick={(e) => e.stopPropagation()}><button className="closeButton" onClick={() => setModal(null)}>×</button>{modal === 'insulin' ? <><span className="eyebrow">QUICK LOG</span><h2>How much insulin?</h2><p className="modalIntro">Rapid acting · now</p><div className="bigButtonGrid">{insulinOptions.map((n) => <button key={n} className={selectedInsulin === n ? 'selected' : ''} onClick={() => setSelectedInsulin(n)}>{n}</button>)}<button className="other">+</button></div><button className="confirmButton" disabled={selectedInsulin == null} onClick={confirmInsulin}>{selectedInsulin == null ? 'SELECT DOSE' : `CONFIRM ${selectedInsulin} UNITS`}</button></> : <><span className="eyebrow">QUICK LOG</span><h2>How many carb portions?</h2><p className="modalIntro">Prototype setting: 1 portion = 10g carbohydrate</p><div className="bigButtonGrid carbs">{carbOptions.map((n) => <button key={n} className={selectedCarbs === n ? 'selected' : ''} onClick={() => setSelectedCarbs(n)}>{n}</button>)}<button className="other">+</button></div><button className="secondaryButton">📷 Estimate from photo</button><button className="secondaryButton">🎙️ Log with voice</button><button className="confirmButton" disabled={selectedCarbs == null} onClick={confirmFood}>{selectedCarbs == null ? 'SELECT PORTIONS' : `CONFIRM ${selectedCarbs} PORTION${selectedCarbs === 1 ? '' : 'S'}`}</button></>}</section></div>}
    </main>
  );
}
