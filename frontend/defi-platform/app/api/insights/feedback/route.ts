import { createHash } from "crypto"
import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/database"
import { getInsightsArticleById, getInsightsArticleBySlug } from "@/lib/insights-data"

const ALLOWED_REACTIONS = new Set(["love", "helpful", "neutral", "unclear"])
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX_EVENTS = 20

type Aggregate = Record<"love" | "helpful" | "neutral" | "unclear", number>

const aggregateCache = new Map<string, { aggregate: Aggregate; total: number; cachedAt: number }>()
const aggregateCacheTtlMs = 15_000
const rateLimitStore = new Map<string, { windowStart: number; count: number }>()
let ensureFeedbackTablePromise: Promise<void> | null = null

function normalizeSessionId(value: unknown): string | null {
  if (typeof value !== "string") return null
  const next = value.trim()
  if (!next) return null
  return next.slice(0, 128)
}

function normalizeArticleId(value: unknown): string | null {
  if (typeof value !== "string") return null
  const next = value.trim()
  if (!/^[a-z0-9_\-]{1,80}$/i.test(next)) return null
  return next
}

function normalizeArticleSlug(value: unknown): string | null {
  if (typeof value !== "string") return null
  const next = value.trim()
  if (!next) return null
  if (!/^[a-z0-9-]{1,120}$/i.test(next)) return null
  return next.toLowerCase()
}

function hashIp(ipRaw: string | null): string | null {
  if (!ipRaw) return null
  const ip = ipRaw.split(",")[0]?.trim()
  if (!ip) return null
  return createHash("sha256").update(ip).digest("hex")
}

function getRequestOriginHost(request: NextRequest): string | null {
  const origin = request.headers.get("origin")
  if (!origin) return null
  try {
    return new URL(origin).host.toLowerCase()
  } catch {
    return null
  }
}

function isAllowedOrigin(request: NextRequest): boolean {
  const originHost = getRequestOriginHost(request)
  if (!originHost) return true

  const requestHost = request.headers.get("host")?.toLowerCase() || ""
  if (originHost === requestHost) return true

  const baseUrl = process.env.NEXT_PUBLIC_APP_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || ""
  if (baseUrl) {
    try {
      const allowedHost = new URL(baseUrl).host.toLowerCase()
      if (originHost === allowedHost) return true
    } catch {
      // Ignore malformed env values.
    }
  }

  return false
}

function enforceRateLimit(key: string) {
  const now = Date.now()
  const current = rateLimitStore.get(key)
  if (!current || now - current.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitStore.set(key, { windowStart: now, count: 1 })
    return { allowed: true, remaining: RATE_LIMIT_MAX_EVENTS - 1 }
  }

  current.count += 1
  rateLimitStore.set(key, current)
  return { allowed: current.count <= RATE_LIMIT_MAX_EVENTS, remaining: Math.max(0, RATE_LIMIT_MAX_EVENTS - current.count) }
}

async function ensureFeedbackTable() {
  if (!ensureFeedbackTablePromise) {
    ensureFeedbackTablePromise = sql
      .unsafe(`
        CREATE TABLE IF NOT EXISTS insights_article_feedback (
          id BIGSERIAL PRIMARY KEY,
          article_id TEXT NOT NULL,
          article_slug TEXT,
          reaction TEXT NOT NULL,
          session_id TEXT NOT NULL,
          user_agent TEXT,
          ip_hash TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_insights_feedback_article_session
          ON insights_article_feedback (article_id, session_id);
        CREATE INDEX IF NOT EXISTS idx_insights_feedback_article_id
          ON insights_article_feedback (article_id);
        CREATE INDEX IF NOT EXISTS idx_insights_feedback_reaction
          ON insights_article_feedback (reaction);
      `)
      .then(() => undefined)
      .catch((error) => {
        ensureFeedbackTablePromise = null
        throw error
      })
  }

  await ensureFeedbackTablePromise
}

