// THROWAWAY dev route — Meld onramp capability probe (plan §3).
// Gated behind FEATURE_FLAGS.FIAT_ONRAMP_MELD_PROBE so it's a 404 in prod.
// Delete this route, components/dev/MeldProbe.tsx, and the flag once done.
import { notFound } from 'next/navigation'
import { FEATURE_FLAGS } from '@/config/featureFlags'
import { MeldProbe } from '@/components/dev/MeldProbe'

export const metadata = { title: 'Meld probe (dev)', robots: { index: false, follow: false } }

export default function MeldTestPage() {
  if (!FEATURE_FLAGS.FIAT_ONRAMP_MELD_PROBE) notFound()
  return (
    <div className="min-h-screen px-4 py-8">
      <MeldProbe />
    </div>
  )
}
