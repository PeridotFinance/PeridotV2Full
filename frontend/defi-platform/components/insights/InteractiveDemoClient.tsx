"use client"

import Image from "next/image"
import Link from "next/link"
import "@/styles/interactive-blocks.css"
import { InteractiveBlock } from "@/components/insights/interactive"
import type { InsightsBlock } from "@/lib/insights-data"

const demoBlocks: InsightsBlock[] = [
  { type: "heading", text: "What is a Health Factor?" },
  {
    type: "paragraph",
    text: "In DeFi lending, your health factor is a single number that represents how safe your position is. A health factor above 1.0 means your collateral covers your debt. Below 1.0, liquidation begins.",
  },
  {
    type: "paragraph",
    text: "Unlike a bank, DeFi protocols are automated. There is no phone call, no grace period. When the protocol detects your health factor below the threshold, it automatically triggers liquidation to protect the system.",
  },
  {
    type: "predict",
    prompt:
      "You have $2,000 collateral and an $800 loan. ETH drops 50% overnight. What happens to your health factor?",
    options: [
      "It drops 50% — from ~2.0 to ~1.0",
      "It drops 50% — from ~2.0 to ~0.5 (below liquidation threshold)",
      "Nothing — the buffer protects you fully",
      "It depends on the liquidation LTV threshold",
    ],
    correctIndex: 3,
    reveal:
      "The correct answer depends on your liquidation LTV. If the protocol sets liquidation LTV at 80%, your health factor starts at (2000 × 0.8) / 800 = 2.0. After a 50% ETH drop: (1000 × 0.8) / 800 = 1.0 — exactly at the threshold. With a lower LTV, you would already be liquidated. This is why understanding your specific protocol's parameters matters.",
  },
  { type: "heading", text: "The Health Factor Formula" },
  {
    type: "paragraph",
    text: "Health Factor = (Collateral Value × Liquidation LTV) / Total Debt. The liquidation LTV is set by the protocol for each asset — typically 75–85% for major assets like ETH and BTC.",
  },
  {
    type: "callout",
    text: "A health factor of 1.5 means your collateral can drop 33% before liquidation. At 1.2, only a 17% drop triggers it. At 1.05, you are 5% away from automatic liquidation.",
  },
  {
    type: "calculator",
    variant: "health-factor",
    label: "Health Factor Explorer",
  },
  { type: "heading", text: "APY vs APR — Why Two Numbers?" },
  {
    type: "paragraph",
    text: "Protocols always show two numbers: APR (the base rate) and APY (what you actually earn with compounding). At low rates the difference is small. Drag the sliders to see what happens at DeFi-scale yields.",
  },
  {
    type: "apy-snowball",
    rate: 24,
    months: 12,
  },
  { type: "heading", text: "Not All Collateral is Equal" },
  {
    type: "paragraph",
    text: "Add different assets and see how much you can actually borrow. USDC gets a 90% LTV — the protocol trusts it. ETH gets 80%. More volatile assets get less. The safety buffer is the protocol's protection against rapid price drops.",
  },
  {
    type: "borrowing-power",
    assets: ["eth", "eth", "usdc"],
  },
  { type: "heading", text: "Pull Blocks, Watch the Tower Fall" },
  {
    type: "paragraph",
    text: "Here is the intuition made physical. Each block is $200 of collateral. The loan weight sits on top. Drag blocks out and watch the health factor update in real time.",
  },
  {
    type: "jenga",
    loanAmount: 800,
    liqLtv: 80,
    initialBlocks: 9,
  },
  { type: "heading", text: "Build a Collateral Position" },
  {
    type: "paragraph",
    text: "Now try the other direction. Add assets to a vault and see how total collateral value accumulates. Different assets have different values — one BTC outweighs many USDC stablecoins.",
  },
  {
    type: "vault-builder",
    targetCollateral: 5000,
  },
  { type: "heading", text: "Leverage Amplifies Everything" },
  {
    type: "paragraph",
    text: "Borrowing to buy more of what you borrowed against is called looping. It multiplies both gains and losses — and shrinks your liquidation buffer fast. Move the slider to feel the risk.",
  },
  {
    type: "leverage-seesaw",
    maxLeverage: 5,
  },
  { type: "heading", text: "How Interest Rates Work" },
  {
    type: "paragraph",
    text: "DeFi protocols use a kinked rate model. Below ~80% utilization, rates stay low to encourage borrowing. Cross the kink and rates spike sharply — designed to attract new depositors and slow borrowers.",
  },
  {
    type: "rate-highway",
    kinkUtilization: 80,
  },
  { type: "heading", text: "What Moves Your Health Factor" },
  {
    type: "paragraph",
    text: "Three things change your health factor: collateral price, loan amount, and interest accrual. Collateral price is the biggest driver — a 20% drop in ETH is a 20% drop in your health buffer.",
  },
  {
    type: "paragraph",
    text: "Interest accrual is slower but relentless. A position left unmonitored for weeks will slowly drift closer to liquidation even if prices stay flat.",
  },
  {
    type: "checkpoint",
    question:
      "Your health factor is 1.3. ETH drops 25%. Approximately what is your new health factor?",
    options: [
      {
        text: "~1.05 — still above 1.0 but dangerous",
        correct: false,
        explanation:
          "Close, but not quite. If HF = 1.3 and your collateral drops 25%, your new collateral value is 75% of before. New HF ≈ 1.3 × 0.75 = 0.975 — you would be liquidated.",
      },
      {
        text: "~0.97 — below 1.0, liquidation triggered",
        correct: true,
        explanation:
          "Correct. HF scales linearly with collateral value. A 25% drop multiplies your health factor by 0.75: 1.3 × 0.75 = 0.975. Since this is below 1.0, the protocol triggers liquidation automatically.",
      },
      {
        text: "~1.3 — the health factor stays the same",
        correct: false,
        explanation:
          "The health factor changes directly with collateral value. If collateral drops 25%, the numerator of the HF formula drops 25%, so HF drops proportionally.",
      },
      {
        text: "~1.55 — it actually increases as prices fall",
        correct: false,
        explanation:
          "Health factor decreases when collateral value decreases — it never increases when asset prices fall (assuming your debt stays fixed).",
      },
    ],
  },
  {
    type: "callout",
    text: "Rule of thumb: keep your health factor above 1.5 for short positions, above 2.0 for long-term holds. The closer to 1.0, the more actively you need to monitor.",
  },
  { type: "heading", text: "Put It All Together" },
  {
    type: "paragraph",
    text: "Design a real position from scratch. Choose your collateral, set your loan, and see exactly where your health factor lands — and what it takes to put it at risk.",
  },
  { type: "position-builder" },
  { type: "heading", text: "When One Falls, Others Follow" },
  {
    type: "paragraph",
    text: "Liquidations aren't isolated events. Each liquidation dumps collateral on-market, pushing prices slightly lower — which drops everyone else's health factor. At high market stress, this cascades. Frank's position is already underwater. Click it to see what happens next.",
  },
  {
    type: "liquidation-dominoes",
  },
]

