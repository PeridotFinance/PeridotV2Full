"use client"

import { useEffect, useMemo, useState } from "react"
import Image from "next/image"
import { ChevronDown, Loader2, LockKeyhole, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"
import { DataroomLogin } from "./DataroomLogin"
import {
  AnimatedNumber,
  BarList,
  Delta,
  FunnelStages,
  Segmented,
  SectionHeader,
  StatTile,
  formatCount,
  formatPercent,
  formatUsd,
} from "./primitives"
import {
  CohortHeatmap,
  FlowChart,
  FlowLegend,
  GrowthChart,
  MonthlyBarChart,
  StickinessChart,
  type GrowthMetric,
} from "./charts"

// ─── Payload types (mirror /api/dataroom/metrics) ─────────────────────────────

interface ChainRow {
  chainId: number
  name: string
  short: string
  logo: string
  color: string
  network: "mainnet" | "testnet"
  users: number
  transactions: number
  volume: number
  tvl: number
  marketSize: number
  firstSeen: string | null
  lastSeen: string | null
}

interface NetworkMetrics {
  totals: {
    wallets: number
    loginWallets: number
    activeWallets30d: number
    logins: number
    lastLogin: string | null
    transactions: number
    volume: number
    tvl: number
    marketSize: number
    chains: number
    emailSubscribers: number
  }
  chains: ChainRow[]
  monthly: { month: string; newUsers: number; activeUsers: number; transactions: number; volume: number }[]
  daily: { date: string; supply: number; borrow: number; repay: number; redeem: number; transactions: number }[]
  assets: { symbol: string; volume: number; transactions: number; share: number }[]
  actions: { action: string; transactions: number; volume: number }[]
  cohorts: { cohort: string; period: number; wallets: number }[]
  frequency: { active: number; repeating: number; power: number; avgTx: number }
  engagement: {
    mau: number
    loginDays: number
    previousMau: number
    previousLoginDays: number
    monthly: { month: string; mau: number; loginDays: number }[]
  }
}

interface Payload {
  generatedAt: string
  networks: { mainnet: NetworkMetrics; testnet: NetworkMetrics }
  community: {
    waitlist: number
    waitlistFirst: string | null
    accounts: { mainnet: number; testnet: number }
    walletLinks: { evm: number; stellar: number; verified: number; total: number }
    contactSubmissions: number
    emailCurve: { month: string; count: number }[]
  }
  traffic: {
    pageviews: number
    visitors: number
    visitors30d: number
    visitors7d: number
    pageviews30d: number
    visitorsPrev30d: number
    pageviewsPrev30d: number
    visitorsPrev7d: number
    monthly: { month: string; visitors: number; pageviews: number }[]
    pages: { path: string; views: number; visitors: number; views30d: number; visitors30d: number }[]
  } | null
  cached: boolean
}

type Network = "mainnet" | "testnet"

const DAY_MS = 86_400_000

/**
 * The three chains that get their own card, in the order they are shown.
 *
 * Matched by chain *family* rather than id so the same list works on both
 * sides of the network toggle (Monad and Monad Testnet are one entry). Every
 * other chain — including a row whose own network disagrees with the selected
 * one, which is always a leftover from an early deployment — is folded into a
 * single "Other chains" card.
 */
const FEATURED_CHAINS = ["Stellar", "BNB", "Monad"]
const OTHER_CHAINS_ID = -1

/** Calendar days in a month, clipped to today for the month still running. */
function daysInMonth(iso: string): number {
  const start = new Date(`${iso}T00:00:00Z`)
  const next = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1))
  const end = Math.min(next.getTime(), Date.now())
  return Math.max(1, Math.round((end - start.getTime()) / DAY_MS))
}

// ─── Shell ────────────────────────────────────────────────────────────────────

