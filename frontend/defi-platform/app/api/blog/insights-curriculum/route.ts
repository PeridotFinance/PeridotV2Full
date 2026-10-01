import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/database"

export type CurriculumLesson = {
  slug: string
  title: string
  lessonOrder: number
  status: "draft" | "published"
}

export type CurriculumChapter = {
  slug: string
  title: string
  order: number
  lessons: CurriculumLesson[]
}

const ALLOWED_PATHS = ["starter", "yield", "risk", "market", "action"] as const

export async function GET(request: NextRequest) {
  const path = request.nextUrl.searchParams.get("path")
  if (!path || !(ALLOWED_PATHS as readonly string[]).includes(path)) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 })
  }

  try {
    const rows = await sql<
      {
        slug: string
        title: string
        status: string
        chapterSlug: string
        chapterTitle: string
        chapterOrder: number
        lessonOrder: number
      }[]
    >`
      SELECT
        slug,
        title,
        status,
        insights_data->'chapter'->>'slug'          AS "chapterSlug",
        insights_data->'chapter'->>'title'         AS "chapterTitle",
        (insights_data->'chapter'->>'order')::int  AS "chapterOrder",
        (insights_data->'lesson'->>'order')::int   AS "lessonOrder"
      FROM blog_posts
      WHERE insights_data IS NOT NULL
        AND insights_data->>'path' = ${path}
      ORDER BY
        (insights_data->'chapter'->>'order')::int ASC,
        (insights_data->'lesson'->>'order')::int ASC
    `

    // Group into chapters
    const chapterMap = new Map<string, CurriculumChapter>()
    for (const row of rows) {
      if (!row.chapterSlug) continue
      if (!chapterMap.has(row.chapterSlug)) {
        chapterMap.set(row.chapterSlug, {
          slug: row.chapterSlug,
          title: row.chapterTitle ?? row.chapterSlug,
          order: row.chapterOrder ?? 0,
          lessons: [],
        })
      }
      chapterMap.get(row.chapterSlug)!.lessons.push({
        slug: row.slug,
        title: row.title,
        lessonOrder: row.lessonOrder ?? 0,
        status: row.status === "published" ? "published" : "draft",
      })
    }

    const chapters = Array.from(chapterMap.values()).sort((a, b) => a.order - b.order)
    return NextResponse.json({ chapters })
  } catch (error) {
    console.error("Error fetching insights curriculum:", error)
    return NextResponse.json({ error: "Failed to fetch curriculum" }, { status: 500 })
  }
}
