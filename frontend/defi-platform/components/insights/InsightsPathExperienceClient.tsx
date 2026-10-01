"use client"

import Link from "next/link"
import Image from "next/image"
import { useEffect, useState, useCallback } from "react"
import type { InsightsPath, InsightsChapterMeta } from "@/lib/insights-data"
import { insightsPathConfig } from "@/lib/insights-data"
import { PathSelector } from "@/components/insights/PathSelector"

// ── localStorage helpers ───────────────────────────────────────────────────────

const STORAGE_KEY = "insights_read"

function loadReadSlugs(): Set<string> {
  if (typeof window === "undefined") return new Set()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return new Set(raw ? JSON.parse(raw) : [])
  } catch {
    return new Set()
  }
}

function saveReadSlugs(slugs: Set<string>): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...slugs]))
  } catch {}
}

// ── Per-path intro taglines ────────────────────────────────────────────────────

const pathIntro: Record<InsightsPath, { badge: string; headline: string; sub: string }> = {
  starter: {
    badge: "🎯 Learning Path",
    headline: "Your step-by-step guide to DeFi",
    sub: "Work through each chapter in order. Every lesson builds on the last.",
  },
  yield: {
    badge: "🧪 Strategy Lab",
    headline: "Master yield from first principles",
    sub: "Learn to read the real numbers behind every APY, then build strategies that survive market stress.",
  },
  risk: {
    badge: "🛡️ Pre-flight Checklist",
    headline: "Stay safe before, during, and after",
    sub: "Every chapter covers a different layer of protection. Work through them before you open a position.",
  },
  market: {
    badge: "📊 Market Scan Framework",
    headline: "Read the market without getting lost",
    sub: "Build a three-step framework for turning market signals into clear decisions.",
  },
  action: {
    badge: "🚀 Hands-On Guides",
    headline: "Put your knowledge into practice",
    sub: "Step-by-step walkthroughs for doing real things in Peridot — no fluff, just action.",
  },
}

const pathMascot: Record<InsightsPath, string> = {
  starter: "/Owl Mascot - Mint Green.svg",
  yield: "/Owl Mascot - Bitcoin - Mint Green.svg",
  risk: "/Owl Mascot - Colored.svg",
  market: "/Owl Mascot - Bitcoin - Colored.svg",
  action: "/Owl Mascot - Mint Green.svg",
}

const difficultyLabel: Record<string, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
}

// ── Chapter card ──────────────────────────────────────────────────────────────

