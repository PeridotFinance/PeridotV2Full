/**
 * Server-only DB-backed insights data layer.
 * Reads from blog_posts where insights_data IS NOT NULL.
 * Mirrors the helper signatures from lib/insights-data.ts but async.
 */

import { sql } from "@/lib/database"
import type {
  InsightsArticle,
  InsightsChapterMeta,
  InsightsPath,
  InsightsBlock,
} from "@/lib/insights-data"

// ── Raw DB row shape ──────────────────────────────────────────────────────────

interface InsightsDataJson {
  path?: InsightsPath
  chapter?: { slug: string; title: string; order: number }
  lesson?: { order: number }
  sections?: Array<{ heading: string; sentences: string[]; callout?: string }>
  // Pre-assembled block array (sections + interactive blocks merged in order).
  // When present, used directly. Falls back to sectionsToBlocks(sections) for
  // articles created before this field was introduced.
  blocks?: InsightsBlock[]
  difficulty?: string
  liveAsset?: string
  ctaLabel?: string
  ctaHref?: string
  peridotRelevance?: string
  actionArticleSuggestion?: { title: string; slug: string } | null
}

interface BlogPostRow {
  id: number
  slug: string
  title: string
  excerpt: string
  cover_image_url: string | null
  reading_time_minutes: number
  published_at: string | null
  tags: string[]
  insights_data: InsightsDataJson
}

// ── Mapper ────────────────────────────────────────────────────────────────────

function sectionsToBlocks(
  sections: Array<{ heading: string; sentences: string[]; callout?: string }>
): InsightsBlock[] {
  return sections.flatMap((section) => [
    { type: "heading" as const, text: section.heading },
    ...section.sentences.map((s) => ({ type: "paragraph" as const, text: s })),
    ...(section.callout ? [{ type: "callout" as const, text: section.callout }] : []),
  ])
}

function rowToInsightsArticle(row: BlogPostRow): InsightsArticle | null {
  const d = row.insights_data
  if (!d?.path || !d?.chapter || !d?.lesson) return null

  const allowedPaths: InsightsPath[] = ["starter", "yield", "risk", "market", "action"]
  if (!allowedPaths.includes(d.path)) return null

  const difficulty = (["beginner", "intermediate", "advanced"] as const).includes(
    d.difficulty as any
  )
    ? (d.difficulty as "beginner" | "intermediate" | "advanced")
    : "beginner"

  const liveAsset = (["ETH", "BTC", "SOL", "USDC"] as const).includes(d.liveAsset as any)
    ? (d.liveAsset as "ETH" | "BTC" | "SOL" | "USDC")
    : "ETH"

  const sections = Array.isArray(d.sections) ? d.sections : []
  const blocks: InsightsBlock[] = Array.isArray(d.blocks) && d.blocks.length > 0
    ? d.blocks
    : sectionsToBlocks(sections)

  return {
    id: `db_${row.id}`,
    slug: row.slug,
    path: d.path,
    chapter: {
      slug: d.chapter.slug,
      title: d.chapter.title,
      order: d.chapter.order,
    },
    lesson: { order: d.lesson.order },
    title: row.title,
    excerpt: row.excerpt,
    coverImage: row.cover_image_url ?? "/Owl Mascot - Mint Green.svg",
    difficulty,
    readTimeMin: row.reading_time_minutes ?? 5,
    publishedAt: row.published_at ?? new Date().toISOString(),
    tags: Array.isArray(row.tags) ? row.tags : [],
    liveAsset,
    ctaLabel: d.ctaLabel ?? "Open in App",
    ctaHref: d.ctaHref ?? "/app",
    blocks,
    peridotRelevance: (["high", "medium", "low", "none"] as const).includes(d.peridotRelevance as any)
      ? (d.peridotRelevance as "high" | "medium" | "low" | "none")
      : undefined,
    actionArticleSuggestion: d.actionArticleSuggestion?.title && d.actionArticleSuggestion?.slug
      ? { title: d.actionArticleSuggestion.title, slug: d.actionArticleSuggestion.slug }
      : null,
  }
}

