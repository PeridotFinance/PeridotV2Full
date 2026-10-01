"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import { useSignMessage } from "wagmi"
import { useQuery } from "@tanstack/react-query"
import { useActiveWallet } from "@/hooks/use-active-wallet"
import { useAuthedFetch } from "@/hooks/use-authed-fetch"
import { isEvmAddress } from "@/config/contracts"
import { toast } from "sonner"
import { ChevronLeft, Loader2, Sparkles, Palette, Smile } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Account → Display
 *
 * Lets users pick which earned badge to surface on their leaderboard row,
 * plus an unlocked border colour and a name emoji. Moved out of the
 * Leaderboard component on purpose — display customisation belongs in
 * account settings, not in a public ranking surface.
 *
 * Data flow:
 *   - GET /api/user/me?wallet=…           → `profile.earnedBadges`,
 *                                            `profile.selections`
 *   - POST /api/user/profile/display      → save with wallet signature
 *
 * Save requires an EVM-signed message so the server can verify ownership
 * (same protocol as the legacy set-username endpoint).
 */

interface EarnedBadge {
  id: string
  name: string
  icon: string
  unlockEmoji?: string | null
  unlockBorderColor?: string | null
  tier: string
  allowLeaderboardDisplay?: boolean
}

interface UserMeResponse {
  user?: { username?: string } | null
  profile?: {
    earnedBadges?: EarnedBadge[]
    selections?: {
      badgeId?: string | null
      borderColor?: string | null
      nameEmoji?: string | null
    }
    display?: {
      displayBadge?: { id: string; name: string; icon: string } | null
      borderColor?: string | null
      nameEmoji?: string | null
    }
  }
}

