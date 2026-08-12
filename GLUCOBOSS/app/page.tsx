'use client';

import { useMemo, useState } from 'react';

type Modal = 'insulin' | 'food' | null;

type TimelineItem = {
  time: string;
  icon: string;
  title: string;
  detail: string;
};

const insulinOptions = [0.5, 1, 1.5, 2, 2.5, 3];
const carbOptions = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];

const glucosePoints = [105, 108, 112, 118, 125, 132, 142, 151, 145, 136, 128, 121, 116, 112, 110];

function Sparkline() {
  const width = 800;
  const height = 170;
  const min = 70;
  const max = 200;
  const step = width / (glucosePoints.length - 1);
  const points = glucosePoints
    .map((v, i) => `${i * step},${height - ((v - min) / (max - min)) * height}`)
    .join(' ');

  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="12 hour glucose trend">
      <line x1="0" x2={width} y1="25" y2="25" className="targetLine" />
      <line x1="0" x2={width} y1="120" y2="120" className="targetLine" />
      <polyline points={points} fill="none" className="glucoseLine" />
      {glucosePoints.map((v, i) => (
        <circle
          key={i}
          cx={i * step}
          cy={height - ((v - min) / (max - min)) * height}
          r="4"
          className="glucoseDot"
        />
      ))}
    </svg>
  );
}

