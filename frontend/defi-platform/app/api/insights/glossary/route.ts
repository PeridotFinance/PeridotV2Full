import { NextResponse } from "next/server"
import { getGlossaryTerm } from "@/lib/insights-data"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const term = searchParams.get("term")?.trim().slice(0, 80)
  if (!term) {
    return NextResponse.json({ error: "Missing term query parameter" }, { status: 400 })
  }

  const glossaryTerm = getGlossaryTerm(term)
  if (!glossaryTerm) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  return NextResponse.json(glossaryTerm, {
    headers: {
      "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=600",
    },
  })
}
