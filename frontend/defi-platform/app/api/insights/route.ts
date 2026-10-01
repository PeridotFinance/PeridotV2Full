import { NextResponse } from "next/server"
import { getInsightsArticles, isInsightsPath } from "@/lib/insights-data"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const rawPath = searchParams.get("path")
  const q = (searchParams.get("q") || "").trim().toLowerCase().slice(0, 120)
  const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit") || "20")))
  const path = rawPath && isInsightsPath(rawPath) ? rawPath : undefined

  const data = getInsightsArticles(path).filter((article) => {
    if (!q) return true
    return (
      article.title.toLowerCase().includes(q) ||
      article.excerpt.toLowerCase().includes(q) ||
      article.tags.some((tag) => tag.toLowerCase().includes(q))
    )
  })

  return NextResponse.json(
    {
      items: data.slice(0, limit),
      total: data.length,
    },
    {
      headers: {
        "Cache-Control": "public, max-age=30, s-maxage=30, stale-while-revalidate=60",
      },
    }
  )
}
