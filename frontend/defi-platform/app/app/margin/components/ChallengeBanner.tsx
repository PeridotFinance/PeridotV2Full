"use client"

/**
 * ChallengeBanner — the promo strip for the active trading challenge.
 *
 * Deliberately API-free: everything it shows (title, prize, window) comes from
 * `config/challenges.ts`, so the strip is correct even before the challenge API
 * is deployed and it never flashes a spinner above the trading UI.
 *
 * It renders nothing at all when the feature flag is off or there is no
 * challenge to feature, and it counts down to `startsAt` ("starts in 2d 03h")
 * before the window opens. Once the window closes it does NOT disappear: it
 * stays as a muted "Ended" strip linking to the final standings, until
 * `getFeaturedChallenge` stops featuring it.
 * A challenge marked `datesProvisional` shows "Xx" in place of every figure —
 * the window is real and binds scoring, it just isn't announced yet.
 *
 * Dismissing (X) doesn't discard the leaderboard entry point — it DOCKS it: the
 * strip flies into the site header (see ChallengeHeaderPill) and stays there as
 * a compact pill for the rest of the challenge. Dock state is per slug
 * (localStorage), so the next challenge brings the strip back on its own.
 */
import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { motion } from "framer-motion"
import { Trophy, X } from "lucide-react"
import { FEATURE_FLAGS } from "@/config/featureFlags"
import { getFeaturedChallenge, isChallengeLive } from "@/config/challenges"
import {
  CHALLENGE_PILL_ANCHOR_ID,
  announceChallengeDock,
  isChallengeDocked,
  persistChallengeDock,
} from "@/components/challenge/challengeDock"

/** "3d 04h" / "4h 12m" / "9m 30s" — coarse up top, precise at the end. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const d = Math.floor(total / 86400)
  const h = Math.floor((total % 86400) / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (d > 0) return `${d}d ${String(h).padStart(2, "0")}h`
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`
  return `${s}s`
}

/** Stand-in for a countdown whose dates aren't public yet (`datesProvisional`). */
export const COUNTDOWN_PLACEHOLDER = "Xx"

/**
 * The countdown as the user should see it: the real clock, or the placeholder
 * while the challenge window is unannounced. Only the FIGURE is masked — the
 * "starts in …" / "… left" framing still says which side of the start we're on,
 * which is public knowledge either way.
 */
export function challengeCountdown(ms: number, provisional?: boolean): string {
  return provisional ? COUNTDOWN_PLACEHOLDER : formatCountdown(ms)
}

/** The banner shrunk to pill size, mid-flight from the strip to the header. */
interface Flight {
  from: { left: number; top: number; width: number; height: number }
  to: { x: number; y: number }
}

