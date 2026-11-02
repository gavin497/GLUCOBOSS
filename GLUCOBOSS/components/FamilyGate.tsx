'use client';

import { FormEvent, ReactNode, useEffect, useState } from 'react';
import { getSession, signIn, signOut, signUp, verifyFamilyMember } from '../lib/glucoboss-cloud';

type GateStatus = 'checking' | 'signed-out' | 'allowed' | 'unapproved';

export default function FamilyGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<GateStatus>('checking');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [createAccount, setCreateAccount] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [signedInEmail, setSignedInEmail] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const session = await getSession();
        if (!active) return;
        if (!session) { setStatus('signed-out'); return; }
        setSignedInEmail(session.user?.email || '');
        const approved = await verifyFamilyMember();
        if (active) setStatus(approved ? 'allowed' : 'unapproved');
      } catch (error) {
        if (active) { setNotice(error instanceof Error ? error.message : 'Could not verify family access.'); setStatus('signed-out'); }
      }
    })();
    return () => { active = false; };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice('');
    try {
      if (createAccount) {
        const session = await signUp(email, password);
        if (!session) {
          setNotice('Check your email to confirm your account, then return here and sign in. If the link opens elsewhere, return to this page.');
          setCreateAccount(false);
          return;
        }
      } else {
        await signIn(email, password);
      }
      setSignedInEmail(email.trim().toLowerCase());
      const approved = await verifyFamilyMember();
      setStatus(approved ? 'allowed' : 'unapproved');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to sign in.');
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    signOut();
    setPassword('');
    setStatus('signed-out');
    setNotice('');
  }

  if (status === 'checking') {
    return <main style={{ maxWidth: 480, margin: '15vh auto', padding: 24, textAlign: 'center', fontFamily: 'system-ui' }}>Verifying GLUCOBOSS family access…</main>;
  }

  if (status === 'unapproved') {
    return <main style={{ maxWidth: 480, margin: '12vh auto', padding: 28, fontFamily: 'system-ui', background: '#fff', borderRadius: 20, boxShadow: '0 12px 38px #10232f18' }}>
      <h1 style={{ color: '#10232f' }}>Family access pending</h1>
      <p>The account <strong>{signedInEmail}</strong> is signed in but has not been approved for Jazz's private GLUCOBOSS data.</p>
      <p>Ask the GLUCOBOSS administrator to add this email to the approved family list.</p>
      <button type="button" onClick={logout} style={buttonStyle}>Sign out</button>
    </main>;
  }

  if (status === 'signed-out') {
    return <main style={{ maxWidth: 440, margin: '8vh auto', padding: '32px 26px', fontFamily: 'system-ui', background: '#fff', borderRadius: 22, boxShadow: '0 12px 38px #10232f18' }}>
      <div style={{ fontSize: 26, fontWeight: 900, color: '#10232f' }}>GLUCO<span style={{ color: '#00a889' }}>BOSS</span></div>
      <p style={{ color: '#60727b', marginTop: 4 }}>Private family access</p>
      <h1 style={{ fontSize: 24, color: '#10232f', marginTop: 26 }}>{createAccount ? 'Create the family account' : 'Sign in to GLUCOBOSS'}</h1>
      <p style={{ color: '#60727b', fontSize: 14 }}>Use the approved family email. Insulin, food and CGM data are private to approved accounts.</p>
      <form onSubmit={submit}>
        <label htmlFor="familyEmail" style={labelStyle}>Email address</label>
        <input id="familyEmail" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} />
        <label htmlFor="familyPassword" style={labelStyle}>Password</label>
        <input id="familyPassword" type="password" autoComplete={createAccount ? 'new-password' : 'current-password'} required minLength={6} value={password} onChange={e => setPassword(e.target.value)} style={inputStyle} />
        {notice && <p role="alert" style={{ fontSize: 14, color: '#a43a1c', lineHeight: 1.5 }}>{notice}</p>}
        <button type="submit" disabled={busy} style={{ ...buttonStyle, opacity: busy ? .6 : 1, width: '100%', marginTop: 16 }}>{busy ? 'Please wait…' : createAccount ? 'Create account' : 'Sign in'}</button>
      </form>
      <button type="button" onClick={() => { setCreateAccount(!createAccount); setNotice(''); }} style={{ border: 0, background: 'transparent', color: '#087c70', cursor: 'pointer', marginTop: 18, fontWeight: 700 }}>
        {createAccount ? 'Already have an account? Sign in' : 'First time? Create the family account'}
      </button>
      <p style={{ fontSize: 12, color: '#71818a', marginTop: 24 }}>GLUCOBOSS is a prototype, not a replacement for CGM alarms or your diabetes care plan.</p>
    </main>;
  }

  return <>
    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, padding: '7px 18px', fontSize: 12, color: '#526873', background: '#eaf3f5' }}>
      <span>Family account {signedInEmail ? `· ${signedInEmail}` : ''}</span>
      <button type="button" onClick={logout} style={{ background: 'transparent', border: 0, textDecoration: 'underline', cursor: 'pointer', color: '#10232f' }}>Sign out</button>
    </div>
    {children}
  </>;
}

const labelStyle = { display: 'block', fontWeight: 700, color: '#10232f', marginTop: 15, marginBottom: 6, fontSize: 14 };
const inputStyle = { width: '100%', boxSizing: 'border-box' as const, padding: '13px 12px', border: '1px solid #b8c9d1', borderRadius: 10, fontSize: 16 };
const buttonStyle = { background: '#10232f', color: '#fff', padding: '13px 18px', border: 0, borderRadius: 12, fontSize: 15, fontWeight: 800, cursor: 'pointer' as const };
