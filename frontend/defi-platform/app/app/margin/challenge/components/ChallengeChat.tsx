"use client"

/**
 * The challenge feed: trash talk and trades in one stream.
 *
 * Three message kinds share the timeline — `user` chat bubbles, `trade` cards
 * rendered from the server-written `meta` payload, and `system` notices. Only
 * `user` messages come from the composer; the other two are server-authored, so
 * nothing here trusts client input to describe a trade.
 *
 * Auto-scroll only happens when the reader is already at the bottom — scrolling
 * back to read something and being yanked away by a stranger's trade is the
 * fastest way to make a live feed unusable.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { ArrowDown, MessageSquare, Send, TrendingDown, TrendingUp } from "lucide-react"
import type { ChallengeMessage, ChallengeTradeMeta } from "@/types/challenge"
import { cn } from "@/lib/utils"

const MAX_BODY = 500
/** Treat "within this many px of the bottom" as being at the bottom. */
const STICK_PX = 60

function isTradeMeta(m: ChallengeMessage): m is ChallengeMessage & { meta: ChallengeTradeMeta } {
  const meta = m.meta as ChallengeTradeMeta | null
  return m.kind === "trade" && !!meta && (meta.event === "open" || meta.event === "close")
}

function fmtUsd(v: number, signed = false): string {
  const sign = signed ? (v > 0 ? "+" : v < 0 ? "-" : "") : ""
  return `${sign}$${Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
}

function fmtTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
}

function TradeCard({ m, meta }: { m: ChallengeMessage; meta: ChallengeTradeMeta }) {
  const long = meta.side === "Long"
  const lev = `${(meta.leverageX100 / 100).toFixed(meta.leverageX100 % 100 === 0 ? 0 : 1)}×`
  const pnl = meta.pnlUsd ?? null
  const up = (pnl ?? 0) >= 0
  const closing = meta.event === "close"

  return (
    <div
      data-testid="challenge-trade-card"
      className={cn(
        "rounded-xl border px-3 py-2.5 text-sm",
        long
          ? "border-emerald-500/25 bg-emerald-500/[0.07]"
          : "border-red-500/25 bg-red-500/[0.07]",
      )}
    >
      <div className="flex items-center gap-2 flex-wrap">
        {long ? (
          <TrendingUp className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
        ) : (
          <TrendingDown className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400" />
        )}
        <span className="text-foreground/90">
          <span className="font-bold">{m.handle}</span>{" "}
          {closing ? "closed" : "opened"} a <span className="font-bold">{lev} {meta.side}</span>
          {meta.symbol ? <> on {meta.symbol}</> : null}
          {meta.notionalUsd ? <> · <span className="font-semibold tabular-nums">{fmtUsd(meta.notionalUsd)}</span></> : null}
        </span>
        <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">{fmtTime(m.createdAt)}</span>
      </div>
      {closing && pnl !== null && (
        <div className="mt-1.5 flex items-baseline gap-2">
          <span
            className={cn(
              "text-base font-black tabular-nums",
              up ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400",
            )}
          >
            {fmtUsd(pnl, true)}
          </span>
          {meta.pnlPct !== null && meta.pnlPct !== undefined && (
            <span className={cn("text-xs font-bold tabular-nums", up ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
              {meta.pnlPct > 0 ? "+" : ""}
              {meta.pnlPct.toFixed(2)}%
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function SystemNotice({ m }: { m: ChallengeMessage }) {
  return (
    <div className="text-center text-xs text-muted-foreground py-1">
      <span className="px-2.5 py-1 rounded-full bg-foreground/5">{m.body}</span>
    </div>
  )
}

function UserMessage({ m }: { m: ChallengeMessage }) {
  return (
    <div className={cn("flex flex-col gap-0.5", m.isSelf && "items-end")}>
      <div className="flex items-baseline gap-2 text-xs">
        <span className={cn("font-bold", m.isSelf ? "text-primary" : "text-foreground/70")}>
          {m.isSelf ? "You" : m.handle}
        </span>
        <span className="text-muted-foreground tabular-nums">{fmtTime(m.createdAt)}</span>
      </div>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words",
          m.isSelf ? "bg-primary/15 text-foreground/90" : "bg-foreground/[0.06] text-foreground/90",
        )}
      >
        {m.body}
      </div>
    </div>
  )
}

interface Props {
  messages: ChallengeMessage[]
  canPost: boolean
  /** Why posting is off — shown in place of the composer's placeholder. */
  disabledReason?: string
  isLoading?: boolean
  error?: string | null
  notAvailable?: boolean
  isPosting?: boolean
  postError?: string | null
  onPost: (body: string) => void | Promise<void>
}

export function ChallengeChat({
  messages,
  canPost,
  disabledReason,
  isLoading,
  error,
  notAvailable,
  isPosting,
  postError,
  onPost,
}: Props) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [atBottom, setAtBottom] = useState(true)
  const [draft, setDraft] = useState("")

  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight <= STICK_PX)
  }

  // Layout effect so the jump happens before paint — no visible scroll jitter.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el || !atBottom) return
    el.scrollTop = el.scrollHeight
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length])

  useEffect(() => {
    // First paint with content: land at the bottom regardless.
    const el = scrollRef.current
    if (el && messages.length > 0 && el.scrollTop === 0) el.scrollTop = el.scrollHeight
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length > 0])

  const submit = async () => {
    const body = draft.trim()
    if (!body || !canPost || isPosting) return
    setDraft("")
    await onPost(body)
  }

  const remaining = MAX_BODY - draft.length

  return (
    <div className="flex flex-col h-full min-h-0">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="relative flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-3"
        data-testid="challenge-feed"
      >
        {notAvailable ? (
          <div className="h-full flex items-center justify-center text-center text-sm text-muted-foreground px-6">
            The feed opens with the challenge.
          </div>
        ) : error ? (
          <div className="h-full flex items-center justify-center text-center text-sm px-6">
            <div>
              <p className="text-foreground/80 font-medium">The feed dropped out.</p>
              <p className="text-muted-foreground mt-1">It reconnects on its own in a few seconds.</p>
            </div>
          </div>
        ) : isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-12 rounded-xl bg-foreground/5 animate-pulse" />
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-center px-6">
            <div>
              <MessageSquare className="w-5 h-5 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground/80">Nothing here yet.</p>
              <p className="text-sm text-muted-foreground mt-1">
                Trades show up here as they happen. Say hello and start it off.
              </p>
            </div>
          </div>
        ) : (
          messages.map((m) =>
            isTradeMeta(m) ? (
              <TradeCard key={m.id} m={m} meta={m.meta} />
            ) : m.kind === "system" ? (
              <SystemNotice key={m.id} m={m} />
            ) : (
              <UserMessage key={m.id} m={m} />
            ),
          )
        )}
      </div>

      {!atBottom && messages.length > 0 && (
        <button
          type="button"
          onClick={() => {
            const el = scrollRef.current
            if (el) el.scrollTop = el.scrollHeight
            setAtBottom(true)
          }}
          className="self-center -mt-10 mb-2 z-10 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold
            bg-foreground/80 text-background shadow-lg hover:bg-foreground transition-colors"
        >
          <ArrowDown className="w-3 h-3" /> Latest
        </button>
      )}

      <div className="border-t border-foreground/10 p-3">
        {postError && <p className="mb-2 text-xs text-red-600 dark:text-red-400">{postError}</p>}
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, MAX_BODY))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                void submit()
              }
            }}
            rows={1}
            disabled={!canPost}
            placeholder={canPost ? "Say something…" : (disabledReason ?? "You can read along, but not post.")}
            aria-label="Message the challenge feed"
            className="flex-1 resize-none rounded-xl bg-foreground/[0.04] border border-foreground/10 px-3 py-2 text-sm
              placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40
              disabled:opacity-60 disabled:cursor-not-allowed max-h-28"
          />
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!canPost || isPosting || draft.trim().length === 0}
            aria-label="Send"
            className="shrink-0 h-9 w-9 grid place-items-center rounded-xl bg-primary text-primary-foreground
              hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        {canPost && remaining < 100 && (
          <p className="mt-1 text-right text-[11px] text-muted-foreground tabular-nums">{remaining} left</p>
        )}
      </div>
    </div>
  )
}

export default ChallengeChat
