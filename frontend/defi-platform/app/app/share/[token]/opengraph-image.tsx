import { ImageResponse } from 'next/og'
import { ephemeralShareStore } from '@/lib/ephemeralShareStore'
export const runtime = 'nodejs'
export const alt = 'Peridot Leaderboard Share'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image({ params }: { params: { token: string } }) {
  const token = params?.token
  const payload = ephemeralShareStore.get(token)

  if (!payload) {
    // Render a minimal fallback
    return new ImageResponse(
      (
        <div
          style={{
            height: '100%',
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#0f172a',
            color: '#e2e8f0',
            fontSize: 48,
            fontWeight: 700,
          }}
        >
          Peridot Leaderboard
        </div>
      ),
      { ...size }
    )
  }

  const medals = Array.isArray(payload.medals) ? payload.medals.slice(0, 16) : []

  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          padding: 40,
          background: 'linear-gradient(135deg, #0f172a 0%, #111827 100%)',
          color: '#e2e8f0',
          fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 56, fontWeight: 900 }}>Peridot Leaderboard</div>
          <div
            style={{
              background: 'rgba(16,185,129,0.9)',
              color: '#0b1220',
              padding: '10px 18px',
              borderRadius: 999,
              fontWeight: 800,
              fontSize: 28,
            }}
          >
            #{String(payload.rank)}
          </div>
        </div>

        <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 18 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 14px',
              background: 'rgba(255,255,255,0.06)',
              borderRadius: 999,
              fontSize: 26,
              fontWeight: 700,
            }}
          >
            <div style={{ color: '#a7f3d0' }}>Tier:</div>
            <div>{payload.tierLabel}</div>
          </div>
          <div style={{ fontSize: 26, color: '#94a3b8' }}>{payload.usernameOrAddr}</div>
        </div>

        <div style={{ marginTop: 30, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ color: '#93c5fd', fontSize: 28, fontWeight: 600 }}>Total Points</div>
            <div style={{ fontSize: 96, fontWeight: 900 }}>{payload.points.toLocaleString()}</div>
          </div>
        </div>

        {medals.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <div style={{ color: '#a3e635', fontSize: 22, fontWeight: 700, marginBottom: 12 }}>Badges</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 10 }}>
              {medals.map((m, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: 70,
                    borderRadius: 12,
                    background: 'rgba(255,255,255,0.10)',
                    border: '1px solid rgba(255,255,255,0.22)',
                  }}
                >
                  <div style={{ fontSize: 34 }}>{m.emoji}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#e5e7eb', marginTop: 4 }}>
                    {m.name.length > 12 ? m.name.slice(0, 12) + '…' : m.name}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginTop: 'auto', color: '#64748b', fontSize: 20 }}>peridot.finance — DeFi that just feels natural</div>
      </div>
    ),
    { ...size }
  )
}


