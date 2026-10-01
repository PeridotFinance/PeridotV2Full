"use client"

import Link from "next/link"
import Image from "next/image"
import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { usePostHog } from "posthog-js/react"
import type { InsightsArticle, InsightsPath } from "@/lib/insights-data"
import { captureInsightsEvent } from "@/components/insights/analytics"

const pathTiles: Array<{
  id: InsightsPath
  icon: string
  headline: string
  description: string
}> = [
  {
    id: "starter",
    icon: "🎯",
    headline: "DeFi Basics",
    description: "New to crypto? Start here. Learn how everything works before putting money in.",
  },
  {
    id: "yield",
    icon: "📈",
    headline: "Earn Interest",
    description: "Find the best ways to grow your crypto. Understand what you're really earning before you commit.",
  },
  {
    id: "risk",
    icon: "🛡️",
    headline: "Stay Safe",
    description: "Protect your money. Learn to avoid the most common DeFi mistakes before they happen.",
  },
  {
    id: "market",
    icon: "📊",
    headline: "Market Updates",
    description: "Short, plain-English updates on what's moving in crypto and why it matters to you.",
  },
]

export function InsightsHubClient({ articles }: { articles: InsightsArticle[] }) {
  const router = useRouter()
  const posthog = usePostHog()
  const preloadedPathsRef = useRef<Set<InsightsPath>>(new Set())

  const countByPath = pathTiles.reduce(
    (acc, tile) => {
      acc[tile.id] = articles.filter((a) => a.path === tile.id).length
      return acc
    },
    {} as Record<InsightsPath, number>
  )

  const preloadPath = (path: InsightsPath) => {
    if (preloadedPathsRef.current.has(path)) return
    router.prefetch(`/insights/${path}`)
    preloadedPathsRef.current.add(path)
  }

  useEffect(() => {
    captureInsightsEvent(posthog, "insights_hub_view", {
      path: "hub",
      total_articles: articles.length,
    })
  }, [articles.length, posthog])

  return (
    <div className="insights-layout insights-console">

      {/* ════ TOP BAR ════ */}
      <header className="ilc-topbar">
        <div className="ilc-topbar__brand">
          <span className="ilc-topbar__pip" aria-hidden="true" />
          <span className="ilc-topbar__label">Peridot Insights</span>
        </div>
      </header>

      {/* ════ HOME VIEW ════ */}
      <section className="ilc-home">
        <div className="ilc-home__copy">
          <p className="ilc-home__eyebrow">Learning center</p>
          <h1 className="ilc-home__headline">
            Learn DeFi.<br />At your own pace.
          </h1>
          <p className="ilc-home__sub">
            Pick a topic below. Every guide is written in plain English — no jargon, no noise.
          </p>
        </div>
        <div className="ilc-home__mascot" aria-hidden="true">
          <Image
            src="/Owl Mascot - Bitcoin - Colored.svg"
            alt=""
            width={200}
            height={200}
            className="ilc-home__owl"
            priority
          />
        </div>
      </section>

      <section className="ilc-path-grid" aria-label="Choose a learning topic">
        {pathTiles.map((tile) => (
          <Link
            key={tile.id}
            href={`/insights/${tile.id}`}
            className={`ilc-path-tile ilc-path-tile--${tile.id}`}
            onMouseEnter={() => preloadPath(tile.id)}
            onClick={() =>
              captureInsightsEvent(posthog, "insights_journey_step_select", {
                selected_path: tile.id,
                from: "home_tile",
              })
            }
          >
            <span className="ilc-path-tile__icon" aria-hidden="true">{tile.icon}</span>
            <div className="ilc-path-tile__body">
              <h2 className="ilc-path-tile__title">{tile.headline}</h2>
              <p className="ilc-path-tile__desc">{tile.description}</p>
            </div>
            <div className="ilc-path-tile__footer">
              <span className="ilc-path-tile__count">
                {countByPath[tile.id]} guide{countByPath[tile.id] !== 1 ? "s" : ""}
              </span>
              <span className="ilc-path-tile__arrow" aria-hidden="true">→</span>
            </div>
          </Link>
        ))}
      </section>

    </div>
  )
}
