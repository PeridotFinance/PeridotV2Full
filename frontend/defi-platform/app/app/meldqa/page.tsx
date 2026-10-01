// THROWAWAY dev route — Meld onramp QA harness.
// Gated behind FEATURE_FLAGS.FIAT_ONRAMP_MELD_PROBE so it's a 404 in prod.
// Delete this route + components/dev/MeldQa.tsx once QA is signed off.
import { notFound } from 'next/navigation'
import { FEATURE_FLAGS } from '@/config/featureFlags'
import { MeldQa } from '@/components/dev/MeldQa'

export const metadata = { title: 'Meld QA (dev)', robots: { index: false, follow: false } }

export default function MeldQaPage() {
  if (!FEATURE_FLAGS.FIAT_ONRAMP_MELD_PROBE) notFound()
  return (
    <div className="min-h-screen px-4 py-8">
      <MeldQa />
    </div>
  )
}
