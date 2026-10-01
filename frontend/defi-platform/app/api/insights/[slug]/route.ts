import { NextResponse } from "next/server"
import { getInsightsArticleBySlug } from "@/lib/insights-data"

type Props = { params: Promise<{ slug: string }> }

export async function GET(_request: Request, { params }: Props) {
  const { slug } = await params
  if (!/^[a-z0-9-]{1,120}$/.test(slug)) {
    return NextResponse.json({ error: "Invalid slug" }, { status: 400 })
  }
  const article = getInsightsArticleBySlug(slug)
  if (!article) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  return NextResponse.json(article, {
    headers: {
      "Cache-Control": "public, max-age=120, s-maxage=120, stale-while-revalidate=240",
    },
  })
}
