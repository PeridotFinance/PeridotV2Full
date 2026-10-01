// Dev route for the cross-chain engine (lib/crosschain, /api/crosschain/*).
// It began as the SODAX spike, hence the path and the flag. Gated behind
// FEATURE_FLAGS.SODAX_SPIKE, so it is a 404 in production unless
// NEXT_PUBLIC_SODAX_SPIKE=true. Goes away in stage X7 once the Expert flows
// cover what it does.
import { notFound } from "next/navigation"
import { FEATURE_FLAGS } from "@/config/featureFlags"
import { CrossChainEngineDev } from "@/components/dev/CrossChainEngineDev"

export const metadata = { title: "Cross-chain engine (dev)", robots: { index: false, follow: false } }

export default function CrossChainEngineDevPage() {
  if (!FEATURE_FLAGS.SODAX_SPIKE) notFound()
  return (
    <div className="min-h-screen px-4 pb-8 pt-28">
      <CrossChainEngineDev />
    </div>
  )
}