export default function AccountDisplayPage() {
  const { address, isConnected } = useActiveWallet()
  const { authedFetch, authReady } = useAuthedFetch()
  const { signMessageAsync } = useSignMessage()

  const wallet = typeof address === "string" ? address : undefined
  const walletIsEvm = !!wallet && isEvmAddress(wallet)

  // Fetch the user's profile (earned badges + saved selections). Cached
  // for 60s — same TTL as the leaderboard breakdown hook.
  const { data, isLoading, refetch, error } = useQuery<UserMeResponse>({
    queryKey: ["account-display", wallet, authReady],
    enabled: walletIsEvm && authReady,
    staleTime: 30_000,
    queryFn: async () => {
      const res = await authedFetch(`/api/user/me?wallet=${wallet}`)
      if (!res.ok) throw new Error("Failed to load profile")
      return res.json()
    },
  })

  const earnedBadges = useMemo(() => {
    const all = data?.profile?.earnedBadges ?? []
    return all.filter((b) => b.allowLeaderboardDisplay !== false)
  }, [data])

  const unlockedColors = useMemo(
    () =>
      Array.from(
        new Set(
          (data?.profile?.earnedBadges ?? [])
            .map((b) => b.unlockBorderColor)
            .filter((c): c is string => Boolean(c)),
        ),
      ),
    [data],
  )

  const unlockedEmojis = useMemo(
    () =>
      Array.from(
        new Set(
          (data?.profile?.earnedBadges ?? [])
            .map((b) => b.unlockEmoji)
            .filter((e): e is string => Boolean(e)),
        ),
      ),
    [data],
  )

  const [selectedBadgeId, setSelectedBadgeId] = useState<string | null>(null)
  const [selectedBorderColor, setSelectedBorderColor] = useState<string | null>(null)
  const [selectedNameEmoji, setSelectedNameEmoji] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Hydrate selections from the server once the profile lands. Don't
  // overwrite mid-edit choices on every refetch — gate on a one-shot ref.
  useEffect(() => {
    const sel = data?.profile?.selections
    if (!sel) return
    setSelectedBadgeId((prev) => (prev === null ? sel.badgeId ?? null : prev))
    setSelectedBorderColor((prev) =>
      prev === null ? sel.borderColor ?? null : prev,
    )
    setSelectedNameEmoji((prev) =>
      prev === null ? sel.nameEmoji ?? null : prev,
    )
  }, [data])

  const initialSelections = data?.profile?.selections
  const dirty =
    (initialSelections?.badgeId ?? null) !== selectedBadgeId ||
    (initialSelections?.borderColor ?? null) !== selectedBorderColor ||
    (initialSelections?.nameEmoji ?? null) !== selectedNameEmoji

  async function save() {
    if (!wallet || !walletIsEvm) return
    setSaving(true)
    try {
      const timestamp = Date.now()
      const payload = `${selectedBadgeId || ""}|${selectedBorderColor || ""}|${selectedNameEmoji || ""}`
      const message = `Peridot: set profile display ${payload} for ${wallet.toLowerCase()} at ${timestamp}`
      const signature = await signMessageAsync({
        account: wallet as `0x${string}`,
        message,
      })
      const res = await fetch("/api/user/profile/display", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: wallet,
          signature,
          timestamp,
          selected_badge_id: selectedBadgeId,
          selected_border_color: selectedBorderColor,
          selected_name_emoji: selectedNameEmoji,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || "Failed to save")
      }
      await refetch()
      toast.success("Display saved")
    } catch (e: any) {
      toast.error(e?.message || "Could not save")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-lg mx-auto w-full">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
      >
        {/* ── Header ── */}
        <div className="px-5 pt-8 pb-2 flex items-center gap-3">
          <Link
            href="/app/easy/account"
            className="w-9 h-9 rounded-full bg-foreground/[0.03] border border-foreground/[0.06] flex items-center justify-center hover:bg-foreground/[0.06] transition-colors"
            aria-label="Back to account"
          >
            <ChevronLeft className="w-4 h-4" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-[22px] font-black tracking-tight leading-none">
              Display
            </h1>
            <p className="text-[12px] text-muted-foreground/70 mt-1">
              Pick the badge, border and emoji that show on your leaderboard row.
            </p>
          </div>
        </div>

        {/* ── Not connected / non-EVM ── */}
        {!isConnected || !walletIsEvm ? (
          <div className="mx-5 mt-6 rounded-2xl border border-foreground/[0.06] p-6 text-center">
            <p className="text-[13px] text-muted-foreground">
              Sign in with an EVM wallet to customise your leaderboard display.
            </p>
          </div>
        ) : (
          <>
            {/* ── Preview tile ── */}
            <div className="mx-5 mt-4 rounded-2xl border border-foreground/[0.06] p-5 bg-foreground/[0.02]">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 mb-3">
                Preview
              </p>
              <PreviewRow
                username={data?.user?.username ?? null}
                wallet={wallet}
                badge={
                  earnedBadges.find((b) => b.id === selectedBadgeId) ?? null
                }
                borderColor={selectedBorderColor}
                nameEmoji={selectedNameEmoji}
              />
            </div>

            {!!error && (
              <div className="mx-5 mt-4 px-4 py-2 text-[13px] text-red-500 bg-red-500/5 border border-red-500/10 rounded-md">
                Could not load profile. {(error as Error).message}
              </div>
            )}

            {/* ── Badges grid ── */}
            <Section
              icon={Sparkles}
              title="Display badge"
              hint={
                earnedBadges.length === 0
                  ? "Unlock badges by completing achievements."
                  : "Tap one to feature it next to your name."
              }
            >
              {isLoading ? (
                <BadgesGridSkeleton />
              ) : earnedBadges.length === 0 ? (
                <EmptyState>No badges earned yet.</EmptyState>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  <ToggleTile
                    selected={selectedBadgeId === null}
                    onClick={() => setSelectedBadgeId(null)}
                    title="None"
                    icon="—"
                  />
                  {earnedBadges.map((b) => (
                    <ToggleTile
                      key={b.id}
                      selected={selectedBadgeId === b.id}
                      onClick={() =>
                        setSelectedBadgeId((cur) => (cur === b.id ? null : b.id))
                      }
                      title={b.name}
                      icon={b.icon}
                    />
                  ))}
                </div>
              )}
            </Section>

            {/* ── Border color ── */}
            <Section
              icon={Palette}
              title="Border color"
              hint={
                unlockedColors.length === 0
                  ? "Earn achievements to unlock border colors."
                  : "Picks the ring around your row on the leaderboard."
              }
            >
              {isLoading ? (
                <SwatchRowSkeleton />
              ) : unlockedColors.length === 0 ? (
                <EmptyState>No border colors unlocked yet.</EmptyState>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <NoneSwatch
                    selected={selectedBorderColor === null}
                    onClick={() => setSelectedBorderColor(null)}
                  />
                  {unlockedColors.map((c) => (
                    <ColorSwatch
                      key={c}
                      color={c}
                      selected={selectedBorderColor === c}
                      onClick={() =>
                        setSelectedBorderColor((cur) => (cur === c ? null : c))
                      }
                    />
                  ))}
                </div>
              )}
            </Section>

            {/* ── Name emoji ── */}
            <Section
              icon={Smile}
              title="Name emoji"
              hint={
                unlockedEmojis.length === 0
                  ? "Earn achievements to unlock name emojis."
                  : "Shown right next to your username."
              }
            >
              {isLoading ? (
                <SwatchRowSkeleton />
              ) : unlockedEmojis.length === 0 ? (
                <EmptyState>No emojis unlocked yet.</EmptyState>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <NoneSwatch
                    selected={selectedNameEmoji === null}
                    onClick={() => setSelectedNameEmoji(null)}
                    label="None"
                  />
                  {unlockedEmojis.map((e) => (
                    <EmojiSwatch
                      key={e}
                      emoji={e}
                      selected={selectedNameEmoji === e}
                      onClick={() =>
                        setSelectedNameEmoji((cur) => (cur === e ? null : e))
                      }
                    />
                  ))}
                </div>
              )}
            </Section>

            {/* ── Save bar ── */}
            <div className="mx-5 mt-6 mb-12">
              <button
                type="button"
                onClick={save}
                disabled={!dirty || saving}
                className={cn(
                  "w-full rounded-2xl px-5 py-4 text-[15px] font-semibold transition-all",
                  "bg-emerald-600 text-white shadow-lg shadow-emerald-500/20",
                  "hover:bg-emerald-500 active:scale-[0.98]",
                  "disabled:bg-foreground/[0.06] disabled:text-muted-foreground/60",
                  "disabled:shadow-none disabled:active:scale-100",
                  "inline-flex items-center justify-center gap-2",
                )}
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving…
                  </>
                ) : dirty ? (
                  "Save display"
                ) : (
                  "No changes"
                )}
              </button>
            </div>
          </>
        )}
      </motion.div>
    </div>
  )
}

