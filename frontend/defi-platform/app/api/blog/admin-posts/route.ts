import { NextResponse } from "next/server"
import { sql } from "@/lib/database"

type PostStatus = "draft" | "published"
type AdminPostSummary = {
  id: number
  slug: string
  title: string
  excerpt?: string | null
  status: PostStatus
  category?: string | null
  /** true when insights_data IS NOT NULL — used for the Blog / Insight type badge */
  hasInsights: boolean
  publishedAt?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  // Insights curriculum metadata (null for blog posts)
  insightsPath?: string | null
  insightsChapterOrder?: number | null
  insightsChapterTitle?: string | null
  insightsLessonOrder?: number | null
}

function parseStatusFilter(raw: string | null): PostStatus | null {
  if (raw === "draft" || raw === "published") return raw
  return null
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const statusFilter = parseStatusFilter(searchParams.get("status"))
    const query = (searchParams.get("q") || "").trim()
    const limitRaw = Number(searchParams.get("limit") || 200)
    const limit = Number.isFinite(limitRaw) ? Math.max(20, Math.min(500, Math.trunc(limitRaw))) : 200

    const like = `%${query}%`
    let rows: AdminPostSummary[] = []

    if (statusFilter && query) {
      rows = (await sql`
        SELECT
          id,
          slug,
          title,
          excerpt,
          status,
          category,
          (insights_data IS NOT NULL) as "hasInsights",
          published_at as "publishedAt",
          created_at as "createdAt",
          updated_at as "updatedAt",
          insights_data->>'path' as "insightsPath",
          (insights_data->'chapter'->>'order')::int as "insightsChapterOrder",
          insights_data->'chapter'->>'title' as "insightsChapterTitle",
          (insights_data->'lesson'->>'order')::int as "insightsLessonOrder"
        FROM blog_posts
        WHERE status = ${statusFilter}
          AND (title ILIKE ${like} OR slug ILIKE ${like} OR excerpt ILIKE ${like})
        ORDER BY updated_at DESC NULLS LAST, created_at DESC
        LIMIT ${limit}
      `) as AdminPostSummary[]
    } else if (statusFilter) {
      rows = (await sql`
        SELECT
          id,
          slug,
          title,
          excerpt,
          status,
          category,
          (insights_data IS NOT NULL) as "hasInsights",
          published_at as "publishedAt",
          created_at as "createdAt",
          updated_at as "updatedAt",
          insights_data->>'path' as "insightsPath",
          (insights_data->'chapter'->>'order')::int as "insightsChapterOrder",
          insights_data->'chapter'->>'title' as "insightsChapterTitle",
          (insights_data->'lesson'->>'order')::int as "insightsLessonOrder"
        FROM blog_posts
        WHERE status = ${statusFilter}
        ORDER BY updated_at DESC NULLS LAST, created_at DESC
        LIMIT ${limit}
      `) as AdminPostSummary[]
    } else if (query) {
      rows = (await sql`
        SELECT
          id,
          slug,
          title,
          excerpt,
          status,
          category,
          (insights_data IS NOT NULL) as "hasInsights",
          published_at as "publishedAt",
          created_at as "createdAt",
          updated_at as "updatedAt",
          insights_data->>'path' as "insightsPath",
          (insights_data->'chapter'->>'order')::int as "insightsChapterOrder",
          insights_data->'chapter'->>'title' as "insightsChapterTitle",
          (insights_data->'lesson'->>'order')::int as "insightsLessonOrder"
        FROM blog_posts
        WHERE title ILIKE ${like} OR slug ILIKE ${like} OR excerpt ILIKE ${like}
        ORDER BY updated_at DESC NULLS LAST, created_at DESC
        LIMIT ${limit}
      `) as AdminPostSummary[]
    } else {
      rows = (await sql`
        SELECT
          id,
          slug,
          title,
          excerpt,
          status,
          category,
          (insights_data IS NOT NULL) as "hasInsights",
          published_at as "publishedAt",
          created_at as "createdAt",
          updated_at as "updatedAt",
          insights_data->>'path' as "insightsPath",
          (insights_data->'chapter'->>'order')::int as "insightsChapterOrder",
          insights_data->'chapter'->>'title' as "insightsChapterTitle",
          (insights_data->'lesson'->>'order')::int as "insightsLessonOrder"
        FROM blog_posts
        ORDER BY updated_at DESC NULLS LAST, created_at DESC
        LIMIT ${limit}
      `) as AdminPostSummary[]
    }

    return NextResponse.json({ posts: rows })
  } catch (error) {
    console.error("Error fetching admin blog posts:", error)
    return NextResponse.json({ error: "Failed to fetch admin blog posts" }, { status: 500 })
  }
}
