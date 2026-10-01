// Every state of the Expert cross-chain supply (stage X3) with made-up numbers,
// for review and handbook captures without a wallet. Same gate as /app/sodax.
import { notFound } from "next/navigation"
import { FEATURE_FLAGS } from "@/config/featureFlags"
import { CrossChainSupplyPreview } from "@/components/dev/CrossChainSupplyPreview"

export const metadata = { title: "Cross-chain supply preview", robots: { index: false, follow: false } }

export default function CrossChainSupplyPreviewPage() {
  if (!FEATURE_FLAGS.SODAX_SPIKE) notFound()
  return (
    <div className="min-h-screen px-4 pb-8 pt-28">
      <CrossChainSupplyPreview />
    </div>
  )
}