async function fetchAggregate(articleId: string, forceFresh = false) {
  const cached = aggregateCache.get(articleId)
  const now = Date.now()
  if (!forceFresh && cached && now - cached.cachedAt < aggregateCacheTtlMs) {
    return { aggregate: cached.aggregate, total: cached.total }
  }

  const rows = await sql<{ reaction: string; count: number }[]>`
    SELECT reaction, COUNT(*)::int AS count
    FROM insights_article_feedback
    WHERE article_id = ${articleId}
    GROUP BY reaction
  `

  const aggregate: Aggregate = { love: 0, helpful: 0, neutral: 0, unclear: 0 }
  for (const row of rows) {
    if (Object.prototype.hasOwnProperty.call(aggregate, row.reaction)) {
      aggregate[row.reaction as keyof Aggregate] = Number(row.count)
    }
  }

  const total = Object.values(aggregate).reduce((sum, count) => sum + count, 0)
  aggregateCache.set(articleId, { aggregate, total, cachedAt: now })
  return { aggregate, total }
}

export async function GET(request: NextRequest) {
  try {
    const articleId = normalizeArticleId(request.nextUrl.searchParams.get("articleId"))
    if (!articleId) {
      return NextResponse.json({ error: "Valid articleId is required" }, { status: 400 })
    }

    if (!getInsightsArticleById(articleId)) {
      return NextResponse.json({ error: "Unknown article" }, { status: 404 })
    }

    await ensureFeedbackTable()
    const stats = await fetchAggregate(articleId)
    return NextResponse.json({ ok: true, ...stats }, { headers: { "Cache-Control": "public, max-age=10, s-maxage=10, stale-while-revalidate=20" } })
  } catch (error) {
    console.warn("[insights-feedback] aggregate read failed", error)
    return NextResponse.json({ ok: false, aggregate: { love: 0, helpful: 0, neutral: 0, unclear: 0 }, total: 0 })
  }
}

export async function POST(request: NextRequest) {
  if (!isAllowedOrigin(request)) {
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 })
  }

  let body: { articleId?: string; articleSlug?: string; reaction?: string; sessionId?: string } = {}
  try {
    body = (await request.json()) as typeof body
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const articleId = normalizeArticleId(body.articleId)
  const reaction = typeof body.reaction === "string" ? body.reaction.trim().toLowerCase() : ""
  if (!articleId || !reaction) {
    return NextResponse.json({ error: "articleId and reaction are required" }, { status: 400 })
  }
  if (!ALLOWED_REACTIONS.has(reaction)) {
    return NextResponse.json({ error: "Invalid reaction" }, { status: 400 })
  }

  const knownArticle = getInsightsArticleById(articleId)
  if (!knownArticle) {
    return NextResponse.json({ error: "Unknown article" }, { status: 404 })
  }

  const incomingSlug = normalizeArticleSlug(body.articleSlug)
  if (incomingSlug && incomingSlug !== knownArticle.slug) {
    return NextResponse.json({ error: "articleSlug does not match articleId" }, { status: 400 })
  }

  const headerSession = request.headers.get("x-insights-session-id")
  const sessionId =
    normalizeSessionId(body.sessionId) ||
    normalizeSessionId(headerSession) ||
    request.headers.get("x-vercel-id") ||
    `anon_${Date.now()}`

  const ipHash = hashIp(request.headers.get("x-forwarded-for"))
  const rateKey = `${sessionId}:${ipHash || "noip"}`
  const rate = enforceRateLimit(rateKey)
  if (!rate.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded", remaining: rate.remaining }, { status: 429 })
  }

  const articleSlug = knownArticle.slug
  const userAgent = request.headers.get("user-agent")?.slice(0, 512) || null

  try {
    await ensureFeedbackTable()

    await sql.unsafe(
      `INSERT INTO insights_article_feedback (
        article_id, article_slug, reaction, session_id, user_agent, ip_hash, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
      ON CONFLICT (article_id, session_id)
      DO UPDATE SET
        article_slug = EXCLUDED.article_slug,
        reaction = EXCLUDED.reaction,
        user_agent = EXCLUDED.user_agent,
        ip_hash = EXCLUDED.ip_hash,
        updated_at = NOW()`,
      [articleId, articleSlug, reaction, sessionId, userAgent, ipHash]
    )

    const stats = await fetchAggregate(articleId, true)
    return NextResponse.json({ ok: true, stored: true, sessionId, ...stats, remaining: rate.remaining })
  } catch (error) {
    console.warn("[insights-feedback] write failed", error)
    return NextResponse.json({ ok: false, stored: false, sessionId })
  }
}
