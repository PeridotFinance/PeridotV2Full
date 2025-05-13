import { ImageResponse } from 'next/og'

export const runtime = 'edge'

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          background: '#18181b',
          color: '#fff',
          fontSize: 48,
          fontWeight: 'bold',
        }}
      >
        <img
          src={process.env.NEXT_PUBLIC_OG_LOGO_URL || 'https://yourdomain.com/logo.svg'}
          width={120}
          height={120}
          style={{ marginBottom: 32 }}
          alt="Peridot Logo"
        />
        Peridot DeFi
        <div style={{ fontSize: 24, fontWeight: 400, marginTop: 16 }}>
          Cross-chain lending & borrowing
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  )
} 