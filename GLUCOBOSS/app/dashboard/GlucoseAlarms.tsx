'use client';

import { useEffect, useRef, useState } from 'react';

type AlarmKind = 'low' | 'high';
type Props = { reading?: number; timestamp?: string; connected: boolean };
const LOW_LIMIT = 70;
const HIGH_LIMIT = 180;
const SNOOZE_MINUTES = [15, 30, 45, 60, 90, 120] as const;
const STORAGE_KEY = 'glucoboss:device-alarms:v1';
type AlarmState = { enabled: boolean; lowUntil: number; highUntil: number; lowLast: number; highLast: number };
const INITIAL: AlarmState = { enabled: false, lowUntil: 0, highUntil: 0, lowLast: 0, highLast: 0 };

function alarmPhrase(kind: AlarmKind) {
  return kind === 'low'
    ? 'Boo doo, boo doo, boo doo, boo doo, boo doo, boo doo. Low! Low! Low!'
    : 'Hibbidy high! Hibbidy high! Hibbidy, hibbidy high! High! Woof!';
}
function soundAlarm(kind: AlarmKind) {
  if (typeof window === 'undefined') return;
  try {
    const AudioContextType = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (AudioContextType) {
      const ctx: AudioContext = new AudioContextType();
      void ctx.resume();
      const start = ctx.currentTime + 0.02;
      for (let i = 0; i < 8; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = kind === 'low' ? 'square' : 'sine';
        osc.frequency.value = kind === 'low' ? (i % 2 ? 490 : 380) : (i % 2 ? 920 : 720);
        const at = start + i * (kind === 'low' ? 0.22 : 0.16);
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(0.10, at + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(at); osc.stop(at + 0.18);
      }
      window.setTimeout(() => { void ctx.close(); }, 3000);
    }
  } catch { /* Browser may block audio without user gesture */ }
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(alarmPhrase(kind));
    utterance.lang = 'en-GB';
    utterance.rate = kind === 'low' ? 1.05 : 1.2;
    utterance.volume = 1;
    window.speechSynthesis.speak(utterance);
  }
}

