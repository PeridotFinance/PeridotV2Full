import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ephemeralShareStore } from '@/lib/ephemeralShareStore'

type Props = { params: { token: string; ref: string } }

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const payload = ephemeralShareStore.get(params.token)
  if (!payload) {
    return {
      title: 'Peridot Leaderboard',
      description: 'Share your Peridot leaderboard status',
      openGraph: {
        title: 'Peridot Leaderboard',
        description: 'Share your Peridot leaderboard status',
        images: [],
      },
      twitter: {
        card: 'summary_large_image',
        title: 'Peridot Leaderboard',
        description: 'Share your Peridot leaderboard status',
      },
    }
  }

  const title = `${payload.usernameOrAddr} — #${String(payload.rank)} on Peridot`
  const description = `I have ${payload.points.toLocaleString()} points (${payload.tierLabel}). Join me on Peridot!`
  const imageUrl = `/app/share/${params.token}/opengraph-image`
  const url = payload.referralUrl

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      url,
      images: [
        { url: imageUrl, width: 1200, height: 630, alt: 'Peridot Leaderboard' },
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

export default async function RefShareLanding({ params }: Props) {
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


