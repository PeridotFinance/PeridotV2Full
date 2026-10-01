"use client"

import Link from "next/link"
import Image from "next/image"
import { useEffect, useMemo, useState } from "react"
import { usePostHog } from "posthog-js/react"
import type { GlossaryTerm, InsightsArticle, InsightsChapterMeta } from "@/lib/insights-data"
import { insightsPathConfig } from "@/lib/insights-data"
import { InteractiveBlock } from "@/components/insights/interactive"
import { ReadingExperience } from "@/components/insights/ReadingExperience"
import { YieldCalculatorWidget } from "@/components/insights/YieldCalculatorWidget"
import { ArticleFeedback } from "@/components/insights/ArticleFeedback"
import { captureInsightsEvent } from "@/components/insights/analytics"
import { getInsightsExperimentAssignment } from "@/components/insights/experiments"

function slugifyHeading(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
}

const difficultyLabel: Record<string, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
}

// Per-path mascot images
const pathMascot: Record<InsightsArticle["path"], string> = {
  starter: "/Owl Mascot - Mint Green.svg",
  yield: "/Owl Mascot - Bitcoin - Mint Green.svg",
  risk: "/Owl Mascot - Colored.svg",
  market: "/Owl Mascot - Bitcoin - Colored.svg",
  action: "/Owl Mascot - Mint Green.svg",
}

// What you'll learn brief outcomes per path
const briefByPath: Record<
  InsightsArticle["path"],
  { kicker: string; outcomes: string[] }
> = {
  starter: {
    kicker: "What you'll learn",
    outcomes: [
      "A repeatable checklist you can reuse for every transaction.",
      "How to set safe risk limits before you start.",
      "When to scale up and when to wait.",
    ],
  },
  yield: {
    kicker: "What you'll learn",
    outcomes: [
      "The difference between surface APY and real, net return.",
      "How to account for fees, gas, and rebalancing costs.",
      "How to stress-test a strategy before committing capital.",
    ],
  },
  risk: {
    kicker: "What you'll learn",
    outcomes: [
      "How to define safe, warning, and critical zones before opening a position.",
      "Which collateral factors increase your liquidation risk the most.",
      "How to set alerts and prepare your response before markets move.",
    ],
  },
  market: {
    kicker: "What you'll learn",
    outcomes: [
      "How to read TVL and market signals in context not in isolation.",
      "How to detect regime shifts before they affect your position.",
      "A simple three-step framework for translating signals into decisions.",
    ],
  },
  action: {
    kicker: "What you'll do",
    outcomes: [
      "Complete each step hands-on — no theory, just execution.",
      "End with a real position open or a real action taken in the app.",
      "Build muscle memory for repeating this workflow independently.",
    ],
  },
}

function renderTextWithGlossary(
  text: string,
  glossary: Map<string, GlossaryTerm>,
  onGlossaryClick: (term: GlossaryTerm) => void,
  onGlossaryPreview: (term: GlossaryTerm) => void,
  cueIntensity: "control" | "intense"
) {
  const parts = text.split(/(\{[^}]+\})/g)
  return parts.map((part, index) => {
    const match = part.match(/^\{([^}]+)\}$/)
    if (!match) return <span key={`txt-${index}`}>{part}</span>
    const termName = match[1]
    const term = glossary.get(termName.toLowerCase())
    if (!term) return <span key={`txt-${index}`}>{termName}</span>

    return (
      <span key={`term-${index}`} className="insights-term">
        <a
          href={`/glossary/${term.slug}`}
          className={`insights-term__trigger ${cueIntensity === "intense" ? "is-intense" : ""}`}
          onClick={() => onGlossaryClick(term)}
          onMouseEnter={() => onGlossaryPreview(term)}
          onFocus={() => onGlossaryPreview(term)}
        >
          {term.term}
          {cueIntensity === "intense" && <span className="insights-term__cue">?</span>}
        </a>
        <span className="insights-term__tooltip" role="tooltip">
          <strong>{term.term}</strong>
          {cueIntensity === "intense" && <em>Definition preview</em>}
          <span>{term.definitionShort}</span>
        </span>
      </span>
    )
  })
}