export default function GlucoseAlarms({ reading, timestamp, connected }: Props) {
  const [settings, setSettings] = useState<AlarmState>(INITIAL);
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [notice, setNotice] = useState('');
  const settingsRef = useRef(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null');
      if (saved && typeof saved === 'object') {
        setSettings({
          enabled: saved.enabled === true,
          lowUntil: Number(saved.lowUntil) || 0,
          highUntil: Number(saved.highUntil) || 0,
          lowLast: Number(saved.lowLast) || 0,
          highLast: Number(saved.highLast) || 0,
        });
      }
    } catch { /* use safe defaults */ }
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings, ready]);
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 10000);
    return () => window.clearInterval(interval);
  }, []);

  const ageMs = timestamp ? now - Date.parse(timestamp) : Infinity;
  const fresh = connected && typeof reading === 'number' && Number.isFinite(reading) && Number.isFinite(ageMs) && ageMs >= -60000 && ageMs < 8 * 60000;
  const kind: AlarmKind | null = !fresh ? null : reading! < LOW_LIMIT ? 'low' : reading! > HIGH_LIMIT ? 'high' : null;

  useEffect(() => {
    if (!ready || !settings.enabled || !kind || !fresh) return;
    const snoozeUntil = kind === 'low' ? settings.lowUntil : settings.highUntil;
    const last = kind === 'low' ? settings.lowLast : settings.highLast;
    const repeatMs = (kind === 'low' ? 5 : 15) * 60000;
    if (now < snoozeUntil || (last > 0 && now - last < repeatMs)) return;
    // Record before sounding to prevent repeated playback on re-render.
    setSettings(prev => kind === 'low' ? { ...prev, lowLast: now } : { ...prev, highLast: now });
    soundAlarm(kind);
    setNotice(kind === 'low' ? 'LOW alarm sounded. Follow Jazz\'s hypo plan and check Dexcom.' : 'HIGH alarm sounded. Check Dexcom and Jazz\'s care plan.');
  }, [now, ready, settings.enabled, settings.lowUntil, settings.highUntil, settings.lowLast, settings.highLast, kind, fresh]);

  // Clear prior alert cadence when Jazz has returned to range, but never on stale data.
  useEffect(() => {
    if (!ready || !fresh || kind !== null) return;
    setSettings(prev => (prev.lowLast || prev.highLast || prev.lowUntil || prev.highUntil)
      ? { ...prev, lowLast: 0, highLast: 0, lowUntil: 0, highUntil: 0 } : prev);
  }, [ready, fresh, kind]);

  function enable() {
    const next = !settingsRef.current.enabled;
    setSettings(prev => ({ ...prev, enabled: next }));
    setNotice(next ? 'In-app alarms enabled on this device. Keep GLUCOBOSS open and audible.' : 'In-app alarms disabled on this device.');
    if (!next && 'speechSynthesis' in window) window.speechSynthesis.cancel();
  }
  function snooze(minutes: number) {
    if (!kind) return;
    const until = Date.now() + minutes * 60000;
    setSettings(prev => kind === 'low' ? { ...prev, lowUntil: until } : { ...prev, highUntil: until });
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    setNotice(`${kind.toUpperCase()} alarm snoozed for ${minutes} minutes on this device.`);
  }
  const snoozeUntil = kind === 'low' ? settings.lowUntil : kind === 'high' ? settings.highUntil : 0;
  const isSnoozed = kind !== null && snoozeUntil > now;
  return (
    <section aria-label="Glucose alarms" style={{ margin: '12px 0', padding: 16, border: '1px solid #dce5ea', borderRadius: 16, background: '#f8fafc', color: '#172f3d' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 18 }}>🔔 GLUCOBOSS alarms</strong>
        <button type="button" onClick={enable} disabled={!ready} style={{ border: 0, borderRadius: 999, padding: '10px 16px', color: '#fff', background: settings.enabled ? '#b91c1c' : '#087c70', fontWeight: 800 }}>{settings.enabled ? 'Disable in-app alarms' : 'Enable in-app alarms'}</button>
      </div>
      <p style={{ fontSize: 13, margin: '8px 0' }}>Low: below 70 mg/dL, every 5 minutes. High: above 180 mg/dL, every 15 minutes. Low takes priority.</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '10px 0' }}>
        <button type="button" onClick={() => soundAlarm('low')} style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid #fca5a5', background: '#fee2e2', fontWeight: 700 }}>▶ Test LOW sound</button>
        <button type="button" onClick={() => soundAlarm('high')} style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid #fde68a', background: '#fef3c7', fontWeight: 700 }}>▶ Test HIGH sound</button>
        <button type="button" onClick={() => { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); setNotice('Speech stopped.'); }} style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff' }}>■ Stop sound</button>
      </div>
      <p role="status" style={{ fontSize: 14, fontWeight: 700, margin: '10px 0', color: kind === 'low' ? '#b91c1c' : '#334155' }}>
        {!fresh ? 'CGM data unavailable or stale — alarms cannot assess glucose.' : kind === null ? 'Jazz is currently in the configured range.' : isSnoozed ? `${kind.toUpperCase()} snoozed until ${new Date(snoozeUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : `${kind.toUpperCase()} glucose detected`}
      </p>
      {settings.enabled && kind && <div>
        <strong style={{ fontSize: 13 }}>Snooze {kind.toUpperCase()} alarm:</strong>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 8 }}>
          {SNOOZE_MINUTES.map(minutes => <button type="button" key={minutes} onClick={() => snooze(minutes)} style={{ padding: '9px 11px', border: '1px solid #94a3b8', borderRadius: 9, background: '#fff', fontWeight: 700 }}>{minutes < 60 ? `${minutes} min` : `${minutes / 60} hr`}</button>)}
          {isSnoozed && <button type="button" onClick={() => { setSettings(prev => kind === 'low' ? { ...prev, lowUntil: 0, lowLast: 0 } : { ...prev, highUntil: 0, highLast: 0 }); setNotice('Snooze cancelled.'); }} style={{ padding: '9px 11px', border: '1px solid #b91c1c', borderRadius: 9, background: '#fff' }}>Cancel snooze</button>}
        </div>
      </div>}
      {notice && <p role="status" style={{ fontSize: 12 }}>{notice}</p>}
      <p style={{ fontSize: 12, color: '#9f1239', margin: '10px 0 0' }}><strong>Important:</strong> These are experimental in-app alarms only. They cannot reliably sound with the phone locked, on silent, or the app closed, and are not yet family push notifications. Keep Dexcom's native alarms enabled.</p>
    </section>
  );
}
