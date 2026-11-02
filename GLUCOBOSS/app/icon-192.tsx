import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const size = { width: 192, height: 192 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#102e3c', borderRadius: 96, color: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 104, height: 104, borderRadius: 30, background: '#164658', border: '4px solid #49e5b1', position: 'relative' }}>
        <svg width="88" height="53" viewBox="0 0 235 140" fill="none">
          <path d="M7 80 H53 L78 80 L105 20 L140 120 L171 73 H209" stroke="#ffffff" strokeWidth="17" strokeLinecap="round" strokeLinejoin="round"/>
          <circle cx="214" cy="73" r="17" fill="#49e5b1"/>
        </svg>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', marginTop: 9, fontSize: 19, fontWeight: 900, letterSpacing: -1 }}>
        <span>GLUCO</span><span style={{ color: '#49e5b1' }}>BOSS</span>
      </div>
    </div>,
    { ...size },
  );
}