// ─── Subcomponents ───────────────────────────────────────────────────────────

function Section({
  icon: Icon,
  title,
  hint,
  children,
}: {
  icon: typeof Palette
  title: string
  hint: string
  children: React.ReactNode
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="mx-5 mt-5 rounded-2xl border border-foreground/[0.06] p-5"
    >
      <div className="flex items-center gap-3 mb-3">
        <div className="w-8 h-8 rounded-lg bg-foreground/[0.04] flex items-center justify-center">
          <Icon className="w-4 h-4 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <p className="text-[14px] font-semibold leading-none">{title}</p>
          <p className="text-[11px] text-muted-foreground/60 mt-1">{hint}</p>
        </div>
      </div>
      {children}
    </motion.section>
  )
}

function PreviewRow({
  username,
  wallet,
  badge,
  borderColor,
  nameEmoji,
}: {
  username: string | null
  wallet: string
  badge: EarnedBadge | null
  borderColor: string | null
  nameEmoji: string | null
}) {
  const displayName =
    username || `${wallet.slice(0, 6)}…${wallet.slice(-4)}`
  const isGrad =
    typeof borderColor === "string" &&
    borderColor.toLowerCase().includes("gradient")
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-background/60 border border-foreground/[0.04] relative">
      {/* Border ring effect */}
      {borderColor && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-xl"
          style={
            isGrad
              ? { backgroundImage: borderColor, opacity: 0.25 }
              : { boxShadow: `0 0 0 2px ${borderColor}` }
          }
        />
      )}
      <div className="flex items-center gap-2 min-w-0 relative z-10">
        <span className="font-mono text-[12px] text-muted-foreground/60">
          #—
        </span>
        {nameEmoji && (
          <span className="text-base leading-none" aria-hidden>
            {nameEmoji}
          </span>
        )}
        <span className="text-[14px] font-medium truncate">{displayName}</span>
      </div>
      {badge ? (
        <span
          className="inline-flex relative z-10 items-center gap-1 rounded-full border border-foreground/[0.08] px-2 py-0.5 text-[11px] shrink-0"
          title={badge.name}
        >
          <span aria-hidden>{badge.icon}</span>
          <span className="truncate max-w-[5rem] sm:max-w-[8rem]">{badge.name}</span>
        </span>
      ) : (
        <span className="relative z-10 text-[11px] text-muted-foreground/40 shrink-0">
          No badge
        </span>
      )}
    </div>
  )
}