function StickyContextCta({
  article,
  posthog,
  onClose,
}: {
  article: InsightsArticle
  posthog: ReturnType<typeof usePostHog>
  onClose: () => void
}) {
  useEffect(() => {
    captureInsightsEvent(posthog, "insights_experiment_exposure", {
      experiment: "EXP-D3",
      variant: "sticky_cta",
      surface: "insights_article",
      slug: article.slug,
    })
  }, [article.slug, posthog])

  return (
    <div className="insights-sticky-cta" role="region" aria-label="Context CTA">
      <div className="insights-sticky-cta__content">
        <strong>Ready for the next step?</strong>
        <span>Apply this strategy directly in the app.</span>
      </div>
      <div className="insights-sticky-cta__actions">
        <Link
          href={article.ctaHref}
          className="insights-btn insights-btn--primary"
          onClick={() =>
            captureInsightsEvent(posthog, "insights_cta_click", {
              slug: article.slug,
              href: article.ctaHref,
              path: article.path,
              placement: "sticky",
            })
          }
        >
          {article.ctaLabel}
        </Link>
        <button type="button" className="insights-btn insights-btn--ghost" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  )
}

function InsightsActionRefresher({
  article,
  posthog,
  onDismiss,
}: {
  article: InsightsArticle
  posthog: ReturnType<typeof usePostHog>
  onDismiss: () => void
}) {
  const suggestion = article.actionArticleSuggestion!
  return (
    <div className="ia-action-refresher" role="complementary" aria-label="Practice suggestion">
      <div className="ia-action-refresher__body">
        <span className="ia-action-refresher__eyebrow">Ready to apply this?</span>
        <span className="ia-action-refresher__title">{suggestion.title}</span>
      </div>
      <div className="ia-action-refresher__actions">
        <Link
          href={`/insights/action/${suggestion.slug}`}
          className="ia-action-refresher__link"
          onClick={() =>
            captureInsightsEvent(posthog, "insights_action_refresher_click", {
              slug: article.slug,
              action_slug: suggestion.slug,
              path: article.path,
            })
          }
        >
          Try it →
        </Link>
        <button
          type="button"
          className="ia-action-refresher__dismiss"
          aria-label="Dismiss suggestion"
          onClick={onDismiss}
        >
          ×
        </button>
      </div>
    </div>
  )
}

