import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ephemeralShareStore } from '@/lib/ephemeralShareStore'

type Props = { params: { token: string } }

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const payload = ephemeralShareStore.get(params.token)
  if (!payload) {
    return {
        title: 'Peridot Leaderboard — Compete in Cross-Chain Lending',
        description: 'Track your progress, share your rank, and challenge others in the Peridot leaderboard — the gameified cross-chain lending experience.',
      openGraph: {
        title: 'Peridot Leaderboard — Compete in Cross-Chain Lending',
        description: 'Track your progress, share your rank, and challenge others in the Peridot gamified cross-chain lending leaderboard.',
        images: [],
      },
      twitter: {
        card: 'summary_large_image',
        title: 'Peridot Leaderboard — Compete in Cross-Chain Lending',
        description: 'Track your progress, share your rank, and challenge others in the Peridot gamified cross-chain lending leaderboard.',
      },
    }
  }

  const title = `${payload.usernameOrAddr} — Ranked #${payload.rank} on Peridot Leaderboard`
  const description = `${payload.usernameOrAddr} has ${payload.points.toLocaleString()} points and is ranked #${payload.rank} (${payload.tierLabel}) on Peridot — the cross-chain lending leaderboard. Compete, climb, and earn.`

  const imageUrl = `/app/share/${params.token}/opengraph-image`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      url: payload.referralUrl,
      images: [
        { url: imageUrl, width: 1200, height: 630, alt: `Leaderboard rank badge for ${payload.usernameOrAddr} on Peridot`
    },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [imageUrl],
    },
  }
}

export default async function ShareLanding({ params }: Props) {
  const payload = ephemeralShareStore.get(params.token)
  if (!payload) notFound()
  return (
    <html>
      <body>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh',
          background: 'linear-gradient(135deg, #0f172a 0%, #111827 100%)', color: '#e2e8f0'
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 22, opacity: 0.9 }}>Preparing your share card…</div>
            <div style={{ marginTop: 10, fontSize: 14, opacity: 0.7 }}>You will be redirected shortly</div>
          </div>
        </div>
        <script dangerouslySetInnerHTML={{ __html: `setTimeout(function(){ location.replace(${JSON.stringify(payload.referralUrl)}); }, 2000);` }} />
      </body>
    </html>
  )
}