export function ChallengeBanner() {
  // The countdown re-renders every second; `now` also doubles as the mounted
  // flag so server and first client render agree (both null → nothing).
  const [now, setNow] = useState<number | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [flight, setFlight] = useState<Flight | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  // Cheap enough to recompute per render (a find over a handful of configs), and
  // recomputing is what lets an upcoming challenge flip to live without a reload.
  const challenge = FEATURE_FLAGS.MARGIN_TRADING_CHALLENGES
    ? getFeaturedChallenge(new Date(now ?? Date.now()))
    : null
  const slug = challenge?.slug ?? null

  useEffect(() => {
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!slug) return
    setDismissed(isChallengeDocked(slug))
  }, [slug])

  if (!FEATURE_FLAGS.MARGIN_TRADING_CHALLENGES) return null
  if (!challenge || now === null) return null

  const endsAt = +new Date(challenge.endsAt)
  const startsAt = +new Date(challenge.startsAt)
  const ended = now >= endsAt

  const live = isChallengeLive(challenge, new Date(now))
  const timing = ended
    ? "Ended"
    : live
      ? `${challengeCountdown(endsAt - now, challenge.datesProvisional)} left`
      : `starts in ${challengeCountdown(startsAt - now, challenge.datesProvisional)}`

  const dismiss = () => {
    persistChallengeDock(challenge.slug)
    setDismissed(true)

    // Fly the strip into the header pill's anchor. Measured up-front because the
    // strip unmounts this same render; a missing/hidden anchor (mobile header,
    // tests) falls back to the top-right corner, which is where the header
    // controls live anyway.
    const from = rootRef.current?.getBoundingClientRect()
    if (!from || from.width <= 0) {
      announceChallengeDock(challenge.slug)
      return
    }
    const anchor = document.getElementById(CHALLENGE_PILL_ANCHOR_ID)
    const a = anchor?.getBoundingClientRect()
    const to =
      a && (a.top !== 0 || a.left !== 0)
        ? { x: a.left, y: a.top }
        : { x: window.innerWidth - 120, y: 28 }
    setFlight({ from: { left: from.left, top: from.top, width: from.width, height: from.height }, to })
  }

  const landFlight = () => {
    setFlight(null)
    announceChallengeDock(challenge.slug)
  }

  if (dismissed) {
    if (!flight) return null
    const { from, to } = flight
    // The flight arcs: up and out of the content flow first, then into the
    // header. Keyframes carry the whole morph — strip → chip — in one gesture.
    const midX = from.left + (to.x - from.left) * 0.55
    const arcY = Math.min(from.top, to.y) - 44
    return (
      <>
        {/* The banner's slot, collapsing at the same tempo the clone departs so
            the page settles instead of snapping up. Empty on purpose. */}
        <motion.div
          aria-hidden
          initial={{ height: from.height, marginBottom: 20, opacity: 0 }}
          animate={{ height: 0, marginBottom: 0 }}
          transition={{ duration: 0.45, ease: [0.32, 0.72, 0, 1] }}
          className="overflow-hidden"
        />
        {createPortal(
          <motion.div
            aria-hidden
            initial={{
              left: from.left,
              top: from.top,
              width: from.width,
              height: from.height,
              borderRadius: 12,
              opacity: 1,
              scale: 1,
            }}
            animate={{
              left: [from.left, midX, to.x],
              top: [from.top, arcY, to.y],
              width: [from.width, 120, 34],
              height: [from.height, 38, 34],
              borderRadius: [12, 999, 999],
              opacity: [1, 1, 0.95],
              scale: [1, 1.04, 0.92],
            }}
            transition={{ duration: 0.7, times: [0, 0.45, 1], ease: [0.22, 1, 0.36, 1] }}
            onAnimationComplete={landFlight}
            className="fixed z-[110] pointer-events-none flex items-center justify-center gap-2 overflow-hidden
              border border-orange-500/40 bg-orange-500/15 backdrop-blur-sm
              shadow-lg shadow-orange-500/25"
          >
            <Trophy className="w-4 h-4 shrink-0 text-orange-600 dark:text-orange-400" />
            {/* The banner's words dissolve early in the flight — what lands in
                the header is just the trophy. */}
            <motion.span
              initial={{ opacity: 1 }}
              animate={{ opacity: 0 }}
              transition={{ duration: 0.28, ease: "easeOut" }}
              className="text-sm font-semibold whitespace-nowrap text-orange-900 dark:text-orange-200"
            >
              {challenge.title}
            </motion.span>
          </motion.div>,
          document.body,
        )}
      </>
    )
  }

  return (
    <div
      ref={rootRef}
      data-testid="challenge-banner"
      className={`mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 rounded-xl border text-sm ${
        ended
          ? "border-foreground/10 bg-foreground/[0.04] text-foreground/80"
          : "border-orange-500/30 bg-orange-500/10 text-orange-900 dark:text-orange-200"
      }`}
    >
      <Trophy
        className={`w-4 h-4 shrink-0 ${ended ? "text-muted-foreground" : "text-orange-600 dark:text-orange-400"}`}
      />
      <span className="font-semibold">{challenge.title}</span>
      <span
        className={`px-2 py-0.5 rounded-full text-xs font-bold tabular-nums border ${
          ended ? "bg-foreground/5 border-foreground/10" : "bg-orange-500/20 border-orange-500/30"
        }`}
      >
        ${challenge.prizeUsd} prize
      </span>
      <span data-testid="challenge-banner-timing" className="text-xs font-medium tabular-nums opacity-80">
        {timing}
      </span>
      <div className="ml-auto flex items-center gap-1">
        <Link
          href="/app/margin/challenge"
          className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
            ended
              ? "border border-foreground/15 bg-foreground/5 hover:bg-foreground/10 text-foreground/80"
              : "bg-orange-500 hover:bg-orange-600 text-white"
          }`}
        >
          {ended ? "Final standings" : "View leaderboard"}
        </Link>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss challenge banner"
          className={`p-1.5 rounded-full transition-colors ${ended ? "hover:bg-foreground/10" : "hover:bg-orange-500/20"}`}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

export default ChallengeBanner
