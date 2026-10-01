"use client"

/**
 * ChallengeHeaderPill — the trading challenge's permanent seat in the site
 * header.
 *
 * The promo banner on /app/margin is loud by design and dismissible; this pill
 * is where it goes when dismissed. It renders two things:
 *
 *   1. An invisible zero-size anchor (always, while a challenge is featured) —
 *      the banner's fly-out animation measures it to know where "the header"
 *      is. It has to exist BEFORE dismissal, which is why it isn't part of the
 *      pill itself.
 *   2. The pill (only once docked): trophy + live countdown, linking to the
 *      leaderboard. It pops in as the fly-out lands.
 *
 * Like the banner it is API-free: everything comes from `config/challenges.ts`.
 * After the challenge ends it stays put, reading "Ended" instead of a
 * countdown, so the final standings keep a way in.
 */
import { useEffect, useState } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import { Trophy } from "lucide-react"
import { FEATURE_FLAGS } from "@/config/featureFlags"
import { getFeaturedChallenge, isChallengeLive } from "@/config/challenges"
import { formatCountdown } from "@/app/app/margin/components/ChallengeBanner"
import { CHALLENGE_PILL_ANCHOR_ID, useChallengeDocked } from "./challengeDock"

export function ChallengeHeaderPill({
  withAnchor = true,
  compact = false,
  className,
}: {
  /** Render the fly-out anchor. Exactly ONE instance may do this (element id). */
  withAnchor?: boolean
  /** Icon-only variant for the mobile header row. */
  compact?: boolean
  /** Applied only when the pill actually renders (spacing must not leak). */
  className?: string
}) {
  // `now` doubles as the mounted flag (server + first client render both null).
  const [now, setNow] = useState<number | null>(null)

  const challenge = FEATURE_FLAGS.MARGIN_TRADING_CHALLENGES
    ? getFeaturedChallenge(new Date(now ?? Date.now()))
    : null
  const docked = useChallengeDocked(challenge?.slug ?? null)

  useEffect(() => {
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  if (!challenge || now === null) return null
  const endsAt = +new Date(challenge.endsAt)
  const startsAt = +new Date(challenge.startsAt)
  const ended = now >= endsAt

  const live = isChallengeLive(challenge, new Date(now))
  const countdown = ended
    ? "Ended"
    : live
      ? `${formatCountdown(endsAt - now)} left`
      : `in ${formatCountdown(startsAt - now)}`

  return (
    <>
      {/* Fly-out target — must exist before the pill does. */}
      {withAnchor && <span id={CHALLENGE_PILL_ANCHOR_ID} aria-hidden className="block w-0 h-0" />}
      {docked && (
        <motion.div
          initial={{ opacity: 0, scale: 0.4, y: -6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 380, damping: 24 }}
          className={className}
        >
          <Link
            href="/app/margin/challenge"
            data-testid="challenge-header-pill"
            title={
              ended
                ? `${challenge.title} — ended, final standings`
                : `${challenge.title} — $${challenge.prizeUsd} prize`
            }
            className={`flex items-center rounded-full border transition-colors ${
              ended
                ? "border-foreground/15 bg-foreground/5 hover:bg-foreground/10 text-muted-foreground"
                : "border-orange-500/40 bg-orange-500/15 hover:bg-orange-500/25 text-orange-700 dark:text-orange-300"
            } ${compact ? "justify-center w-8 h-8" : "gap-1.5 h-8 px-3"}`}
          >
            <Trophy
              className={`w-3.5 h-3.5 shrink-0 ${ended ? "text-muted-foreground" : "text-orange-600 dark:text-orange-400"}`}
            />
            {!compact && (
              <span className="text-[11px] font-bold tabular-nums whitespace-nowrap">{countdown}</span>
            )}
          </Link>
        </motion.div>
      )}
    </>
  )
}

export default ChallengeHeaderPill
