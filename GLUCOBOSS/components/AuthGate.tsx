'use client';

import { FormEvent, ReactNode, useEffect, useState } from 'react';
import { hasFamilyAccess, hasSavedSession, signIn, signedInEmail, signOut } from '../lib/cloud';

export default function AuthGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<'checking' | 'login' | 'denied' | 'ready'>('checking');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    async function check() {
      if (!hasSavedSession()) { if (active) setStatus('login'); return; }
      try {
        const allowed = await hasFamilyAccess();
        if (active) { setEmail(signedInEmail()); setStatus(allowed ? 'ready' : 'denied'); }
      } catch {
        signOut();
        if (active) setStatus('login');
      }
    }
    check();
    return () => { active = false; };
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await signIn(email.trim().toLowerCase(), password);
      const allowed = await hasFamilyAccess();
      setPassword('');
      setStatus(allowed ? 'ready' : 'denied');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not sign in.');
    } finally { setBusy(false); }
  }
  function logout() {
    signOut();
    setPassword('');
    setError('');
    setStatus('login');
  }

  if (status === 'ready') return (
    <>
      <div style={{ background: '#e8f7f3', padding: '6px 20px', fontSize: 12, display: 'flex', justifyContent: 'flex-end', gap: 12, alignItems: 'center', color: '#17695d' }}>
        <span>Private family workspace</span>
        <button onClick={logout} style={{ background: 'transparent', border: 0, textDecoration: 'underline', color: 'inherit', cursor: 'pointer' }}>Sign out</button>
      </div>
      {children}
    </>
  );

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f4f7f9', padding: 20, color: '#10232f', fontFamily: 'Arial, sans-serif' }}>
      <section style={{ background: 'white', borderRadius: 24, boxShadow: '0 16px 48px #10232f12', padding: 30, width: 'min(420px, 100%)' }}>
        <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: -1 }}>GLUCO<span style={{ color: '#00a889' }}>BOSS</span></div>
        <h1 style={{ fontSize: 25, marginBottom: 8 }}>Family sign-in</h1>
        {status === 'checking' ? <p>Checking your family session…</p> : status === 'denied' ? (
          <>
            <p>This account is not yet approved for Jazz's family workspace. No health records are accessible.</p>
            <button onClick={logout} style={{ padding: '12px 16px', border: 0, borderRadius: 12, background: '#10232f', color: 'white', cursor: 'pointer' }}>Use a different account</button>
          </>
        ) : (
          <form onSubmit={submit}>
            <p style={{ color: '#526873', lineHeight: 1.5 }}>Sign in with the family account set up in Supabase. Insulin and food records are private to approved family accounts.</p>
            <label htmlFor="familyEmail" style={{ display: 'block', margin: '18px 0 6px', fontWeight: 700 }}>Email</label>
            <input id="familyEmail" type="email" required autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #cbd5e1', borderRadius: 12, padding: 13, fontSize: 16 }} />
            <label htmlFor="familyPassword" style={{ display: 'block', margin: '14px 0 6px', fontWeight: 700 }}>Password</label>
            <input id="familyPassword" type="password" required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #cbd5e1', borderRadius: 12, padding: 13, fontSize: 16 }} />
            {error && <p role="alert" style={{ color: '#b91c1c', fontSize: 13 }}>{error}</p>}
            <button type="submit" disabled={busy} style={{ width: '100%', padding: 14, border: 0, borderRadius: 12, background: '#00a889', color: 'white', fontWeight: 800, marginTop: 20, cursor: 'pointer' }}>{busy ? 'Signing in…' : 'SIGN IN'}</button>
            <p style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>This prototype is for logging and monitoring, not automatic insulin dosing or emergency alerts.</p>
          </form>
        )}
      </section>
    </main>
  );
}
