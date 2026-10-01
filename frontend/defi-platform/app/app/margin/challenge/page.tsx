"use client"

/**
 * /app/margin/challenge — standings + live feed for the current trading challenge.
 *
 * The header is rendered from `config/challenges.ts` and never waits on the API,
 * so the page is readable (and honest about dates and prize) even when the
 * challenge routes aren't deployed yet — in that case the two panels degrade to
 * a calm "not available yet" note instead of an error.
 *
 * Copy rule: margin jargon (leverage, long/short, P&L) is expected here, but the
 * page still says plainly that this runs on our test network with play money.
 */
import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Info, Pencil, Trophy } from "lucide-react"
import { FEATURE_FLAGS } from "@/config/featureFlags"
import { getFeaturedChallenge, isChallengeLive, toChallengeMeta } from "@/config/challenges"
import { truncateStellarAddress } from "@/types/challenge"
import type { ChallengeMeta } from "@/types/challenge"
import { usePrivy } from "@privy-io/react-auth"
import { useStellarWallet } from "@/hooks/use-stellar-wallet"
import { useSetUsername, USERNAME_RE } from "@/hooks/use-set-username"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { challengeCountdown } from "../components/ChallengeBanner"
import { ChallengeLeaderboardTable } from "./components/ChallengeLeaderboardTable"
import { ChallengeChat } from "./components/ChallengeChat"
import { useChallengeChat, useChallengeLeaderboard, useJoinChallenge } from "./hooks/use-challenge"

// Same rule as the leaderboard username (and lib/challenge/handles.ts): the
// board shows the user's one Peridot name, so the format must match everywhere.
const HANDLE_RE = /^[a-zA-Z0-9_-]{3,32}$/

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen w-full">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">{children}</div>
    </div>
  )
}

function BackLink() {
  return (
    <Link
      href="/app/margin"
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
    >
      <ArrowLeft className="w-4 h-4" /> Back to trading
    </Link>
  )
}

export default function ChallengePage() {
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  // Featured, not active: a finished challenge keeps its page (marked "Ended")
  // so the final standings stay readable after the bell.
  const definition = FEATURE_FLAGS.MARGIN_TRADING_CHALLENGES ? getFeaturedChallenge() : null
  const slug = definition?.slug ?? null

  const leaderboard = useChallengeLeaderboard(slug)
  const chat = useChallengeChat(slug)

  // The server's meta wins when we have it (it knows the DB row); the config is
  // the offline fallback so the header never blanks.
  const meta: ChallengeMeta | null = useMemo(() => {
    if (leaderboard.data?.challenge) return leaderboard.data.challenge
    return definition ? toChallengeMeta(definition, new Date(now ?? Date.now())) : null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaderboard.data?.challenge, definition?.slug, now === null])

  if (!FEATURE_FLAGS.MARGIN_TRADING_CHALLENGES || !definition || !meta) {
    return (
      <Shell>
        <BackLink />
        <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.02] p-10 text-center">
          <Trophy className="w-6 h-6 mx-auto mb-3 text-muted-foreground" />
          <h1 className="text-lg font-bold text-foreground/90">No challenge running right now</h1>
          <p className="text-sm text-muted-foreground mt-1.5">
            The next one gets announced in the app. Keep trading in the meantime.
          </p>
        </div>
      </Shell>
    )
  }

  return (
    <Shell>
      <BackLink />
      <ChallengeContent
        meta={meta}
        blurb={definition.blurb}
        datesProvisional={definition.datesProvisional}
        live={isChallengeLive(definition, new Date(now ?? Date.now()))}
        now={now}
        leaderboard={leaderboard}
        chat={chat}
      />
    </Shell>
  )
}