function ChapterCard({
  chapter,
  path,
  chapterIndex,
  readSlugs,
  onMarkRead,
}: {
  chapter: InsightsChapterMeta
  path: InsightsPath
  chapterIndex: number
  readSlugs: Set<string>
  onMarkRead: (slug: string) => void
}) {
  const totalMinutes = chapter.lessons.reduce((sum, l) => sum + l.readTimeMin, 0)
  const readCount = chapter.lessons.filter((l) => readSlugs.has(l.slug)).length

  return (
    <div className="insights-chapter-card">
      {/* Chapter header */}
      <div className="insights-chapter-card__header">
        <div className="insights-chapter-card__number">
          {String(chapterIndex + 1).padStart(2, "0")}
        </div>
        <div className="insights-chapter-card__meta">
          <h3 className="insights-chapter-card__title">{chapter.title}</h3>
          <span className="insights-chapter-card__stats">
            {chapter.lessons.length} lesson{chapter.lessons.length !== 1 ? "s" : ""} · {totalMinutes} min
            {readCount > 0 && (
              <span className="insights-chapter-card__read-count">
                {" "}· {readCount} of {chapter.lessons.length} read
              </span>
            )}
          </span>
        </div>
      </div>

      {/* Lesson rows */}
      <ol className="insights-chapter-card__lessons">
        {chapter.lessons.map((lesson) => {
          const isRead = readSlugs.has(lesson.slug)
          return (
            <li
              key={lesson.slug}
              className={`insights-lesson-row${isRead ? " is-read" : ""}`}
            >
              {/* Step indicator */}
              <div className="insights-lesson-row__step" aria-hidden="true">
                <span className="insights-lesson-row__step-dot">
                  {isRead && <span className="insights-lesson-row__check">✓</span>}
                </span>
              </div>

              <div className="insights-lesson-row__body">
                <Link
                  href={`/insights/${path}/${lesson.slug}`}
                  className="insights-lesson-row__title"
                  onClick={() => onMarkRead(lesson.slug)}
                >
                  {lesson.title}
                </Link>
                <p className="insights-lesson-row__excerpt">{lesson.excerpt}</p>
              </div>

              <div className="insights-lesson-row__aside">
                <span className="insights-lesson-row__seq">
                  Lesson {lesson.lesson.order} of {chapter.lessons.length}
                </span>
                <span className={`insights-difficulty insights-difficulty--${lesson.difficulty}`}>
                  {difficultyLabel[lesson.difficulty]}
                </span>
                <span className="insights-lesson-row__time">{lesson.readTimeMin} min</span>
                <Link
                  href={`/insights/${path}/${lesson.slug}`}
                  className="insights-btn insights-btn--ghost insights-lesson-row__cta"
                  aria-label={`Read ${lesson.title}`}
                  onClick={() => onMarkRead(lesson.slug)}
                >
                  {isRead ? "Re-read" : "Read"} <span aria-hidden="true">→</span>
                </Link>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function InsightsPathExperienceClient({
  path,
  chapters,
}: {
  path: InsightsPath
  chapters: InsightsChapterMeta[]
}) {
  const pathMeta = insightsPathConfig[path]
  const intro = pathIntro[path]
  const totalLessons = chapters.reduce((sum, c) => sum + c.lessons.length, 0)
  const totalMinutes = chapters.reduce(
    (sum, c) => sum + c.lessons.reduce((s, l) => s + l.readTimeMin, 0),
    0
  )

  const [readSlugs, setReadSlugs] = useState<Set<string>>(new Set())

  // Hydrate from localStorage after mount
  useEffect(() => {
    setReadSlugs(loadReadSlugs())
  }, [])

  const handleMarkRead = useCallback((slug: string) => {
    setReadSlugs((prev) => {
      const next = new Set(prev)
      next.add(slug)
      saveReadSlugs(next)
      return next
    })
  }, [])

  const handleReset = useCallback(() => {
    // Only clear slugs for this path's lessons
    const pathSlugs = new Set(chapters.flatMap((c) => c.lessons.map((l) => l.slug)))
    setReadSlugs((prev) => {
      const next = new Set([...prev].filter((s) => !pathSlugs.has(s)))
      saveReadSlugs(next)
      return next
    })
  }, [chapters])

  const readCount = chapters.reduce(
    (sum, c) => sum + c.lessons.filter((l) => readSlugs.has(l.slug)).length,
    0
  )

  return (
    <div className="insights-layout insights-console">

      {/* ── Hero ── */}
      <section className="insights-hero">
        <div className="insights-hero__mascot" aria-hidden="true">
          <Image
            src={pathMascot[path]}
            alt=""
            width={140}
            height={140}
            className="insights-hero__owl insights-hero__owl--mint"
          />
        </div>
        <p className="insights-hero__kicker">Peridot Insights</p>
        <h1 className="insights-hero__title">{pathMeta.label}</h1>
        <p className="insights-hero__subtitle">{pathMeta.description}</p>
        <div className="insights-hero__actions">
          <Link href="/insights" className="insights-btn insights-btn--ghost">
            ← Back to hub
          </Link>
        </div>
      </section>

      {/* ── Path selector ── */}
      <section className="insights-toolbar">
        <PathSelector currentPath={path} />
      </section>

      {/* ── Curriculum intro ── */}
      <section className="insights-curriculum-intro">
        <span className="insights-curriculum-intro__badge">{intro.badge}</span>
        <div className="insights-curriculum-intro__text">
          <h2>{intro.headline}</h2>
          <p>{intro.sub}</p>
        </div>
        <div className="insights-curriculum-intro__footer">
          <p className="insights-curriculum-intro__summary">
            <span>{chapters.length} chapter{chapters.length !== 1 ? "s" : ""}</span>
            <span className="insights-curriculum-intro__dot" aria-hidden="true"> · </span>
            <span>{totalLessons} lesson{totalLessons !== 1 ? "s" : ""}</span>
            <span className="insights-curriculum-intro__dot" aria-hidden="true"> · </span>
            <span>~{totalMinutes} min total</span>
          </p>
          {readCount > 0 && (
            <div className="insights-curriculum-intro__progress">
              <span className="insights-curriculum-intro__progress-text">
                {readCount} of {totalLessons} read
              </span>
              <button
                type="button"
                className="insights-curriculum-intro__reset"
                onClick={handleReset}
                aria-label="Mark all lessons as unread"
              >
                Reset progress
              </button>
            </div>
          )}
        </div>
      </section>

      {/* ── Chapter list ── */}
      <section className="insights-curriculum" aria-label="Course curriculum">
        {chapters.length === 0 && (
          <p className="insights-curriculum__empty">No lessons published yet — check back soon.</p>
        )}
        {chapters.map((chapter, i) => (
          <ChapterCard
            key={chapter.slug}
            chapter={chapter}
            path={path}
            chapterIndex={i}
            readSlugs={readSlugs}
            onMarkRead={handleMarkRead}
          />
        ))}
      </section>

    </div>
  )
}