export function InsightsArticleClient({
  article,
  glossaryTerms,
  chapterMeta,
  prevLesson,
  nextLesson,
}: {
  article: InsightsArticle
  glossaryTerms: GlossaryTerm[]
  chapterMeta: InsightsChapterMeta | null
  prevLesson: InsightsArticle | null
  nextLesson: InsightsArticle | null
}) {
  const posthog = usePostHog()
  const [focusMode, setFocusMode] = useState(false)
  const [stickyDismissed, setStickyDismissed] = useState(false)
  const [refresherDismissed, setRefresherDismissed] = useState(false)
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null)
  const [experiments] = useState(getInsightsExperimentAssignment)
  const brief = briefByPath[article.path]
  const glossaryMap = useMemo(
    () => new Map(glossaryTerms.map((term) => [term.term.toLowerCase(), term])),
    [glossaryTerms]
  )
  const headingEntries = useMemo(
    () =>
      article.blocks
        .filter((block): block is { type: "heading"; text: string } => block.type === "heading")
        .map((block, index) => ({
          id: `section-${index + 1}-${slugifyHeading(block.text)}`,
          title: block.text,
          chapter: index + 1,
        })),
    [article.blocks]
  )
  const previewedTermsRef = useState(() => new Set<string>())[0]

  const onGlossaryClick = (term: GlossaryTerm) => {
    captureInsightsEvent(posthog, "insights_glossary_open", {
      article_slug: article.slug,
      term: term.term,
      glossary_slug: term.slug,
      exp_d4: experiments.expD4GlossaryCue,
    })
  }

  const onGlossaryPreview = (term: GlossaryTerm) => {
    if (previewedTermsRef.has(term.slug)) return
    previewedTermsRef.add(term.slug)
    captureInsightsEvent(posthog, "insights_glossary_hint_exposure", {
      article_slug: article.slug,
      term: term.term,
      glossary_slug: term.slug,
      exp_d4: experiments.expD4GlossaryCue,
    })
  }

  useEffect(() => {
    captureInsightsEvent(posthog, "insights_article_view", {
      slug: article.slug,
      path: article.path,
      difficulty: article.difficulty,
      read_time_min: article.readTimeMin,
      exp_d4: experiments.expD4GlossaryCue,
    })
  }, [article.difficulty, article.path, article.readTimeMin, article.slug, experiments.expD4GlossaryCue, posthog])

  useEffect(() => {
    if (typeof window === "undefined") return
    if (window.sessionStorage.getItem(`insights_sticky_cta_dismissed_${article.slug}`) === "1") setStickyDismissed(true)
    if (window.sessionStorage.getItem(`insights_refresher_dismissed_${article.slug}`) === "1") setRefresherDismissed(true)
  }, [article.slug])

  useEffect(() => {
    captureInsightsEvent(posthog, "insights_experiment_exposure", {
      experiment: "EXP-D4",
      variant: experiments.expD4GlossaryCue,
      surface: "insights_article",
      slug: article.slug,
    })
  }, [article.slug, experiments.expD4GlossaryCue, posthog])

  useEffect(() => {
    captureInsightsEvent(posthog, "insights_experiment_exposure", {
      experiment: "EXP-D5",
      variant: "rhythm_blocks_v1",
      surface: "insights_article",
      slug: article.slug,
    })
  }, [article.slug, posthog])

  useEffect(() => {
    if (typeof window === "undefined" || headingEntries.length === 0) return
    setActiveSectionId(headingEntries[0]?.id ?? null)

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible.length === 0) return
        const id = visible[0].target.getAttribute("id")
        if (id) setActiveSectionId(id)
      },
      { root: null, rootMargin: "-15% 0px -62% 0px", threshold: [0, 0.2, 0.6, 1] }
    )

    const elements = headingEntries
      .map((h) => document.getElementById(h.id))
      .filter((el): el is HTMLElement => Boolean(el))
    elements.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [headingEntries])

  return (
    <ReadingExperience articleSlug={article.slug}>
      {({ progress }) => (
        <div
          className={`insights-article insights-console ${focusMode ? "insights-focus-mode" : ""} ${experiments.expD4GlossaryCue === "intense" ? "exp-d4-glossary-intense" : "exp-d4-glossary-control"}`}
        >
          {/* ── Reading progress bar ── */}
          <div className="ia-progress" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}>
            <span className={`ia-progress__fill ia-progress__fill--${article.path}`} style={{ width: `${progress}%` }} />
          </div>

          {/* ── Chapter context bar ── */}
          {chapterMeta && (
            <nav className="ia-chapter-bar" aria-label="Lesson location">
              <Link href={`/insights/${article.path}`} className="ia-chapter-bar__path">
                {insightsPathConfig[article.path].label}
              </Link>
              <span className="ia-chapter-bar__sep" aria-hidden="true">›</span>
              <span className="ia-chapter-bar__chapter">
                Chapter {article.chapter.order}: {article.chapter.title}
              </span>
              <span className="ia-chapter-bar__sep" aria-hidden="true">›</span>
              <span className="ia-chapter-bar__lesson">
                Lesson {article.lesson.order} of {chapterMeta.lessons.length}
              </span>
              <span className="ia-chapter-bar__dots" aria-label={`Lesson ${article.lesson.order} of ${chapterMeta.lessons.length}`}>
                {chapterMeta.lessons.map((l) => (
                  <span
                    key={l.slug}
                    className={`ia-lesson-dot${l.slug === article.slug ? " ia-lesson-dot--active" : ""}`}
                    aria-hidden="true"
                  />
                ))}
              </span>
            </nav>
          )}

          {/* ── Article header ── */}
          <header className={`ia-header ia-header--${article.path}`}>
            <div className="ia-header__body">
              <div className="ia-header__top-row">
                <span className={`ia-header__kicker ia-header__kicker--${article.path}`}>
                  {insightsPathConfig[article.path].label}
                </span>
                <div className="ia-header__meta">
                  <span className="ia-header__time">{article.readTimeMin} min read</span>
                  <span className={`insights-difficulty insights-difficulty--${article.difficulty}`}>
                    {difficultyLabel[article.difficulty]}
                  </span>
                  <button
                    type="button"
                    className="ia-header__focus-btn"
                    onClick={() => {
                      const next = !focusMode
                      setFocusMode(next)
                      captureInsightsEvent(posthog, "insights_focus_mode_toggle", {
                        slug: article.slug,
                        enabled: next,
                      })
                    }}
                  >
                    {focusMode ? "Exit focus" : "Focus mode"}
                  </button>
                </div>
              </div>

              <h1 className="ia-header__title">{article.title}</h1>
              <p className="ia-header__excerpt">{article.excerpt}</p>
            </div>

            <div className="ia-header__mascot" aria-hidden="true">
              <Image
                src={pathMascot[article.path]}
                alt=""
                width={160}
                height={160}
                className="ia-header__owl"
                priority
              />
            </div>
          </header>

          {/* ── "What you'll learn" brief ── */}
          <div className="ia-brief">
            <p className="ia-brief__kicker">{brief.kicker}</p>
            <ul className="ia-brief__list">
              {brief.outcomes.map((outcome) => (
                <li key={outcome} className="ia-brief__item">
                  <span className="ia-brief__check" aria-hidden="true">✓</span>
                  <span>{outcome}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* ── Body + sidebar rail ── */}
          <section className="insights-article__experience">
            <div className="insights-article__content">
              <div className="insights-article__body">
                {(() => {
                  let headingIndex = -1
                  return article.blocks.map((block, index) => {
                    const blockStyle = { animationDelay: `${80 + index * 35}ms` }

                    if (block.type === "heading") {
                      headingIndex += 1
                      const headingMeta = headingEntries[headingIndex]
                      return (
                        <section
                          key={`${block.type}-${index}`}
                          className="insights-article-block insights-article-block--heading"
                          style={blockStyle}
                          id={headingMeta?.id}
                        >
                          <h2>
                            <span className="insights-heading-chip">
                              {String(headingMeta?.chapter ?? headingIndex + 1).padStart(2, "0")}
                            </span>
                            {block.text}
                          </h2>
                        </section>
                      )
                    }

                    if (block.type === "callout") {
                      return (
                        <section
                          key={`${block.type}-${index}`}
                          className="insights-article-block insights-article-block--callout"
                          style={blockStyle}
                        >
                          <aside className={`ia-callout ia-callout--${article.path}`}>
                            <span className="ia-callout__icon" aria-hidden="true">💡</span>
                            <p>{renderTextWithGlossary(block.text, glossaryMap, onGlossaryClick, onGlossaryPreview, experiments.expD4GlossaryCue)}</p>
                          </aside>
                        </section>
                      )
                    }

                    if (
                      block.type === "checkpoint" ||
                      block.type === "calculator" ||
                      block.type === "predict" ||
                      block.type === "jenga" ||
                      block.type === "vault-builder" ||
                      block.type === "borrowing-power" ||
                      block.type === "leverage-seesaw" ||
                      block.type === "rate-highway" ||
                      block.type === "liquidation-dominoes" ||
                      block.type === "apy-snowball" ||
                      block.type === "position-builder"
                    ) {
                      return (
                        <section
                          key={`${block.type}-${index}`}
                          className="insights-article-block insights-article-block--interactive"
                          style={blockStyle}
                        >
                          <InteractiveBlock block={block} />
                        </section>
                      )
                    }

                    if (block.type === "paragraph") {
                      return (
                        <section
                          key={`${block.type}-${index}`}
                          className="insights-article-block insights-article-block--paragraph"
                          style={blockStyle}
                        >
                          <p>{renderTextWithGlossary(block.text, glossaryMap, onGlossaryClick, onGlossaryPreview, experiments.expD4GlossaryCue)}</p>
                        </section>
                      )
                    }

                    if (block.type === "image") {
                      return (
                        <section
                          key={`${block.type}-${index}`}
                          className="insights-article-block insights-article-block--image"
                          style={blockStyle}
                        >
                          <figure className="insights-figure">
                            <Image
                              src={block.url}
                              alt={block.alt}
                              width={1200}
                              height={675}
                              className="insights-figure__img"
                            />
                            {block.caption && (
                              <figcaption className="insights-figure__caption">{block.caption}</figcaption>
                            )}
                          </figure>
                        </section>
                      )
                    }

                    return null
                  })
                })()}
              </div>
            </div>

            {(chapterMeta || headingEntries.length > 0) && (
              <aside className="insights-article__rail" aria-label="Article navigation">

                {/* ── In this chapter ── */}
                {chapterMeta && chapterMeta.lessons.length > 1 && (
                  <div className="insights-rail-chapter">
                    <p className="insights-rail-chapter__kicker">
                      Chapter {article.chapter.order}: {article.chapter.title}
                    </p>
                    <nav className="insights-rail-chapter__nav">
                      {chapterMeta.lessons.map((l) => (
                        <Link
                          key={l.slug}
                          href={`/insights/${article.path}/${l.slug}`}
                          className={`insights-rail-chapter__item${l.slug === article.slug ? " is-active" : ""}`}
                        >
                          <span className="insights-rail-chapter__num">
                            {String(l.lesson.order).padStart(2, "0")}
                          </span>
                          <span className="insights-rail-chapter__title">{l.title}</span>
                        </Link>
                      ))}
                    </nav>
                  </div>
                )}

                {/* ── In this article ── */}
                {headingEntries.length > 0 && (
                  <>
                    <p className="insights-article__rail-kicker">In this guide</p>
                    <p className="insights-article__rail-progress">{Math.max(0, Math.min(100, Math.round(progress)))}% read</p>
                    <nav className="insights-article__rail-nav">
                      {headingEntries.map((heading) => (
                        <a
                          key={heading.id}
                          href={`#${heading.id}`}
                          className={activeSectionId === heading.id ? "is-active" : ""}
                          onClick={() =>
                            captureInsightsEvent(posthog, "insights_section_jump_click", {
                              slug: article.slug,
                              section_id: heading.id,
                            })
                          }
                        >
                          <span>{String(heading.chapter).padStart(2, "0")}</span>
                          <strong>{heading.title}</strong>
                        </a>
                      ))}
                    </nav>
                  </>
                )}
              </aside>
            )}
          </section>

          {article.path === "yield" && <YieldCalculatorWidget articleSlug={article.slug} />}

          {/* ── Action refresher (shown when article has a related action guide) ── */}
          {!refresherDismissed &&
            article.path !== "action" &&
            (article.peridotRelevance === "high" || article.peridotRelevance === "medium") &&
            article.actionArticleSuggestion && (
              <InsightsActionRefresher
                article={article}
                posthog={posthog}
                onDismiss={() => {
                  setRefresherDismissed(true)
                  if (typeof window !== "undefined") {
                    window.sessionStorage.setItem(`insights_refresher_dismissed_${article.slug}`, "1")
                  }
                }}
              />
            )}

          {/* ── Lesson navigation ── */}
          {(prevLesson || nextLesson) && (
            <nav className="ia-lesson-nav" aria-label="Lesson navigation">
              {prevLesson ? (
                <Link
                  href={`/insights/${prevLesson.path}/${prevLesson.slug}`}
                  className="ia-lesson-nav__card ia-lesson-nav__card--prev"
                >
                  <span className="ia-lesson-nav__direction">← Previous</span>
                  <span className="ia-lesson-nav__title">{prevLesson.title}</span>
                  <span className="ia-lesson-nav__meta">
                    {prevLesson.chapter.slug !== article.chapter.slug
                      ? `Chapter ${prevLesson.chapter.order} · Lesson ${prevLesson.lesson.order}`
                      : `Lesson ${prevLesson.lesson.order} of ${chapterMeta?.lessons.length ?? "?"}`}
                  </span>
                </Link>
              ) : (
                <div />
              )}
              {nextLesson ? (
                <Link
                  href={`/insights/${nextLesson.path}/${nextLesson.slug}`}
                  className="ia-lesson-nav__card ia-lesson-nav__card--next"
                >
                  <span className="ia-lesson-nav__direction">
                    {nextLesson.chapter.slug !== article.chapter.slug
                      ? `Next chapter →`
                      : `Next →`}
                  </span>
                  <span className="ia-lesson-nav__title">{nextLesson.title}</span>
                  <span className="ia-lesson-nav__meta">
                    {nextLesson.chapter.slug !== article.chapter.slug
                      ? `Chapter ${nextLesson.chapter.order}: ${nextLesson.chapter.title}`
                      : `Lesson ${nextLesson.lesson.order} of ${chapterMeta?.lessons.length ?? "?"}`}
                  </span>
                </Link>
              ) : (
                <div className="ia-lesson-nav__complete">
                  <span>🎓</span>
                  <strong>Path complete!</strong>
                  <Link href={`/insights/${article.path}`} className="insights-btn insights-btn--ghost">
                    Back to {insightsPathConfig[article.path].label}
                  </Link>
                </div>
              )}
            </nav>
          )}

          {/* ── Footer CTA ── */}
          <div className={`ia-footer-cta ia-footer-cta--${article.path}`}>
            <div className="ia-footer-cta__inner">
              <p className="ia-footer-cta__eyebrow">Ready to apply this?</p>
              <h2 className="ia-footer-cta__heading">Put it into practice.</h2>
              <p className="ia-footer-cta__sub">Open the app and try this in a real position, no minimums, no lock-ins.</p>
              <div className="ia-footer-cta__actions">
                <Link
                  href={article.ctaHref}
                  className="insights-btn insights-btn--primary"
                  onClick={() =>
                    captureInsightsEvent(posthog, "insights_cta_click", {
                      slug: article.slug,
                      href: article.ctaHref,
                      path: article.path,
                      placement: "footer",
                    })
                  }
                >
                  {article.ctaLabel}
                </Link>
                <Link href="/insights" className="insights-btn insights-btn--ghost">
                  ← Back to Insights
                </Link>
              </div>
            </div>
          </div>

          <ArticleFeedback articleId={article.id} articleSlug={article.slug} />

          {progress >= 65 && !stickyDismissed && (
            <StickyContextCta
              article={article}
              posthog={posthog}
              onClose={() => {
                setStickyDismissed(true)
                if (typeof window !== "undefined") {
                  window.sessionStorage.setItem(`insights_sticky_cta_dismissed_${article.slug}`, "1")
                }
              }}
            />
          )}
        </div>
      )}
    </ReadingExperience>
  )
}