export default function Home() {
  const [modal, setModal] = useState<Modal>(null);
  const [selectedInsulin, setSelectedInsulin] = useState<number | null>(null);
  const [selectedCarbs, setSelectedCarbs] = useState<number | null>(null);
  const [timeline, setTimeline] = useState<TimelineItem[]>([
    { time: '15:15', icon: '📈', title: 'Glucose 112 →', detail: 'Stable and in range' },
    { time: '14:22', icon: '🍝', title: '2 portions · Pasta + bread', detail: '20g estimated carbohydrate' },
    { time: '14:08', icon: '💉', title: '2.0 units rapid insulin', detail: 'Logged by caregiver' },
    { time: '13:45', icon: '📈', title: 'Glucose 138 ↘', detail: 'Falling slowly' },
  ]);

  const now = useMemo(() => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), [timeline]);

  function confirmInsulin() {
    if (selectedInsulin == null) return;
    setTimeline((items) => [
      { time: now, icon: '💉', title: `${selectedInsulin.toFixed(1)} units rapid insulin`, detail: 'Confirmed just now' },
      ...items,
    ]);
    setSelectedInsulin(null);
    setModal(null);
  }

  function confirmFood() {
    if (selectedCarbs == null) return;
    const grams = Math.round(selectedCarbs * 10);
    setTimeline((items) => [
      { time: now, icon: '🍴', title: `${selectedCarbs} carb portion${selectedCarbs === 1 ? '' : 's'}`, detail: `${grams}g carbohydrate at 10g/portion` },
      ...items,
    ]);
    setSelectedCarbs(null);
    setModal(null);
  }

  return (
    <main className="pageShell">
      <header className="topbar">
        <div>
          <div className="brand">GLUCO<span>BOSS</span></div>
          <div className="subtitle">MDI daily management cockpit</div>
        </div>
        <button className="profileButton" aria-label="Open profile">J</button>
      </header>

      <section className="glucoseHero">
        <div className="readingGroup previous">
          <span className="eyebrow">PREVIOUS</span>
          <strong>100</strong>
          <span className="unit">mg/dL</span>
        </div>
        <div className="readingGroup current">
          <span className="eyebrow">CURRENT</span>
          <div className="currentLine"><strong>110</strong><span className="trend">↗</span></div>
          <span className="unit">mg/dL</span>
        </div>
        <div className="changeBadge">+10</div>
      </section>

      <section className="card graphCard">
        <div className="cardHeader">
          <div>
            <h2>12-hour glucose</h2>
            <p>Dummy CGM data for UX prototyping</p>
          </div>
          <span className="statusPill">IN RANGE</span>
        </div>
        <Sparkline />
        <div className="timeAxis"><span>04:00</span><span>08:00</span><span>12:00</span><span>NOW</span></div>
      </section>

      <section className="metricsGrid">
        <article className="card metricCard">
          <div className="metricTitle">INSULIN ON BOARD</div>
          <div className="metricValue">2.1 <span>u</span></div>
          <div className="miniRows">
            <div><span>14:08</span><b>2.0u</b></div>
            <div><span>12:50</span><b>0.5u</b></div>
          </div>
          <button className="actionButton" onClick={() => setModal('insulin')}>💉 LOG INSULIN</button>
        </article>

        <article className="card metricCard">
          <div className="metricTitle">CARBS ON BOARD</div>
          <div className="metricValue">1.5 <span>portions</span></div>
          <div className="miniRows">
            <div><span>14:22</span><b>Pasta + bread</b></div>
            <div><span>13:10</span><b>½ portion</b></div>
          </div>
          <button className="actionButton" onClick={() => setModal('food')}>🍴 LOG FOOD</button>
        </article>
      </section>

      <section className="card actionNow">
        <div>
          <span className="eyebrow">ACTION NOW</span>
          <h2>✓ No action</h2>
          <p>Glucose is currently in range and broadly stable. Treatment recommendations are intentionally disabled in V0.1.</p>
        </div>
        <button className="voiceButton" title="Voice logging prototype">🎙️ SAY IT</button>
      </section>

      <section className="card timelineCard">
        <div className="cardHeader">
          <div>
            <h2>Unified timeline</h2>
            <p>Glucose, insulin and food in one place</p>
          </div>
        </div>
        <div className="timeline">
          {timeline.map((item, i) => (
            <div className="timelineItem" key={`${item.time}-${i}`}>
              <div className="timelineTime">{item.time}</div>
              <div className="timelineIcon">{item.icon}</div>
              <div><strong>{item.title}</strong><span>{item.detail}</span></div>
            </div>
          ))}
        </div>
      </section>

      <nav className="mobileDock" aria-label="Quick actions">
        <button onClick={() => setModal('insulin')}>💉<span>Insulin</span></button>
        <button onClick={() => setModal('food')}>🍴<span>Food</span></button>
        <button>🎙️<span>Voice</span></button>
      </nav>

      {modal && (
        <div className="modalBackdrop" onClick={() => setModal(null)}>
          <section className="modalSheet" onClick={(e) => e.stopPropagation()}>
            <button className="closeButton" onClick={() => setModal(null)}>×</button>
            {modal === 'insulin' ? (
              <>
                <span className="eyebrow">QUICK LOG</span>
                <h2>How much insulin?</h2>
                <p className="modalIntro">Rapid acting · now</p>
                <div className="bigButtonGrid">
                  {insulinOptions.map((n) => (
                    <button key={n} className={selectedInsulin === n ? 'selected' : ''} onClick={() => setSelectedInsulin(n)}>{n}</button>
                  ))}
                  <button className="other">+</button>
                </div>
                <button className="confirmButton" disabled={selectedInsulin == null} onClick={confirmInsulin}>
                  {selectedInsulin == null ? 'SELECT DOSE' : `CONFIRM ${selectedInsulin} UNITS`}
                </button>
              </>
            ) : (
              <>
                <span className="eyebrow">QUICK LOG</span>
                <h2>How many carb portions?</h2>
                <p className="modalIntro">Prototype setting: 1 portion = 10g carbohydrate</p>
                <div className="bigButtonGrid carbs">
                  {carbOptions.map((n) => (
                    <button key={n} className={selectedCarbs === n ? 'selected' : ''} onClick={() => setSelectedCarbs(n)}>{n}</button>
                  ))}
                  <button className="other">+</button>
                </div>
                <button className="secondaryButton">📷 Estimate from photo</button>
                <button className="secondaryButton">🎙️ Log with voice</button>
                <button className="confirmButton" disabled={selectedCarbs == null} onClick={confirmFood}>
                  {selectedCarbs == null ? 'SELECT PORTIONS' : `CONFIRM ${selectedCarbs} PORTION${selectedCarbs === 1 ? '' : 'S'}`}
                </button>
              </>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