function ChallengeContent({
  meta,
  blurb,
  datesProvisional,
  live,
  now,
  leaderboard,
  chat,
}: {
  meta: ChallengeMeta
  blurb: string
  /** Mask the clock: the window isn't announced yet (see config/challenges.ts). */
  datesProvisional?: boolean
  live: boolean
  now: number | null
  leaderboard: ReturnType<typeof useChallengeLeaderboard>
  chat: ReturnType<typeof useChallengeChat>
}) {
  const [tab, setTab] = useState<"board" | "feed">("board")
  const notAvailable = leaderboard.notAvailable
  const standings = leaderboard.data?.standings ?? []
  const self = leaderboard.data?.self ?? null
  const joined = leaderboard.data?.joined ?? false

  const endsAt = +new Date(meta.endsAt)
  const startsAt = +new Date(meta.startsAt)
  const clock =
    now === null
      ? null
      : now >= endsAt
        ? "Ended"
        : live
          ? `${challengeCountdown(endsAt - now, datesProvisional)} left`
          : `starts in ${challengeCountdown(startsAt - now, datesProvisional)}`

  return (
    <>
      {/* Header */}
      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl md:text-4xl font-black leading-tight text-foreground/90">{meta.title}</h1>
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-orange-500/20 text-orange-800 dark:text-orange-300 border border-orange-500/30 tabular-nums">
            ${meta.prizeUsd} prize
          </span>
          {clock && (
            <span
              className={cn(
                "px-2.5 py-1 rounded-full text-xs font-bold tabular-nums border",
                live
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                  : "bg-foreground/5 text-muted-foreground border-foreground/10",
              )}
            >
              {clock}
            </span>
          )}
        </div>
        <p className="mt-2 text-sm text-muted-foreground max-w-2xl">{blurb}</p>
        <p className="mt-2 inline-flex items-start gap-1.5 text-xs text-amber-800 dark:text-amber-300 bg-amber-500/10 border border-amber-500/25 rounded-lg px-2.5 py-1.5">
          <Info className="w-3.5 h-3.5 mt-px shrink-0" />
          <span>
            This runs on our test network. Nothing you trade here is real money — the prize is, the risk isn&apos;t.
          </span>
        </p>
        {leaderboard.data?.updatedAt && (
          <p className="mt-2 text-xs text-muted-foreground">
            {now !== null && now >= endsAt ? (
              <>
                Final standings — positions still open at the bell are marked at the closing price, so they count
                as they stood when the window shut.
              </>
            ) : (
              <>
                Standings updated {new Date(leaderboard.data.updatedAt).toLocaleTimeString()} — open positions are
                marked at the current price, so a row can move without anyone closing.
              </>
            )}
          </p>
        )}
      </div>

      {/* Join CTA */}
      {!notAvailable && !joined && now !== null && now < endsAt && <JoinCard slug={meta.slug} />}

      {/* Mobile tabs */}
      <div className="lg:hidden flex gap-1 p-1 rounded-xl bg-foreground/5 mb-4">
        {(["board", "feed"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "flex-1 py-2 rounded-lg text-sm font-bold transition-colors",
              tab === t ? "bg-background shadow-sm text-foreground" : "text-muted-foreground",
            )}
          >
            {t === "board" ? "Standings" : "Feed"}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-5">
        {/* Standings */}
        <div className={cn("rounded-2xl border border-foreground/10 bg-foreground/[0.02]", tab !== "board" && "hidden lg:block")}>
          {notAvailable ? (
            <NotAvailable what="standings" />
          ) : (
            <>
              {self && (
                <div className="px-3 pt-3">
                  <SelfRow standing={self} minTrades={meta.minTrades} onRenamed={leaderboard.refetch} />
                </div>
              )}
              <ChallengeLeaderboardTable
                standings={standings}
                minTrades={meta.minTrades}
                isLoading={leaderboard.isLoading}
                error={leaderboard.error && !leaderboard.data ? leaderboard.error.message : null}
                onRetry={leaderboard.refetch}
              />
            </>
          )}
        </div>

        {/* Feed */}
        <div
          className={cn(
            "rounded-2xl border border-foreground/10 bg-foreground/[0.02] flex flex-col h-[32rem] lg:h-[42rem]",
            tab !== "feed" && "hidden lg:flex",
          )}
        >
          <div className="px-4 py-3 border-b border-foreground/10">
            <h2 className="text-sm font-bold text-foreground/90">Live feed</h2>
            <p className="text-xs text-muted-foreground">
              Trades as they happen — and anyone signed in can chat, entered or not.
            </p>
          </div>
          <ChallengeChat
            messages={chat.messages}
            canPost={chat.canPost}
            // Posting needs an identity and nothing else — a Peridot login, or
            // a wallet that has entered. So the only reason the composer is
            // ever closed is that we cannot tell who is typing.
            disabledReason="Join the challenge — or sign in — to chat."
            isLoading={chat.isLoading}
            error={chat.error && chat.messages.length === 0 ? chat.error.message : null}
            notAvailable={chat.notAvailable}
            isPosting={chat.isPosting}
            postError={chat.postError}
            onPost={chat.post}
          />
        </div>
      </div>
    </>
  )
}

function NotAvailable({ what }: { what: string }) {
  return (
    <div className="p-10 text-center">
      <p className="text-sm font-medium text-foreground/80">The {what} aren&apos;t live yet.</p>
      <p className="text-sm text-muted-foreground mt-1">
        They switch on when the challenge starts — nothing for you to do.
      </p>
    </div>
  )
}

/** The pinned "your rank" strip, so a user never has to hunt for their own row. */
function SelfRow({
  standing,
  minTrades,
  onRenamed,
}: {
  standing: NonNullable<ReturnType<typeof useChallengeLeaderboard>["data"]>["self"]
  minTrades: number
  onRenamed: () => void
}) {
  if (!standing) return null
  const up = standing.pnlPct >= 0
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2.5">
      <span className="text-xs font-bold uppercase tracking-wider text-primary">Your rank</span>
      <span className="font-black tabular-nums text-foreground/90">
        {standing.ranked ? `#${standing.rank}` : "unranked"}
      </span>
      <span className="inline-flex items-center gap-1.5 text-sm text-foreground/80">
        {standing.handle}
        <ChangeNameButton current={standing.handle} onRenamed={onRenamed} />
      </span>
      <span
        className={cn(
          "text-sm font-bold tabular-nums",
          up ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400",
        )}
      >
        {up ? "+" : ""}
        {standing.pnlPct.toFixed(2)}%
      </span>
      {(standing.openTrades ?? 0) > 0 && (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75 animate-ping" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
          </span>
          {standing.openTrades} open — counted live, not banked yet
        </span>
      )}
      {!standing.ranked && (
        <span className="text-xs text-muted-foreground">
          {minTrades <= 1
            ? "Open a position to get ranked"
            : `${Math.max(0, minTrades - standing.trades - (standing.openTrades ?? 0))} more trades to qualify`}
        </span>
      )}
    </div>
  )
}