export function DataroomShell() {
  const [data, setData] = useState<Payload | null>(null)
  const [locked, setLocked] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async (fresh = false) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/dataroom/metrics${fresh ? "?fresh=1" : ""}`, {
        cache: "no-store",
      })
      if (res.status === 401) {
        setLocked(true)
        return
      }
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setError(body?.error ? `${body.error} (HTTP ${res.status})` : `Server error (HTTP ${res.status}).`)
        return
      }
      setLocked(false)
      setData(await res.json())
    } catch {
      // Also the case while the dev server restarts — say so instead of
      // blaming the data.
      setError("Could not reach the server. Check the connection and retry.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (locked) return <DataroomLogin onSuccess={() => load()} />

  return (
    <Dashboard
      data={data}
      loading={loading}
      error={error}
      onRefresh={() => load(true)}
      onLock={async () => {
        await fetch("/api/dataroom/login", { method: "DELETE" })
        setData(null)
        setLocked(true)
      }}
    />
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

function Dashboard({
  data,
  loading,
  error,
  onRefresh,
  onLock,
}: {
  data: Payload | null
  loading: boolean
  error: string | null
  onRefresh: () => void
  onLock: () => void
}) {
  const [network, setNetwork] = useState<Network>("mainnet")
  const [growthMetric, setGrowthMetric] = useState<GrowthMetric>("cumulativeUsers")
  const [selectedChain, setSelectedChain] = useState<number | null>(null)

  const net = data?.networks[network] ?? null

  // Every figure on this page is the full history. There is no window to
  // compare against, so the headline tiles carry no deltas — the sections
  // that do have a prior period (retention, traffic) keep theirs.
  const flows = net?.daily ?? []

  // Three named chains in a fixed order, everything else summed into one row.
  // TVL, volume and transactions add up cleanly; wallet counts do not — a
  // wallet active on two of the folded chains is counted by both, which the
  // detail panel says out loud rather than hiding.
  const { cards: chainCards, folded } = useMemo(() => {
    const rows = net?.chains ?? []
    const taken = new Set<number>()
    const featured: ChainRow[] = []

    for (const family of FEATURED_CHAINS) {
      const row = rows.find(
        (r) => !taken.has(r.chainId) && r.network === network && r.name.includes(family)
      )
      if (row) {
        taken.add(row.chainId)
        featured.push(row)
      }
    }

    const rest = rows.filter((r) => !taken.has(r.chainId))
    if (!rest.length) return { cards: featured, folded: rest }

    const oldest = rest.map((r) => r.firstSeen).filter(Boolean).sort()
    const newest = rest.map((r) => r.lastSeen).filter(Boolean).sort()
    const sum = (pick: (r: ChainRow) => number) => rest.reduce((s, r) => s + pick(r), 0)

    const other: ChainRow = {
      chainId: OTHER_CHAINS_ID,
      name: "Other chains",
      short: "OTHER",
      logo: "",
      color: "#8a8a8a",
      network,
      users: sum((r) => r.users),
      transactions: sum((r) => r.transactions),
      volume: sum((r) => r.volume),
      tvl: sum((r) => r.tvl),
      marketSize: sum((r) => r.marketSize),
      firstSeen: oldest[0] ?? null,
      lastSeen: newest[newest.length - 1] ?? null,
    }

    return { cards: [...featured, other], folded: rest }
  }, [net, network])

  const selected = chainCards.find((c) => c.chainId === selectedChain) ?? null

  // Community + traffic are network-independent (one website, one mailing list).
  const community = data?.community
  const traffic = data?.traffic

  const emailTotal =
    (data?.networks.mainnet.totals.emailSubscribers ?? 0) +
    (data?.networks.testnet.totals.emailSubscribers ?? 0) +
    (community?.waitlist ?? 0)

  // ── Engagement ───────────────────────────────────────────────────────────
  // DAU is the average over the calendar window, not the last single day —
  // one quiet Sunday should not move the stickiness ratio.
  const engagement = net?.engagement
  const avgDau = engagement ? engagement.loginDays / 30 : 0
  const prevAvgDau = engagement ? engagement.previousLoginDays / 30 : 0
  const stickiness = engagement && engagement.mau > 0 ? (avgDau / engagement.mau) * 100 : 0
  const prevStickiness =
    engagement && engagement.previousMau > 0 ? (prevAvgDau / engagement.previousMau) * 100 : 0

  const stickinessCurve = useMemo(
    () =>
      (engagement?.monthly ?? [])
        .filter((m) => m.mau > 0)
        .map((m) => ({
          month: m.month,
          value: (m.loginDays / daysInMonth(m.month) / m.mau) * 100,
        })),
    [engagement]
  )

  const frequency = net?.frequency
  const repeatRate =
    frequency && frequency.active > 0 ? (frequency.repeating / frequency.active) * 100 : 0

  // ── Funnel ───────────────────────────────────────────────────────────────
  // The top three steps are site-wide (one website, one mailing list, one
  // account table) and do not follow the network switch; the two activation
  // steps do. Labelled as such in the section description.
  const funnelStages = useMemo(() => {
    const stages: { label: string; value: number; hint?: string }[] = []
    if (traffic) {
      stages.push({
        label: "Website visitors",
        value: traffic.visitors,
        hint: "Unique visitors on peridot.finance, all-time",
      })
    }
    stages.push({
      label: "Signed up",
      value: emailTotal,
      hint: "Newsletter subscribers and waitlist entries",
    })
    stages.push({
      label: "Peridot account created",
      value: community?.accounts.mainnet ?? 0,
      hint: "Social or e-mail logins on mainnet",
    })
    stages.push({
      label: "Wallet linked",
      value: community?.walletLinks.total ?? 0,
      hint: `${formatCount(community?.walletLinks.verified ?? 0)} of them signature-verified`,
    })
    stages.push({
      label: "First transaction",
      value: net?.totals.wallets ?? 0,
      hint: `Wallets with at least one verified ${network} transaction`,
    })
    stages.push({
      label: "Came back for more",
      value: frequency?.repeating ?? 0,
      hint: `${formatCount(frequency?.power ?? 0)} wallets are past their fifth transaction`,
    })
    return stages
  }, [traffic, emailTotal, community, net, network, frequency])

  return (
    <main
      className="min-h-screen bg-background text-foreground"
      style={{ ["--dataroom-accent" as any]: "#5e7945" }}
    >
      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-foreground/[0.06] bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div>
            <div className="text-sm font-semibold tracking-tight">Peridot Dataroom</div>
            <div className="text-[11px] text-foreground/45">
              {data ? (
                <>
                  Updated{" "}
                  {new Date(data.generatedAt).toLocaleString("en-GB", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                  {data.cached && " · cached"}
                </>
              ) : (
                "Loading…"
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Segmented
              value={network}
              onChange={(v) => {
                setNetwork(v)
                setSelectedChain(null)
              }}
              options={[
                { id: "mainnet", label: "Mainnet" },
                { id: "testnet", label: "Testnet" },
              ]}
              size="sm"
            />
            <button
              type="button"
              onClick={onRefresh}
              className="rounded-full border border-foreground/[0.08] p-2 text-foreground/50 transition-colors hover:text-foreground"
              title="Reload metrics"
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
            </button>
            <button
              type="button"
              onClick={onLock}
              className="rounded-full border border-foreground/[0.08] p-2 text-foreground/50 transition-colors hover:text-foreground"
              title="Lock dataroom"
            >
              <LockKeyhole className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </header>

      {error && (
        <div className="mx-auto max-w-6xl px-6 pt-6">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-500">
            <span>{error}</span>
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="rounded-full border border-red-500/40 px-3 py-1 text-xs transition-opacity disabled:opacity-50"
            >
              {loading ? "Retrying…" : "Retry"}
            </button>
          </div>
        </div>
      )}

      {/* ── Hero KPIs ──────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8 max-w-2xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-foreground/[0.08] px-3 py-1 text-[11px] uppercase tracking-widest text-foreground/50">
            <span
              className="inline-block h-1.5 w-1.5 animate-pulse rounded-full"
              style={{ backgroundColor: "var(--dataroom-accent)" }}
            />
            {network === "mainnet" ? "Live mainnet data" : "Testnet history"}
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight md:text-4xl">
            Everything Peridot has moved so far.
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-foreground/55">
            Verified on-chain activity, liquidity and reach across every chain we
            run on — aggregated straight from the protocol database. Toggle
            between mainnet and testnet; every figure below follows the switch.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <StatTile
            label="TVL"
            accent
            loading={!net}
            value={<AnimatedNumber value={net?.totals.tvl ?? 0} format={(v) => formatUsd(v)} />}
            sub={`Now · ${net?.totals.chains ?? 0} chains live`}
          />
          <StatTile
            label="Total supplied"
            loading={!net}
            value={<AnimatedNumber value={net?.totals.marketSize ?? 0} format={(v) => formatUsd(v)} />}
            sub="Now · incl. borrowed"
          />
          <StatTile
            label="Volume"
            loading={!net}
            value={<AnimatedNumber value={net?.totals.volume ?? 0} format={(v) => formatUsd(v)} />}
            sub="All verified transactions"
          />
          <StatTile
            label="Wallets"
            loading={!net}
            value={<AnimatedNumber value={net?.totals.wallets ?? 0} />}
            sub="Unique, transacted"
          />
          <StatTile
            label="Transactions"
            loading={!net}
            value={<AnimatedNumber value={net?.totals.transactions ?? 0} />}
            sub="Verified on-chain"
          />
          <StatTile
            label="Signed-in users"
            loading={!net}
            value={<AnimatedNumber value={net?.totals.loginWallets ?? 0} />}
            sub={`${formatCount(net?.totals.activeWallets30d ?? 0)} active in 30d`}
          />
        </div>
      </section>

      <Divider />

      {/* ── Chains ─────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-10">
        <SectionHeader
          title="Chains"
          description="Users, activity and liquidity on the three chains we run the protocol on; everything else is combined. Click a card for its detail."
          right={
            <span className="text-[11px] uppercase tracking-widest text-foreground/40">
              {net?.chains.length ?? 0} chains on record
            </span>
          }
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {chainCards.map((chain) => {
            const maxTx = Math.max(1, ...chainCards.map((c) => c.transactions))
            const isActive = selectedChain === chain.chainId
            const isOther = chain.chainId === OTHER_CHAINS_ID
            return (
              <button
                key={chain.chainId}
                type="button"
                onClick={() => setSelectedChain(isActive ? null : chain.chainId)}
                className={cn(
                  "group rounded-2xl border p-5 text-left transition-all duration-300",
                  isActive
                    ? "border-foreground/25 bg-foreground/[0.03]"
                    : "border-foreground/[0.07] hover:-translate-y-0.5 hover:border-foreground/20"
                )}
              >
                <div className="flex items-center gap-3">
                  <span className="relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-foreground/[0.08] bg-background">
                    {isOther ? (
                      <span className="font-mono text-[11px] text-foreground/55">
                        +{folded.length}
                      </span>
                    ) : (
                      <Image src={chain.logo} alt="" width={18} height={18} />
                    )}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{chain.name}</span>
                    </div>
                    <div className="text-[11px] text-foreground/40">
                      {isOther
                        ? `${folded.length} further chains, combined`
                        : chain.lastSeen
                          ? `Last activity ${new Date(chain.lastSeen).toLocaleDateString("en-GB", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}`
                          : "No transactions yet"}
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <Metric label="Users" value={formatCount(chain.users)} />
                  <Metric label="TVL" value={formatUsd(chain.tvl)} />
                  <Metric label="Volume" value={formatUsd(chain.volume)} />
                </div>

                <div className="mt-4">
                  <div className="mb-1.5 flex items-center justify-between text-[11px] text-foreground/40">
                    <span>Share of activity</span>
                    <span className="font-mono tabular-nums">
                      {formatCount(chain.transactions)} tx
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/[0.06]">
                    <div
                      className="h-full rounded-full transition-[width] duration-700 ease-out"
                      style={{
                        width: `${Math.max(2, (chain.transactions / maxTx) * 100)}%`,
                        backgroundColor: chain.color,
                      }}
                    />
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        {selected && (
          <div className="mt-4 rounded-2xl border border-foreground/[0.07] bg-foreground/[0.02] p-5">
            <div className="mb-4 flex items-center gap-3">
              {selected.chainId !== OTHER_CHAINS_ID && (
                <Image src={selected.logo} alt="" width={20} height={20} />
              )}
              <div className="text-sm font-medium">{selected.name}</div>
              <div className="font-mono text-[11px] text-foreground/40">
                {selected.chainId === OTHER_CHAINS_ID
                  ? `${folded.length} chains combined`
                  : `chain id ${selected.chainId}`}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
              <Metric label="Unique wallets" value={formatCount(selected.users)} large />
              <Metric label="Transactions" value={formatCount(selected.transactions)} large />
              <Metric label="Volume" value={formatUsd(selected.volume)} large />
              <Metric label="TVL" value={formatUsd(selected.tvl)} large />
              <Metric
                label="First activity"
                value={
                  selected.firstSeen
                    ? new Date(selected.firstSeen).toLocaleDateString("en-GB", {
                        month: "short",
                        year: "numeric",
                      })
                    : "—"
                }
                large
              />
            </div>

            {selected.chainId === OTHER_CHAINS_ID && (
              <div className="mt-5 border-t border-foreground/[0.06] pt-4">
                <p className="mb-3 text-[11px] text-foreground/40">
                  Wallets are counted per chain, so a wallet active on two of these
                  is counted by both — the combined figure above is an upper bound.
                </p>
                <div className="space-y-1.5">
                  {[...folded]
                    .sort((a, b) => b.transactions - a.transactions)
                    .map((row) => (
                      <div
                        key={row.chainId}
                        className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 text-xs"
                      >
                        <span className="flex items-center gap-2 truncate text-foreground/70">
                          <Image src={row.logo} alt="" width={14} height={14} />
                          {row.name}
                          {row.network !== network && (
                            <span className="rounded-full border border-foreground/15 px-1.5 py-px text-[9px] uppercase tracking-widest text-foreground/40">
                              {row.network}
                            </span>
                          )}
                        </span>
                        <span className="w-20 text-right font-mono tabular-nums text-foreground/55">
                          {formatCount(row.users)} w
                        </span>
                        <span className="w-20 text-right font-mono tabular-nums text-foreground/55">
                          {formatCount(row.transactions)} tx
                        </span>
                        <span className="w-24 text-right font-mono tabular-nums">
                          {formatUsd(row.volume)}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      <Divider />

      {/* ── Funnel ─────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-10">
        <SectionHeader
          title="From visitor to repeat user"
          description="The full path, with the conversion between each step. The first four steps are site-wide — one website, one mailing list, one account table; the last two follow the network switch."
        />
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <FunnelStages stages={funnelStages} />
          <div className="space-y-3">
            <StatTile
              label="Visitor → account"
              loading={!data}
              value={
                <AnimatedNumber
                  value={
                    traffic && traffic.visitors > 0
                      ? ((community?.accounts.mainnet ?? 0) / traffic.visitors) * 100
                      : 0
                  }
                  format={(v) => formatPercent(v, 2)}
                />
              }
              sub="Share of all visitors who created an account"
            />
            <StatTile
              label="Account → funded"
              accent
              loading={!data}
              value={
                <AnimatedNumber
                  value={
                    community?.accounts.mainnet
                      ? ((net?.totals.wallets ?? 0) / community.accounts.mainnet) * 100
                      : 0
                  }
                  format={(v) => formatPercent(v)}
                />
              }
              sub="Activation: accounts that made a first transaction"
            />
            <StatTile
              label="Repeat rate"
              loading={!net}
              value={<AnimatedNumber value={repeatRate} format={(v) => formatPercent(v)} />}
              sub={`${formatCount(frequency?.repeating ?? 0)} wallets transacted more than once`}
            />
          </div>
        </div>
      </section>

      <Divider />

      {/* ── Growth ─────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-10">
        <SectionHeader
          title="Growth"
          description="Monthly protocol history. New wallets are counted on their first verified transaction."
          right={
            <Segmented<GrowthMetric>
              size="sm"
              value={growthMetric}
              onChange={setGrowthMetric}
              options={[
                { id: "cumulativeUsers", label: "Wallets" },
                { id: "transactions", label: "Transactions" },
                { id: "volume", label: "Volume" },
              ]}
            />
          }
        />
        <GrowthChart data={net?.monthly ?? []} metric={growthMetric} />
      </section>

      <Divider />

      {/* ── Retention & engagement ─────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-10">
        <SectionHeader
          title="Retention & engagement"
          description="Whether the wallets that arrive stay. Engagement is measured on sign-ins, retention on verified transactions."
        />

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <StatTile
            label="MAU"
            accent
            loading={!net}
            value={<AnimatedNumber value={engagement?.mau ?? 0} />}
            delta={
              <Delta current={engagement?.mau ?? 0} previous={engagement?.previousMau ?? 0} />
            }
            sub="Wallets signed in, last 30 days"
          />
          <StatTile
            label="DAU"
            loading={!net}
            value={<AnimatedNumber value={avgDau} format={(v) => v.toFixed(1)} />}
            delta={<Delta current={avgDau} previous={prevAvgDau} />}
            sub="Daily average over the same window"
          />
          <StatTile
            label="Stickiness"
            loading={!net}
            value={<AnimatedNumber value={stickiness} format={(v) => formatPercent(v)} />}
            delta={<Delta current={stickiness} previous={prevStickiness} />}
            sub="DAU / MAU — 20%+ is habit"
          />
          <StatTile
            label="Repeat rate"
            loading={!net}
            value={<AnimatedNumber value={repeatRate} format={(v) => formatPercent(v)} />}
            sub="Wallets with more than one transaction"
          />
          <StatTile
            label="Power users"
            loading={!net}
            value={<AnimatedNumber value={frequency?.power ?? 0} />}
            sub="Five or more transactions"
          />
          <StatTile
            label="Transactions / wallet"
            loading={!net}
            value={<AnimatedNumber value={frequency?.avgTx ?? 0} format={(v) => v.toFixed(1)} />}
            sub="Lifetime average"
          />
        </div>

        <div className="mt-10">
          <SectionHeader
            title="Stickiness over time"
            description="Average daily actives as a share of that month's monthly actives."
          />
          <StickinessChart data={stickinessCurve} />
        </div>

        <div className="mt-10">
          <SectionHeader
            title="Cohort retention"
            description="Each row is the group of wallets whose first verified transaction fell in that month. M0 is that month itself, so it is 100% by definition; every column after it is the share of the same wallets that came back."
          />
          <CohortHeatmap rows={net?.cohorts ?? []} />
        </div>
      </section>

      <Divider />

      {/* ── Protocol flows ─────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-10">
        <SectionHeader
          title="Protocol flows"
          description="Daily supply, borrow, repay and redeem volume in USD, across the full history."
          right={<FlowLegend />}
        />
        <FlowChart data={flows} />
      </section>

      <Divider />

      {/* ── Assets + actions ───────────────────────────────────────── */}
      <section className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-6 py-10 lg:grid-cols-2">
        <div>
          <SectionHeader
            title="Asset footprint"
            description="Cumulative volume per asset across all actions."
          />
          <BarList
            rows={(net?.assets ?? []).slice(0, 8).map((a) => ({
              label: a.symbol,
              value: a.volume,
              hint: `${a.share.toFixed(1)}%`,
            }))}
          />
        </div>
        <div>
          <SectionHeader
            title="Action mix"
            description="How the verified transactions split across protocol actions."
          />
          <BarList
            rows={(net?.actions ?? []).map((a) => ({
              label: a.action.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()),
              value: a.transactions,
              hint: formatUsd(a.volume),
            }))}
            format={formatCount}
          />
        </div>
      </section>

      <Divider />

      {/* ── Community ──────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-10">
        <SectionHeader
          title="Community & reach"
          description="Counts only — no e-mail address or wallet identity is ever loaded into this page."
        />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <StatTile
            label="E-mail list"
            accent
            loading={!data}
            value={<AnimatedNumber value={emailTotal} />}
            sub="Subscribers + waitlist"
          />
          <StatTile
            label="Waitlist"
            loading={!data}
            value={<AnimatedNumber value={community?.waitlist ?? 0} />}
            sub={community?.waitlistFirst ? `since ${community.waitlistFirst}` : undefined}
          />
          <StatTile
            label="Peridot accounts"
            loading={!data}
            value={<AnimatedNumber value={community?.accounts.mainnet ?? 0} />}
            sub="Social / e-mail logins"
          />
          <StatTile
            label="Linked wallets"
            loading={!data}
            value={<AnimatedNumber value={community?.walletLinks.total ?? 0} />}
            sub={`${formatCount(community?.walletLinks.verified ?? 0)} verified`}
          />
          <StatTile
            label="EVM links"
            loading={!data}
            value={<AnimatedNumber value={community?.walletLinks.evm ?? 0} />}
            sub="Accounts on EVM chains"
          />
          <StatTile
            label="Stellar links"
            loading={!data}
            value={<AnimatedNumber value={community?.walletLinks.stellar ?? 0} />}
            sub="Accounts on Stellar"
          />
        </div>

        <div className="mt-8">
          <SectionHeader
            title="E-mail signups per month"
            description="Newsletter subscribers and waitlist entries combined."
          />
          <MonthlyBarChart
            data={(community?.emailCurve ?? []).map((r) => ({ month: r.month, value: r.count }))}
            label="Signups"
          />
        </div>
      </section>

      <Divider />

      {/* ── Website traffic ────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-10">
        <SectionHeader
          title="Website traffic"
          description="Visitors across peridot.finance, measured by PostHog."
        />
        {traffic ? (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatTile
                label="Visitors"
                accent
                value={<AnimatedNumber value={traffic.visitors} />}
                sub="Unique, all-time"
              />
              <StatTile
                label="Pageviews"
                value={<AnimatedNumber value={traffic.pageviews} />}
                sub="All-time"
              />
              <StatTile
                label="Visitors 30d"
                value={<AnimatedNumber value={traffic.visitors30d} />}
                delta={
                  <Delta current={traffic.visitors30d} previous={traffic.visitorsPrev30d} />
                }
                sub={`${formatCount(traffic.pageviews30d)} pageviews`}
              />
              <StatTile
                label="Visitors 7d"
                value={<AnimatedNumber value={traffic.visitors7d} />}
                delta={<Delta current={traffic.visitors7d} previous={traffic.visitorsPrev7d} />}
                sub="Last week"
              />
            </div>
            <div className="mt-8">
              <MonthlyBarChart
                data={traffic.monthly.map((r) => ({ month: r.month, value: r.visitors }))}
                label="Unique visitors"
              />
            </div>
            <PageBreakdown pages={traffic.pages ?? []} />
          </>
        ) : (
          <div className="rounded-2xl border border-dashed border-foreground/[0.12] p-6 text-sm text-foreground/50">
            PostHog traffic is not connected yet. Add a personal API key
            (<code className="font-mono text-xs">POSTHOG_PERSONAL_API_KEY</code>) and the
            project id (<code className="font-mono text-xs">POSTHOG_PROJECT_ID</code>) to
            the server environment — visitor numbers then appear here
            automatically. The public ingestion key cannot read analytics.
          </div>
        )}
      </section>

      <footer className="mx-auto max-w-6xl px-6 pb-20 pt-6">
        <p className="text-[11px] leading-relaxed text-foreground/35">
          On-chain figures come from Peridot&apos;s verified-transaction ledger and the
          TVL cache; Stellar liquidity is read live from Soroban. Volume is the
          summed USD value of verified supply, borrow, repay and redeem
          transactions and therefore counts gross flow, not net deposits.
          Testnet figures include incentivised campaign activity and are not
          comparable to mainnet. Every headline figure covers the full history;
          where a delta is shown it compares the last 30 days with the 30 days
          before them. Cohorts and repeat rates
          are built on wallets, so one person using two wallets counts twice;
          DAU and MAU are built on sign-ins, which a returning wallet only
          produces when it opens the app.
        </p>
      </footer>
    </main>
  )
}

// ─── Page-by-page traffic ─────────────────────────────────────────────────────
//
// The headline traffic numbers say how much; investors ask *where*. Collapsed
// it shows the eight biggest pages so the section stays scannable; expanded it
// lists everything PostHog returns, scrollable, without leaving the page.

function PageBreakdown({
  pages,
}: {
  pages: { path: string; views: number; visitors: number; views30d: number; visitors30d: number }[]
}) {
  const [open, setOpen] = useState(false)
  const [period, setPeriod] = useState<"all" | "30d">("all")

  const rows = useMemo(() => {
    const mapped = pages.map((p) => ({
      path: p.path,
      views: period === "all" ? p.views : p.views30d,
      visitors: period === "all" ? p.visitors : p.visitors30d,
    }))
    // Re-sort per period: the all-time leader is not the current leader.
    return mapped.filter((r) => r.views > 0).sort((a, b) => b.views - a.views)
  }, [pages, period])

  const visible = open ? rows : rows.slice(0, 8)
  const max = rows[0]?.views ?? 0
  const totalViews = rows.reduce((s, r) => s + r.views, 0)

  if (!pages.length) return null

  return (
    <div className="mt-10 rounded-2xl border border-foreground/[0.07]">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-foreground/[0.06] px-5 py-4">
        <div>
          <h3 className="text-sm font-semibold tracking-tight">Page by page</h3>
          <p className="mt-1 text-xs text-foreground/50">
            {formatCount(rows.length)} pages · {formatCount(totalViews)} views
            {period === "30d" ? " in the last 30 days" : " all-time"}
          </p>
        </div>
        <Segmented<"all" | "30d">
          size="sm"
          value={period}
          onChange={setPeriod}
          options={[
            { id: "all", label: "All time" },
            { id: "30d", label: "Last 30d" },
          ]}
        />
      </div>

      <div
        className={cn(
          "divide-y divide-foreground/[0.04]",
          open && "max-h-[28rem] overflow-y-auto"
        )}
      >
        <div className="grid grid-cols-[1fr_auto_auto] gap-4 px-5 py-2 text-[10px] uppercase tracking-widest text-foreground/35">
          <span>Page</span>
          <span className="w-20 text-right">Views</span>
          <span className="w-20 text-right">Visitors</span>
        </div>
        {visible.map((row) => (
          <div
            key={row.path}
            className="grid grid-cols-[1fr_auto_auto] items-center gap-4 px-5 py-2.5 transition-colors hover:bg-foreground/[0.02]"
          >
            <div className="min-w-0">
              <div className="truncate font-mono text-xs text-foreground/80">{row.path}</div>
              <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-foreground/[0.06]">
                <div
                  className="h-full rounded-full bg-[var(--dataroom-accent)] transition-[width] duration-500 ease-out"
                  style={{ width: max > 0 ? `${Math.max(1, (row.views / max) * 100)}%` : "0%" }}
                />
              </div>
            </div>
            <span className="w-20 text-right font-mono text-xs tabular-nums">
              {formatCount(row.views)}
            </span>
            <span className="w-20 text-right font-mono text-xs tabular-nums text-foreground/55">
              {formatCount(row.visitors)}
            </span>
          </div>
        ))}
      </div>

      {rows.length > 8 && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex w-full items-center justify-center gap-2 border-t border-foreground/[0.06] py-3 text-xs text-foreground/55 transition-colors hover:text-foreground"
        >
          {open ? "Show top 8" : `Show all ${formatCount(rows.length)} pages`}
          <ChevronDown
            className={cn("h-3.5 w-3.5 transition-transform duration-300", open && "rotate-180")}
          />
        </button>
      )}
    </div>
  )
}

// ─── Small pieces ─────────────────────────────────────────────────────────────

function Divider() {
  return <div className="mx-6 border-t border-foreground/[0.06]" />
}

function Metric({
  label,
  value,
  large,
}: {
  label: string
  value: string
  large?: boolean
}) {
  return (
    <div className={large ? "text-left" : "text-center"}>
      <div className="text-[10px] uppercase tracking-widest text-foreground/40">{label}</div>
      <div
        className={cn(
          "mt-1 font-mono tabular-nums",
          large ? "text-lg" : "text-xs text-foreground/80"
        )}
      >
        {value}
      </div>
    </div>
  )
}
