"use client"

import Link from "next/link"
import Image from "next/image"
import { useState } from "react"
import type { InsightsChapterMeta, InsightsArticle } from "@/lib/insights-data"
import { PathSelector } from "@/components/insights/PathSelector"

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    })
  } catch {
    return ""
  }
}

function FeaturedCard({ article }: { article: InsightsArticle }) {
  return (
    <Link
      href={`/insights/market/${article.slug}`}
      className="imc-featured"
    >
      <div className="imc-featured__image-wrap">
        <Image
          src={article.coverImage}
          alt={article.title}
          fill
          className="imc-featured__image"
          sizes="(max-width: 768px) 100vw, 60vw"
        />
        <div className="imc-featured__image-overlay" aria-hidden="true" />
      </div>
      <div className="imc-featured__body">
        <div className="imc-featured__meta">
          {article.tags.slice(0, 2).map((tag) => (
            <span key={tag} className="imc-tag">{tag}</span>
          ))}
          <span className="imc-featured__date">{formatDate(article.publishedAt)}</span>
        </div>
        <h2 className="imc-featured__title">{article.title}</h2>
        <p className="imc-featured__excerpt">{article.excerpt}</p>
        <span className="imc-featured__read">
          Read <span aria-hidden="true">→</span>
        </span>
      </div>
    </Link>
  )
}

function EditorialCard({ article }: { article: InsightsArticle }) {
  return (
    <Link
      href={`/insights/market/${article.slug}`}
      className="imc-card"
    >
      <div className="imc-card__image-wrap">
        <Image
          src={article.coverImage}
          alt={article.title}
          fill
          className="imc-card__image"
          sizes="(max-width: 768px) 100vw, 33vw"
        />
      </div>
      <div className="imc-card__body">
        <div className="imc-card__meta">
          {article.tags.slice(0, 1).map((tag) => (
            <span key={tag} className="imc-tag">{tag}</span>
          ))}
          <span className="imc-card__date">{formatDate(article.publishedAt)}</span>
        </div>
        <h3 className="imc-card__title">{article.title}</h3>
        <p className="imc-card__excerpt">{article.excerpt}</p>
        <div className="imc-card__footer">
          <span className="imc-card__time">{article.readTimeMin} min read</span>
          <span className="imc-card__cta">Read <span aria-hidden="true">→</span></span>
        </div>
      </div>
    </Link>
  )
}

export function InsightsMarketClient({
  chapters,
}: {
  chapters: InsightsChapterMeta[]
}) {
  const allArticles = chapters.flatMap((c) => c.lessons)
  const [featured, ...rest] = allArticles

  return (
    <div className="insights-layout insights-console imc-root">

      {/* ── Masthead ── */}
      <header className="imc-masthead">
        <Link href="/insights" className="imc-masthead__back">
          ← Insights
        </Link>
        <div className="imc-masthead__center">
          <p className="imc-masthead__eyebrow">Market Updates</p>
          <h1 className="imc-masthead__title">What's moving in crypto</h1>
          <p className="imc-masthead__sub">
            Short, plain-English updates on market signals and what they mean for you.
          </p>
        </div>
        <div className="imc-masthead__count">
          {allArticles.length} article{allArticles.length !== 1 ? "s" : ""}
        </div>
      </header>

      {/* ── Path nav ── */}
      <section className="insights-toolbar">
        <PathSelector currentPath="market" />
      </section>

      {allArticles.length === 0 ? (
        <p className="imc-empty">No market updates yet — check back soon.</p>
      ) : (
        <>
          {/* ── Featured ── */}
          {featured && (
            <section className="imc-featured-section" aria-label="Featured article">
              <FeaturedCard article={featured} />
            </section>
          )}

          {/* ── Grid ── */}
          {rest.length > 0 && (
            <section className="imc-grid" aria-label="All market updates">
              {rest.map((article) => (
                <EditorialCard key={article.slug} article={article} />
              ))}
            </section>
          )}
        </>
      )}

    </div>
  )
}
