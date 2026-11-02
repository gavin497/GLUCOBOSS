import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export async function GET(_request: Request, { params }: { params: { size: string } }) {
  const pixels = params.size === '192' ? 192 : params.size === '512' ? 512 : null;
  if (!pixels) return new Response('Not found', { status: 404 });
  const scale = pixels / 512;
  return new ImageResponse(
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#102e3c', color: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 278 * scale, height: 278 * scale, borderRadius: 80 * scale, background: '#164658', border: `${9 * scale}px solid #49e5b1` }}>
        <svg width={235 * scale} height={140 * scale} viewBox="0 0 235 140" fill="none">
          <path d="M7 80 H53 L78 80 L105 20 L140 120 L171 73 H209" stroke="#ffffff" strokeWidth="17" strokeLinecap="round" strokeLinejoin="round"/>
          <circle cx="214" cy="73" r="17" fill="#49e5b1"/>
        </svg>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', marginTop: 24 * scale, fontSize: 53 * scale, fontWeight: 900, letterSpacing: -3 * scale }}>
        <span>GLUCO</span><span style={{ color: '#49e5b1' }}>BOSS</span>
      </div>
    </div>,
    { width: pixels, height: pixels },
  );
}