/**
 * Rename after joining. Not a challenge-local nickname edit: it goes through
 * the leaderboard's set-username flow — one Peridot name — and the server
 * carries the change onto every running challenge board. Works for Stellar
 * wallets: embedded/Privy-linked ones need no prompt, a kit wallet signs the
 * sign-in message once.
 */
function ChangeNameButton({ current, onRenamed }: { current: string; onRenamed: () => void }) {
  const { address } = useStellarWallet()
  const { save, saving } = useSetUsername()
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState(current)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setValue(current)
      setError(null)
    }
  }, [open, current])

  const valid = USERNAME_RE.test(value.trim())
  const same = value.trim().toLowerCase() === current.toLowerCase()

  async function submit() {
    if (!address) return
    const res = await save(address, value)
    if (!res.ok) {
      setError(res.error ?? "Could not save the name.")
      return
    }
    setOpen(false)
    onRenamed()
  }

  if (!address) return null
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label="Change your name"
          className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/10 transition-colors"
        >
          <Pencil className="w-3 h-3" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-sm rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-base font-bold">Change your name</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            This is your Peridot name — it changes on the main leaderboard too.
          </p>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value.slice(0, 32))}
            aria-label="Name"
            className={cn(
              "w-full rounded-xl bg-background/60 border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40",
              valid || value.length === 0 ? "border-foreground/15" : "border-red-500/50",
            )}
          />
          {!valid && value.length > 0 && (
            <p className="text-xs text-red-600 dark:text-red-400">
              3–32 characters; letters, numbers, dashes and underscores.
            </p>
          )}
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex justify-end">
            <button
              type="button"
              disabled={saving || !valid || same}
              onClick={submit}
              className="px-4 py-2 rounded-xl text-sm font-bold bg-primary text-primary-foreground hover:opacity-90
                disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function JoinCard({ slug }: { slug: string }) {
  const { address, isConnected } = useStellarWallet()
  const { ready, authenticated, login } = usePrivy()
  const join = useJoinChallenge()
  const [handle, setHandle] = useState("")
  const [optIn, setOptIn] = useState(true)

  const handleValid = handle.length === 0 || HANDLE_RE.test(handle)
  // What entering actually requires is the wallet whose trades get scored —
  // nothing else. Freighter users cannot hold a Privy account for that key
  // (Privy carries no external Stellar wallets), so gating the button on a
  // Privy session locked them out of a competition they were already trading
  // in; the server proves the address by signature instead. A Peridot login
  // stays worth having and is offered below, not demanded.
  const canOfferLogin = ready && !authenticated
  const disabled = !isConnected || !address || !handleValid || join.isPending

  return (
    <div className="mb-5 rounded-2xl border border-orange-500/30 bg-orange-500/[0.07] p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <Trophy className="w-5 h-5 mt-0.5 shrink-0 text-orange-600 dark:text-orange-400" />
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold text-foreground/90">Enter the challenge</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Pick a name others will see on the board. Leave it blank and we&apos;ll use your leaderboard
            name — or {address ? truncateStellarAddress(address) : "a short version of your wallet"} if
            you haven&apos;t set one.
          </p>

          <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-2">
            <input
              value={handle}
              onChange={(e) => setHandle(e.target.value.slice(0, 32))}
              placeholder="nickname (optional)"
              aria-label="Nickname"
              className={cn(
                "w-full sm:w-56 rounded-xl bg-background/60 border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/40",
                handleValid ? "border-foreground/15" : "border-red-500/50",
              )}
            />
            <button
              type="button"
              disabled={disabled}
              onClick={() =>
                join.mutate({ slug, address: address ?? "", handle: handle || undefined, feedOptIn: optIn })
              }
              className="px-4 py-2 rounded-xl text-sm font-bold bg-orange-500 hover:bg-orange-600 text-white
                disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {join.isPending ? "Joining…" : "Join"}
            </button>
          </div>

          {!handleValid && (
            <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">
              3–32 characters; letters, numbers, dashes and underscores.
            </p>
          )}

          <label className="mt-3 flex items-start gap-2 text-xs text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={optIn}
              onChange={(e) => setOptIn(e.target.checked)}
              className="mt-0.5 accent-orange-500"
            />
            <span>Post my opens and closes in the public feed (size and result, never my balances).</span>
          </label>

          {!isConnected ? (
            <p className="mt-2 text-xs text-amber-800 dark:text-amber-300">
              Connect your wallet on the trading page first — that&apos;s what your trades are scored from.
            </p>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">
              Your wallet is enough to enter — Freighter will ask you to sign a message so we know the
              address is yours. It moves nothing.
            </p>
          )}
          {canOfferLogin && isConnected && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              Optional:{" "}
              <button
                type="button"
                onClick={() => login()}
                className="underline underline-offset-2 hover:text-foreground transition-colors"
              >
                add a Peridot login
              </button>{" "}
              so we can reach you about the prize and keep one name across your wallets.
            </p>
          )}
          {join.isError && (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400">{(join.error as Error).message}</p>
          )}
        </div>
      </div>
    </div>
  )
}
