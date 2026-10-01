/**
 * POST /api/blog/generate-insight
 *
 * Non-streaming, single-article insights generation endpoint.
 * Runs the full pipeline (topic plan → base info → insights content →
 * meta → FAQ → cover image → fact check) and saves to DB in one shot.
 *
 * Designed to be called from the batch CLI script on a developer Mac.
 * Auth: x-admin-password header (same as other protected blog routes).
 */

import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/database"
import { revalidatePath } from "next/cache"
import { generateKieImage, downloadImage } from "@/lib/kie-image-generator"
import { uploadCoverImage } from "@/lib/firebase-storage"
import { factCheckArticle } from "@/lib/fact-checker"
import { assertProtectedBlogWrite } from "../_lib/security"
import {
  generateTopicPlan,
  generateBaseInfo,
  generateInsightsArticleContent,
  generateMetaInfo,
  generateFAQ,
  type InsightsPath,
  type FunnelStage,
  type BaseInfo,
} from "../generate-helpers"

// Allow up to 5 minutes — full pipeline including image gen + fact check
export const maxDuration = 300

// ── Types ────────────────────────────────────────────────────────────────────

export type GenerateInsightInput = {
  /** Article title / topic */
  title: string
  /** Which learning path */
  insightsPath: InsightsPath
  /** Chapter this lesson belongs to */
  chapterTitle: string
  chapterSlug?: string
  chapterOrder: number
  lessonOrder: number
  /** Optional overrides — if omitted, AI picks them */
  funnelStage?: FunnelStage
  peridotCta?: string
  peridotRelevance?: "high" | "medium" | "low" | "none"
  /** Save as draft or published */
  status?: "draft" | "published"
  /** If true, run full pipeline but skip DB write */
  dryRun?: boolean
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function wordCount(md: string): number {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ").length
}

// ── Handler ──────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const denied = assertProtectedBlogWrite(request)
  if (denied) return denied

  let input: GenerateInsightInput
  try {
    input = (await request.json()) as GenerateInsightInput
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { title, insightsPath, chapterTitle, chapterOrder, lessonOrder, status = "draft", dryRun = false } = input

  if (!title?.trim()) return NextResponse.json({ error: "title is required" }, { status: 400 })
  if (!insightsPath) return NextResponse.json({ error: "insightsPath is required" }, { status: 400 })
  if (!chapterTitle?.trim()) return NextResponse.json({ error: "chapterTitle is required" }, { status: 400 })

  const log: string[] = []
  const step = (msg: string) => { log.push(msg); console.log(`[generate-insight] ${msg}`) }

  try {
    // ── 1. Topic plan ─────────────────────────────────────────────────────
    step("1/7 Topic plan…")
    // Mirror generate-stream: path suffix gives AI the right validation context
    const topicPlan = await generateTopicPlan(`${title} (${insightsPath} insights path)`)
    if (!topicPlan.proceedWithGeneration) {
      return NextResponse.json({
        error: topicPlan.validation?.rejectionReason ?? "Topic rejected",
        topicPlan,
        log,
      }, { status: 422 })
    }

    // ── 2. Base info (title, slug, excerpt, funnelStage, peridotCta, …) ──
    step("2/7 Base info…")
    // Mirror generate-stream: path suffix tunes slug/tags/tone/funnelStage to path
    const baseInfo: BaseInfo = await generateBaseInfo(`${title} - ${insightsPath} insights`, topicPlan)

    // Apply caller overrides (Sheet data takes precedence over AI guess)
    if (input.funnelStage) baseInfo.funnelStage = input.funnelStage
    if (input.peridotCta) baseInfo.peridotCta = input.peridotCta
    if (input.peridotRelevance) baseInfo.peridotRelevance = input.peridotRelevance

    // ── 3. Insights article content ───────────────────────────────────────
    step(`3/7 Insights content (path=${insightsPath}, ch=${chapterOrder}, lesson=${lessonOrder})…`)
    const insightsInfo = await generateInsightsArticleContent(baseInfo, insightsPath, {
      title: chapterTitle,
      chapterOrder,
      lessonOrder,
    })

    // ── 4. SEO meta ───────────────────────────────────────────────────────
    step("4/7 Meta info…")
    const metaInfo = await generateMetaInfo(baseInfo, { content: insightsInfo.content })

    // ── 5. FAQ ────────────────────────────────────────────────────────────
    step("5/7 FAQ…")
    const { faq } = await generateFAQ(baseInfo, { content: insightsInfo.content })

    // ── 6. Cover image ────────────────────────────────────────────────────
    step("6/7 Cover image…")
    let coverImageUrl: string | null = null
    try {
      const kieUrl = await generateKieImage(baseInfo.title, baseInfo.excerpt, baseInfo.category)
      const buf = await downloadImage(kieUrl)
      coverImageUrl = await uploadCoverImage(buf, baseInfo.slug)
      step(`   → ${coverImageUrl}`)
    } catch (err) {
      step(`   ⚠ Cover image failed (skipped): ${err instanceof Error ? err.message : String(err)}`)
    }

    // ── 7. Fact check ─────────────────────────────────────────────────────
    step("7/7 Fact check…")
    let factCheck = null
    try {
      factCheck = await factCheckArticle(insightsInfo.content, baseInfo.title)
      step(`   → ${factCheck.verified}/${factCheck.totalClaims} verified, status=${factCheck.overallStatus}`)
    } catch (err) {
      step(`   ⚠ Fact check failed (skipped): ${err instanceof Error ? err.message : String(err)}`)
    }

    // ── Build insightsData payload ─────────────────────────────────────────
    const chapterSlug = input.chapterSlug ?? slugify(chapterTitle)
    const insightsData = {
      path: insightsInfo.path,
      sections: insightsInfo.sections,
      funnelStage: baseInfo.funnelStage,
      peridotCta: baseInfo.peridotCta,
      ctaLabel: baseInfo.peridotCta,
      ctaHref: "/app",
      peridotRelevance: baseInfo.peridotRelevance,
      actionArticleSuggestion: baseInfo.actionArticleSuggestion,
      chapter: { slug: chapterSlug, title: chapterTitle, order: chapterOrder },
      lesson: { order: lessonOrder },
    }

    if (dryRun) {
      step("DRY RUN — skipping DB write")
      return NextResponse.json({
        dryRun: true,
        slug: baseInfo.slug,
        title: baseInfo.title,
        excerpt: baseInfo.excerpt,
        funnelStage: baseInfo.funnelStage,
        peridotCta: baseInfo.peridotCta,
        sections: insightsInfo.sections.length,
        coverImageUrl,
        factCheck: factCheck ? { status: factCheck.overallStatus, verified: factCheck.verified, total: factCheck.totalClaims } : null,
        log,
      })
    }

    // ── Save to DB ────────────────────────────────────────────────────────
    step("Saving to DB…")
    const wc = wordCount(insightsInfo.content)
    const readingTime = Math.max(1, Math.round(wc / 200))
    const publishedAt = status === "published" ? new Date().toISOString() : null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tags = sql.array(baseInfo.tags ?? []) as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const metaKeywords = sql.array(baseInfo.keywords ?? []) as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const faqJson = (faq?.length ? faq : null) as any
    const finalCoverUrl = coverImageUrl ?? "/Owl Mascot - Mint Green.svg"

    // postgres.js needs a plain unknown for JSONB — cast to satisfy overloads
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const insightsDataParam = insightsData as any
    const rows = await sql`
      INSERT INTO blog_posts (
        slug, status, published_at, title, excerpt, content_md,
        word_count, reading_time_minutes,
        author_name, category, tags,
        cover_image_url, og_image_url,
        meta_title, meta_description, meta_keywords, canonical_url, meta_robots,
        faq, insights_data
      ) VALUES (
        ${baseInfo.slug}, ${status}, ${publishedAt},
        ${baseInfo.title}, ${baseInfo.excerpt}, ${insightsInfo.content},
        ${wc}, ${readingTime},
        ${"Peridot.Finance"}, ${baseInfo.category ?? "Education"}, ${tags},
        ${finalCoverUrl}, ${finalCoverUrl},
        ${metaInfo.metaTitle ?? baseInfo.title},
        ${metaInfo.metaDescription ?? baseInfo.excerpt},
        ${metaKeywords}, ${metaInfo.canonicalUrl ?? null},
        ${metaInfo.metaRobots ?? "index,follow"},
        ${faqJson}, ${insightsDataParam}
      )
      ON CONFLICT (slug) DO UPDATE SET
        title              = EXCLUDED.title,
        excerpt            = EXCLUDED.excerpt,
        content_md         = EXCLUDED.content_md,
        word_count         = EXCLUDED.word_count,
        reading_time_minutes = EXCLUDED.reading_time_minutes,
        cover_image_url    = EXCLUDED.cover_image_url,
        og_image_url       = EXCLUDED.og_image_url,
        meta_title         = EXCLUDED.meta_title,
        meta_description   = EXCLUDED.meta_description,
        meta_keywords      = EXCLUDED.meta_keywords,
        faq                = EXCLUDED.faq,
        insights_data      = EXCLUDED.insights_data,
        updated_at         = NOW()
      RETURNING id, slug, title
    `

    const saved = rows[0]
    step(`✓ Saved: id=${saved.id} slug=${saved.slug}`)

    try { revalidatePath("/insights") } catch { /* non-critical */ }

    return NextResponse.json({
      success: true,
      id: saved.id,
      slug: saved.slug,
      title: saved.title,
      funnelStage: baseInfo.funnelStage,
      peridotCta: baseInfo.peridotCta,
      sections: insightsInfo.sections.length,
      coverImageUrl,
      factCheck: factCheck
        ? { status: factCheck.overallStatus, verified: factCheck.verified, total: factCheck.totalClaims }
        : null,
      log,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[generate-insight] Fatal:", err)
    return NextResponse.json({ error: msg, log }, { status: 500 })
  }
}