function slugifyHeading(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
}

export function InteractiveDemoClient() {
  let headingIndex = -1

  return (
    <div className="insights-article insights-console">
      {/* ── Progress bar (static demo) ── */}
      <div
        className="ia-progress"
        role="progressbar"
        aria-valuenow={0}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span className="ia-progress__fill ia-progress__fill--risk" style={{ width: "0%" }} />
      </div>

      {/* ── Demo banner ── */}
      <div className="iab-demo-banner">
        <span className="iab-demo-banner__icon">🧪</span>
        <span>
          <strong>Interactive Demo</strong> — Exploring new learning formats for Peridot Insights.
          These blocks are experimental and live alongside regular articles.
        </span>
      </div>

      {/* ── Chapter context bar ── */}
      <nav className="ia-chapter-bar" aria-label="Lesson location">
        <Link href="/insights/risk" className="ia-chapter-bar__path">
          Stay Safe
        </Link>
        <span className="ia-chapter-bar__sep" aria-hidden="true">›</span>
        <span className="ia-chapter-bar__chapter">Chapter 1: Before You Borrow</span>
        <span className="ia-chapter-bar__sep" aria-hidden="true">›</span>
        <span className="ia-chapter-bar__lesson">Demo Lesson</span>
      </nav>

      {/* ── Article header ── */}
      <header className="ia-header ia-header--risk">
        <div className="ia-header__body">
          <div className="ia-header__top-row">
            <span className="ia-header__kicker ia-header__kicker--risk">Stay Safe</span>
            <div className="ia-header__meta">
              <span className="ia-header__time">6 min read</span>
              <span className="insights-difficulty insights-difficulty--intermediate">
                Intermediate
              </span>
            </div>
          </div>
          <h1 className="ia-header__title">Understanding Health Factor in DeFi Lending</h1>
          <p className="ia-header__excerpt">
            Your health factor is the single most important number in DeFi lending. Learn what it
            is, how it moves, and what happens when it reaches 1.0.
          </p>
        </div>
        <div className="ia-header__mascot" aria-hidden="true">
          <Image
            src="/Owl Mascot - Colored.svg"
            alt=""
            width={160}
            height={160}
            className="ia-header__owl"
            priority
          />
        </div>
      </header>

      {/* ── What you'll learn ── */}
      <div className="ia-brief">
        <p className="ia-brief__kicker">What you&apos;ll learn</p>
        <ul className="ia-brief__list">
          <li className="ia-brief__item">
            <span className="ia-brief__check" aria-hidden="true">
              ✓
            </span>
            <span>How the health factor formula works and what drives it.</span>
          </li>
          <li className="ia-brief__item">
            <span className="ia-brief__check" aria-hidden="true">
              ✓
            </span>
            <span>How to use the interactive calculator to model your own positions.</span>
          </li>
          <li className="ia-brief__item">
            <span className="ia-brief__check" aria-hidden="true">
              ✓
            </span>
            <span>What a 25% price drop does to a health factor of 1.3.</span>
          </li>
        </ul>
      </div>

      {/* ── Body ── */}
      <section className="insights-article__experience">
        <div className="insights-article__content">
          <div className="insights-article__body">
            {demoBlocks.map((block, index) => {
              const blockStyle = { animationDelay: `${80 + index * 35}ms` }

              if (block.type === "heading") {
                headingIndex += 1
                const id = `section-${headingIndex + 1}-${slugifyHeading(block.text)}`
                return (
                  <section
                    key={`heading-${index}`}
                    className="insights-article-block insights-article-block--heading"
                    style={blockStyle}
                    id={id}
                  >
                    <h2>
                      <span className="insights-heading-chip">
                        {String(headingIndex + 1).padStart(2, "0")}
                      </span>
                      {block.text}
                    </h2>
                  </section>
                )
              }

              if (block.type === "callout") {
                return (
                  <section
                    key={`callout-${index}`}
                    className="insights-article-block insights-article-block--callout"
                    style={blockStyle}
                  >
                    <aside className="ia-callout ia-callout--risk">
                      <span className="ia-callout__icon" aria-hidden="true">
                        💡
                      </span>
                      <p>{block.text}</p>
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
                    key={`interactive-${index}`}
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
                    key={`paragraph-${index}`}
                    className="insights-article-block insights-article-block--paragraph"
                    style={blockStyle}
                  >
                    <p>{block.text}</p>
                  </section>
                )
              }

              return null
            })}
          </div>
        </div>

        {/* ── Sidebar stub ── */}
        <aside className="insights-article__rail" aria-label="Article navigation">
          <p className="insights-article__rail-kicker">In this guide</p>
          <p className="insights-article__rail-progress">0% read</p>
          <nav className="insights-article__rail-nav">
            <a href="#section-1-what-is-a-health-factor" className="is-active">
              <span>01</span>
              <strong>What is a Health Factor?</strong>
            </a>
            <a href="#section-2-the-health-factor-formula">
              <span>02</span>
              <strong>The Health Factor Formula</strong>
            </a>
            <a href="#section-3-not-all-collateral-is-equal">
              <span>03</span>
              <strong>Not All Collateral is Equal</strong>
            </a>
            <a href="#section-4-pull-blocks-watch-the-tower-fall">
              <span>04</span>
              <strong>Pull Blocks, Watch the Tower Fall</strong>
            </a>
            <a href="#section-5-build-a-collateral-position">
              <span>05</span>
              <strong>Build a Collateral Position</strong>
            </a>
            <a href="#section-6-leverage-amplifies-everything">
              <span>06</span>
              <strong>Leverage Amplifies Everything</strong>
            </a>
            <a href="#section-7-how-interest-rates-work">
              <span>07</span>
              <strong>How Interest Rates Work</strong>
            </a>
            <a href="#section-8-what-moves-your-health-factor">
              <span>08</span>
              <strong>What Moves Your Health Factor</strong>
            </a>
            <a href="#section-9-when-one-falls-others-follow">
              <span>09</span>
              <strong>When One Falls, Others Follow</strong>
            </a>
          </nav>
        </aside>
      </section>

      {/* ── Lesson nav placeholder ── */}
      <nav className="ia-lesson-nav" aria-label="Lesson navigation">
        <Link
          href="/insights/risk/liquidation-safe-zones"
          className="ia-lesson-nav__card ia-lesson-nav__card--prev"
        >
          <span className="ia-lesson-nav__direction">← Previous</span>
          <span className="ia-lesson-nav__title">Define Liquidation Safe Zones</span>
          <span className="ia-lesson-nav__meta">Chapter 1 · Lesson 1</span>
        </Link>
        <Link
          href="/insights/risk/setting-up-alerts-that-actually-work"
          className="ia-lesson-nav__card ia-lesson-nav__card--next"
        >
          <span className="ia-lesson-nav__direction">Next →</span>
          <span className="ia-lesson-nav__title">Setting Up Alerts That Actually Work</span>
          <span className="ia-lesson-nav__meta">Lesson 2 of 2</span>
        </Link>
      </nav>

      {/* ── Footer CTA ── */}
      <div className="ia-footer-cta ia-footer-cta--risk">
        <div className="ia-footer-cta__inner">
          <p className="ia-footer-cta__eyebrow">Ready to apply this?</p>
          <h2 className="ia-footer-cta__heading">Put it into practice.</h2>
          <p className="ia-footer-cta__sub">
            Open the app and try this in a real position, no minimums, no lock-ins.
          </p>
          <div className="ia-footer-cta__actions">
            <Link href="/app" className="insights-btn insights-btn--primary">
              Manage Collateral in App
            </Link>
            <Link href="/insights" className="insights-btn insights-btn--ghost">
              ← Back to Insights
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
