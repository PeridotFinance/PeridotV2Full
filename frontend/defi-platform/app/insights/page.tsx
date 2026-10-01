import type { Metadata } from "next"
import { InsightsHubClient } from "@/components/insights/InsightsHubClient"
import { getAllInsightsArticlesFromDB } from "@/lib/insights-db"

export const metadata: Metadata = {
  title: "Peridot Insights | DeFi Content Hub",
  description: "Interactive DeFi guides, risk analysis, and market insights with a direct path into the Peridot app.",
  alternates: { canonical: "/insights" },
  openGraph: {
    title: "Peridot Insights",
    description: "Interactive DeFi guides and data-driven learning paths.",
    url: "/insights",
  },
}

export default async function InsightsHubPage() {
  const articles = await getAllInsightsArticlesFromDB().catch(() => [])
  return <InsightsHubClient articles={articles} />
}
