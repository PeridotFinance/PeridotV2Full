/**
 * Trading-challenge definitions for /app/margin.
 *
 * One source of truth for dates, prize and scoring — the banner, the
 * leaderboard page and the server scoring job all read from here, so ending a
 * challenge or starting the next one is an edit to this file plus a row in
 * `challenges` (the DB row is what the chat and participants FK against; this
 * file is what the UI and scoring read).
 *
 * IMPORTANT: margin runs on Stellar **testnet** (see
 * app/app/margin/config/stellarMarginConfig.ts). Testnet XLM is free from the
 * faucet, so the challenge is a skill contest on play money, not real capital
 * at risk — copy must say so, and payout requires the manual review pass in
 * scripts/challenge-reconcile.ts + the admin export.
 */
import type { ChallengeMeta, ChallengeScoring } from "@/types/challenge"

export interface ChallengeDefinition {
  slug: string
  title: string
  prizeUsd: number
  /** ISO 8601 with timezone. */
  startsAt: string
  endsAt: string
  scoring: ChallengeScoring
  /** Trades — open or closed — before a participant is ranked. */
  minTrades: number
  network: string
  /** One-line rule summary shown under the page header. */
  blurb: string
  /**
   * The window is not public yet: every countdown renders
   * {@link COUNTDOWN_PLACEHOLDER} instead of a number.
   *
   * The dates still bind — scoring drops trades outside [startsAt, endsAt) either
   * way — this only stops the UI from announcing a start date that hasn't been
   * committed to publicly. Drop the flag (or set it false) to reveal the clock.
   */
  datesProvisional?: boolean
}

/**
 * Live from Wednesday 2026-08-19 10:00 Europe/Berlin (08:00 UTC) for 10 days.
 *
 * The window is not decoration: `lib/challenge/scoring.ts` drops every journal
 * row outside it, so trades made before the challenge opened are still tracked
 * (the journal records everything, always) but cannot score. Moving `startsAt`
 * backwards would retroactively enter trades nobody made under contest rules.
 */
export const CHALLENGES: ChallengeDefinition[] = [
  {
    slug: "launch-2026-08",
    title: "Peridot Trading Challenge",
    prizeUsd: 100,
    startsAt: "2026-08-19T08:00:00Z",
    endsAt: "2026-08-29T08:00:00Z",
    scoring: "pnl_pct",
    // One trade puts you on the board. Anything higher means a trader who is
    // holding a position is invisible in the standings for as long as they hold
    // it, which is exactly when the race is most worth watching.
    minTrades: 1,
    network: "testnet",
    blurb:
      "Best return on our test network wins. Open positions count live at the current price — close before the bell to bank them. No real funds at risk, trade with faucet XLM.",
  },
]

export function getChallenge(slug: string): ChallengeDefinition | null {
  return CHALLENGES.find((c) => c.slug === slug) ?? null
}

/** The challenge to feature right now: live one first, else the next upcoming. */
export function getActiveChallenge(now: Date = new Date()): ChallengeDefinition | null {
  const live = CHALLENGES.find((c) => isChallengeLive(c, now))
  if (live) return live
  const upcoming = CHALLENGES.filter((c) => new Date(c.startsAt) > now).sort(
    (a, b) => +new Date(a.startsAt) - +new Date(b.startsAt),
  )
  return upcoming[0] ?? null
}

/**
 * How long a finished challenge keeps its seat in the UI.
 *
 * The banner, the header pill and the leaderboard page keep showing it — marked
 * "Ended" — for this long after `endsAt`, so the final standings stay one click
 * away instead of vanishing at the bell. Scoring is unaffected: it reads the
 * window, never this.
 */
export const ENDED_CHALLENGE_VISIBLE_MS = 30 * 86_400_000

export function isChallengeEnded(c: ChallengeDefinition, now: Date = new Date()): boolean {
  return now.getTime() >= +new Date(c.endsAt)
}

/**
 * The challenge the UI features: the live one, else the next upcoming one, else
 * the one that just ended (within {@link ENDED_CHALLENGE_VISIBLE_MS}).
 *
 * Distinct from {@link getActiveChallenge} on purpose — anything that *acts* on
 * a challenge (scoring, the trade feed, seeding) must not pick up a finished
 * one, while the UI has to keep it visible for a while.
 */
export function getFeaturedChallenge(now: Date = new Date()): ChallengeDefinition | null {
  const active = getActiveChallenge(now)
  if (active) return active
  const t = now.getTime()
  const recent = CHALLENGES.filter((c) => {
    const ended = +new Date(c.endsAt)
    return t >= ended && t - ended < ENDED_CHALLENGE_VISIBLE_MS
  }).sort((a, b) => +new Date(b.endsAt) - +new Date(a.endsAt))
  return recent[0] ?? null
}

export function isChallengeLive(c: ChallengeDefinition, now: Date = new Date()): boolean {
  const t = now.getTime()
  return t >= +new Date(c.startsAt) && t < +new Date(c.endsAt)
}

/** Definition → the wire shape the client consumes. */
export function toChallengeMeta(c: ChallengeDefinition, now: Date = new Date()): ChallengeMeta {
  return {
    slug: c.slug,
    title: c.title,
    prizeUsd: c.prizeUsd,
    startsAt: c.startsAt,
    endsAt: c.endsAt,
    scoring: c.scoring,
    minTrades: c.minTrades,
    network: c.network,
    isLive: isChallengeLive(c, now),
    secondsRemaining: Math.round((+new Date(c.endsAt) - now.getTime()) / 1000),
  }
}