function ToggleTile({
  selected,
  onClick,
  title,
  icon,
}: {
  selected: boolean
  onClick: () => void
  title: string
  icon: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-xl border p-3 text-left transition-colors",
        selected
          ? "border-emerald-500/40 bg-emerald-500/5"
          : "border-foreground/[0.06] hover:border-foreground/[0.12] hover:bg-foreground/[0.02]",
      )}
    >
      <span className="text-lg leading-none" aria-hidden>
        {icon}
      </span>
      <span className="block text-[11px] mt-1 truncate text-muted-foreground/80">
        {title}
      </span>
    </button>
  )
}

function ColorSwatch({
  color,
  selected,
  onClick,
}: {
  color: string
  selected: boolean
  onClick: () => void
}) {
  const isGrad = color.toLowerCase().includes("gradient")
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Border ${color}`}
      className={cn(
        "h-9 w-9 rounded-full border overflow-hidden transition-all",
        selected
          ? "ring-2 ring-emerald-400 ring-offset-2 ring-offset-background"
          : "border-foreground/[0.1]",
      )}
      style={
        isGrad
          ? { backgroundImage: color, borderColor: "transparent" }
          : { backgroundColor: `${color}33`, borderColor: color }
      }
    />
  )
}

function EmojiSwatch({
  emoji,
  selected,
  onClick,
}: {
  emoji: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Emoji ${emoji}`}
      className={cn(
        "h-9 w-9 rounded-full border bg-foreground/[0.02] flex items-center justify-center transition-all",
        selected
          ? "ring-2 ring-emerald-400 ring-offset-2 ring-offset-background border-transparent"
          : "border-foreground/[0.08] hover:border-foreground/[0.15]",
      )}
    >
      <span className="text-base">{emoji}</span>
    </button>
  )
}

function NoneSwatch({
  selected,
  onClick,
  label = "None",
}: {
  selected: boolean
  onClick: () => void
  label?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-9 px-3 rounded-full border text-[11px] transition-all",
        selected
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          : "border-foreground/[0.08] text-muted-foreground hover:border-foreground/[0.15]",
      )}
    >
      {label}
    </button>
  )
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[12px] text-muted-foreground/60 py-2">{children}</p>
  )
}

function BadgesGridSkeleton() {
  return (
    <div className="grid grid-cols-3 gap-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="h-16 rounded-xl bg-foreground/[0.04] animate-pulse"
        />
      ))}
    </div>
  )
}

function SwatchRowSkeleton() {
  return (
    <div className="flex gap-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="h-9 w-9 rounded-full bg-foreground/[0.04] animate-pulse"
        />
      ))}
    </div>
  )
}