// ── Queries ───────────────────────────────────────────────────────────────────

export async function getAllInsightsArticlesFromDB(): Promise<InsightsArticle[]> {
  const rows = await sql<BlogPostRow[]>`
    SELECT id, slug, title, excerpt, cover_image_url, reading_time_minutes,
           published_at, tags, insights_data
    FROM blog_posts
    WHERE insights_data IS NOT NULL
      AND status = 'published'
    ORDER BY published_at ASC
  `
  return rows.flatMap((r) => {
    const a = rowToInsightsArticle(r)
    return a ? [a] : []
  })
}

export async function getInsightsArticleBySlugFromDB(
  slug: string
): Promise<InsightsArticle | null> {
  const rows = await sql<BlogPostRow[]>`
    SELECT id, slug, title, excerpt, cover_image_url, reading_time_minutes,
           published_at, tags, insights_data
    FROM blog_posts
    WHERE slug = ${slug}
      AND insights_data IS NOT NULL
      AND status = 'published'
    LIMIT 1
  `
  if (!rows.length) return null
  return rowToInsightsArticle(rows[0])
}

async function getInsightsArticlesByPathFromDB(
  path: InsightsPath
): Promise<InsightsArticle[]> {
  const rows = await sql<BlogPostRow[]>`
    SELECT id, slug, title, excerpt, cover_image_url, reading_time_minutes,
           published_at, tags, insights_data
    FROM blog_posts
    WHERE insights_data IS NOT NULL
      AND status = 'published'
      AND insights_data->>'path' = ${path}
    ORDER BY published_at ASC
  `
  return rows.flatMap((r) => {
    const a = rowToInsightsArticle(r)
    return a ? [a] : []
  })
}

export async function getChaptersByPathFromDB(
  path: InsightsPath
): Promise<InsightsChapterMeta[]> {
  const articles = await getInsightsArticlesByPathFromDB(path)

  const chapterMap = new Map<string, InsightsChapterMeta>()
  for (const article of articles) {
    if (!chapterMap.has(article.chapter.slug)) {
      chapterMap.set(article.chapter.slug, {
        slug: article.chapter.slug,
        title: article.chapter.title,
        order: article.chapter.order,
        path,
        lessons: [],
      })
    }
    chapterMap.get(article.chapter.slug)!.lessons.push(article)
  }

  for (const chapter of chapterMap.values()) {
    chapter.lessons.sort((a, b) => a.lesson.order - b.lesson.order)
  }

  return Array.from(chapterMap.values()).sort((a, b) => a.order - b.order)
}

export async function getPrevLessonFromDB(
  article: InsightsArticle
): Promise<InsightsArticle | null> {
  const chapters = await getChaptersByPathFromDB(article.path)
  const chapterIdx = chapters.findIndex((c) => c.slug === article.chapter.slug)
  if (chapterIdx < 0) return null
  const chapter = chapters[chapterIdx]
  const lessonIdx = chapter.lessons.findIndex((l) => l.slug === article.slug)

  if (lessonIdx > 0) return chapter.lessons[lessonIdx - 1]
  if (chapterIdx > 0) return chapters[chapterIdx - 1].lessons.at(-1) ?? null
  return null
}

export async function getNextLessonFromDB(
  article: InsightsArticle
): Promise<InsightsArticle | null> {
  const chapters = await getChaptersByPathFromDB(article.path)
  const chapterIdx = chapters.findIndex((c) => c.slug === article.chapter.slug)
  if (chapterIdx < 0) return null
  const chapter = chapters[chapterIdx]
  const lessonIdx = chapter.lessons.findIndex((l) => l.slug === article.slug)

  if (lessonIdx < chapter.lessons.length - 1) return chapter.lessons[lessonIdx + 1]
  if (chapterIdx < chapters.length - 1) return chapters[chapterIdx + 1].lessons[0] ?? null
  return null
}
