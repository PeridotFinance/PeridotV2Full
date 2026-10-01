'use client'

import React, { useMemo } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import { useLogin, usePrivy } from '@privy-io/react-auth'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Zap, Gift, Trophy, Star, CheckCircle2, Loader2,
  ExternalLink, ChevronRight, TrendingUp, Clock, AlertCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { FEATURE_FLAGS } from '@/config/featureFlags'
import { MERKL_DISTRIBUTOR, MERKL_DISTRIBUTOR_ABI, buildClaimPayload } from '@/lib/merkl'
import type { ParsedMerklReward } from '@/lib/merkl'

// ─── Types ────────────────────────────────────────────────────────────────────

interface EligibilityData {
  address: string
  rank: number | null
  eligible: boolean
  tier: string | null
  boostPct: number
  tierTable: { tier: string; boostPct: number; minSupplyUsd: number | null }[]
}

interface MerklData {
  rewards: ParsedMerklReward[]
}

interface BoostClaim {
  id: number
  tier: string
  boost_pct: number
  usdc_amount_display: string
  status: string
  epoch: string
  tx_hash: string | null
  sent_at: string | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BSC_CHAIN_ID = 56

const TIER_LABELS: Record<string, string> = {
  top1: '#1 on Leaderboard',
  top2: '#2 on Leaderboard',
  top3: '#3 on Leaderboard',
  premium: 'Premium Member',
}

const TIER_COLORS: Record<string, string> = {
  top1: 'from-amber-400 to-yellow-300',
  top2: 'from-slate-300 to-slate-200',
  top3: 'from-amber-700 to-amber-500',
  premium: 'from-emerald-400 to-teal-300',
}

const TIER_ICONS: Record<string, React.ReactNode> = {
  top1:    <Trophy className="w-4 h-4" />,
  top2:    <Trophy className="w-4 h-4" />,
  top3:    <Trophy className="w-4 h-4" />,
  premium: <Star   className="w-4 h-4" />,
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TierBadge({ tier }: { tier: string }) {
  const gradient = TIER_COLORS[tier] || 'from-indigo-400 to-purple-400'
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold
        bg-gradient-to-r ${gradient} text-black/80 shadow-sm`}
    >
      {TIER_ICONS[tier]}
      {TIER_LABELS[tier] || tier}
    </span>
  )
}

function StatCard({
  label,
  value,
  sub,
  accent = false,
}: {
  label: string
  value: string
  sub?: string
  accent?: boolean
}) {
  return (
    <div
      className={`rounded-xl border p-4 flex flex-col gap-1
        ${accent
          ? 'bg-emerald-500/5 border-emerald-500/20 dark:bg-emerald-400/5 dark:border-emerald-400/20'
          : 'bg-white/3 border-white/8 dark:bg-white/3 dark:border-white/8'
        }`}
    >
      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
      <p className={`font-mono text-2xl font-bold ${accent ? 'text-emerald-400' : 'text-foreground'}`}>
        {value}
      </p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}

function RewardRow({ reward }: { reward: ParsedMerklReward }) {
  return (
    <div className="flex items-center justify-between py-2.5 px-3 rounded-lg
      bg-white/2 border border-white/5 hover:border-white/10 transition-colors">
      <div className="flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center
          text-xs font-bold text-foreground">
          {reward.symbol.slice(0, 2)}
        </div>
        <span className="text-sm font-medium text-foreground">{reward.symbol}</span>
      </div>
      <span className="font-mono text-sm font-semibold text-emerald-400">
        {reward.unclaimedDisplay}
      </span>
    </div>
  )
}

function BoostClaimRow({ claim }: { claim: BoostClaim }) {
  const statusColor =
    claim.status === 'confirmed' ? 'text-emerald-400' :
    claim.status === 'sent'      ? 'text-blue-400' :
    claim.status === 'failed'    ? 'text-red-400' :
    'text-amber-400'

  const statusLabel =
    claim.status === 'confirmed' ? 'Confirmed' :
    claim.status === 'sent'      ? 'Sent' :
    claim.status === 'failed'    ? 'Failed' :
    'Pending'

  return (
    <div className="flex items-center justify-between py-2.5 px-3 rounded-lg
      bg-white/2 border border-white/5 text-sm">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground font-mono text-xs">{claim.epoch}</span>
        <TierBadge tier={claim.tier} />
      </div>
      <div className="flex items-center gap-3">
        <span className="font-mono font-semibold text-foreground">${claim.usdc_amount_display}</span>
        <span className={`text-xs font-medium ${statusColor}`}>{statusLabel}</span>
        {claim.tx_hash && (
          <a
            href={`https://bscscan.com/tx/${claim.tx_hash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>
    </div>
  )
}

// ─── Connect prompt ───────────────────────────────────────────────────────────

function ConnectPrompt() {
  const { login } = useLogin()
  const { ready, authenticated } = usePrivy()

  const handleConnect = () => {
    if (FEATURE_FLAGS.WALLET_PRIVY_EXPERIMENT) {
      if (ready && !authenticated) login()
    } else {
      const btn = document.querySelector('appkit-button') as HTMLElement
      if (btn) btn.click()
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center text-center py-16 gap-6"
    >
      <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20
        flex items-center justify-center">
        <Gift className="w-8 h-8 text-emerald-400" />
      </div>
      <div>
        <h2 className="text-xl font-semibold text-foreground mb-2">Connect to view your rewards</h2>
        <p className="text-sm text-muted-foreground max-w-xs">
          Connect your wallet to see your claimable MERKL rewards and Peridot boost earnings.
        </p>
      </div>
      <button
        onClick={handleConnect}
        className="px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400
          text-black font-semibold text-sm transition-all duration-200
          hover:shadow-[0_0_20px_rgba(52,211,153,0.3)] active:scale-[0.98]"
      >
        Connect Wallet
      </button>
    </motion.div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function ClaimClient() {
  const { address, isConnected, chainId } = useAccount()

  // ── Data fetching ──
  const { data: merklData, isLoading: merklLoading, error: merklError } = useQuery<MerklData>({
    queryKey: ['merkl-rewards', address, BSC_CHAIN_ID],
    queryFn: async () => {
      const res = await fetch(`/api/claim/merkl?address=${address}&chainId=${BSC_CHAIN_ID}`)
      if (!res.ok) throw new Error('Failed to fetch MERKL rewards')
      return res.json()
    },
    enabled: !!address && isConnected,
    staleTime: 60_000,
    refetchInterval: 120_000,
  })

  const { data: eligibility, isLoading: eligLoading } = useQuery<EligibilityData>({
    queryKey: ['claim-eligibility', address],
    queryFn: async () => {
      const res = await fetch(`/api/claim/eligibility?address=${address}`)
      if (!res.ok) throw new Error('Failed to fetch eligibility')
      return res.json()
    },
    enabled: !!address && isConnected,
    staleTime: 120_000,
  })

  const { data: boostHistory } = useQuery<{ claims: BoostClaim[] }>({
    queryKey: ['boost-claims', address],
    queryFn: async () => {
      const res = await fetch(`/api/claim/boosts?address=${address}`)
      if (!res.ok) return { claims: [] }
      return res.json()
    },
    enabled: !!address && isConnected,
    staleTime: 60_000,
  })

  // ── Claim transaction ──
  const {
    writeContract,
    data: claimTxHash,
    isPending: claimPending,
    reset: resetClaim,
  } = useWriteContract()

  const { isLoading: claimConfirming, isSuccess: claimSuccess } =
    useWaitForTransactionReceipt({ hash: claimTxHash })

  const rewards: ParsedMerklReward[] = useMemo(() => merklData?.rewards ?? [], [merklData])

  const totalClaimable = useMemo(() => {
    if (!rewards.length) return '0.00'
    const usdc = rewards.find(r => r.symbol.toUpperCase() === 'USDC')
    if (!usdc) return '0.00'
    const million = BigInt(1_000_000)
    const whole = BigInt(usdc.unclaimed) / million
    const frac = (BigInt(usdc.unclaimed) % million).toString().padStart(6, '0').slice(0, 2)
    return `${whole}.${frac}`
  }, [rewards])

  const hasRewards = rewards.some(r => BigInt(r.unclaimed) > BigInt(0))

  const distributor = MERKL_DISTRIBUTOR[BSC_CHAIN_ID]

  const handleClaim = () => {
    if (!address || !hasRewards || !distributor) return

    const payload = buildClaimPayload(address as `0x${string}`, rewards)

    writeContract(
      {
        address: distributor,
        abi: MERKL_DISTRIBUTOR_ABI,
        functionName: 'claim',
        args: [payload.users, payload.tokens, payload.amounts, payload.proofs],
        chainId: BSC_CHAIN_ID,
      },
      {
        onSuccess: (hash) => {
          toast.success('Claim submitted', { description: `Tx: ${hash.slice(0, 10)}…` })
        },
        onError: (err) => {
          toast.error('Claim failed', { description: (err as Error).message })
        },
      }
    )
  }

  const isLoading = merklLoading || eligLoading

  // ── Render ──
  return (
    <div className="min-h-screen">
      <div className="max-w-2xl mx-auto px-4 pb-24">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-10"
        >
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3 font-mono uppercase tracking-widest">
            <Zap className="w-3.5 h-3.5 text-emerald-400" />
            BSC Mainnet
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Claim Rewards</h1>
          <p className="text-muted-foreground text-sm">
            Your MERKL earnings and Peridot boost payouts in one place.
          </p>
        </motion.div>

        {/* Not connected */}
        {!isConnected && <ConnectPrompt />}

        {/* Loading skeleton */}
        {isConnected && isLoading && (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div
                key={i}
                className="h-24 rounded-xl bg-white/3 border border-white/5 animate-pulse"
              />
            ))}
          </div>
        )}

        {/* Connected + loaded */}
        {isConnected && !isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="space-y-5"
          >
            {/* Stats row */}
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                label="MERKL Claimable"
                value={`$${totalClaimable}`}
                sub="USDC · BSC"
                accent={hasRewards}
              />
              <StatCard
                label="Your Tier"
                value={eligibility?.eligible ? `+${eligibility.boostPct}%` : '—'}
                sub={eligibility?.tier ? TIER_LABELS[eligibility.tier] : 'No boost active'}
              />
            </div>

            {/* Boost tier badge */}
            {eligibility?.eligible && eligibility.tier && (
              <motion.div
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                className="rounded-xl border border-white/8 bg-white/3 p-4 flex items-center
                  justify-between gap-4"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20
                    flex items-center justify-center text-emerald-400">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      Peridot Boost Active
                    </p>
                    <p className="text-xs text-muted-foreground">
                      +{eligibility.boostPct}% on your MERKL earnings, paid in USDC
                    </p>
                  </div>
                </div>
                <TierBadge tier={eligibility.tier} />
              </motion.div>
            )}

            {/* MERKL Rewards breakdown */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">
                  MERKL Rewards
                </h2>
                <span className="text-xs text-muted-foreground font-mono">BSC · Chain 56</span>
              </div>

              {merklError ? (
                <div className="flex items-center gap-2 text-sm text-amber-400 py-3 px-4
                  rounded-xl bg-amber-400/5 border border-amber-400/20">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  Could not load MERKL rewards. Try again later.
                </div>
              ) : rewards.length === 0 ? (
                <div className="py-8 text-center rounded-xl border border-white/5 bg-white/2">
                  <p className="text-sm text-muted-foreground">No claimable MERKL rewards yet.</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Supply assets on Peridot to start earning.
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {rewards.map(r => (
                    <RewardRow key={r.tokenAddress} reward={r} />
                  ))}
                </div>
              )}
            </section>

            {/* Claim button */}
            {hasRewards && (
              <AnimatePresence mode="wait">
                {claimSuccess ? (
                  <motion.div
                    key="success"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex items-center justify-center gap-2 py-3.5 rounded-xl
                      bg-emerald-500/10 border border-emerald-500/30 text-emerald-400
                      text-sm font-semibold"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Claimed successfully
                    <a
                      href={`https://bscscan.com/tx/${claimTxHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-1 opacity-60 hover:opacity-100 transition-opacity"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </motion.div>
                ) : (
                  <motion.button
                    key="btn"
                    onClick={handleClaim}
                    disabled={claimPending || claimConfirming || chainId !== BSC_CHAIN_ID}
                    whileTap={{ scale: 0.98 }}
                    className="w-full py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400
                      disabled:opacity-50 disabled:cursor-not-allowed
                      text-black font-semibold text-sm transition-all duration-200
                      hover:shadow-[0_0_24px_rgba(52,211,153,0.25)] flex items-center
                      justify-center gap-2"
                  >
                    {claimPending || claimConfirming ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {claimPending ? 'Confirm in wallet…' : 'Confirming…'}
                      </>
                    ) : chainId !== BSC_CHAIN_ID ? (
                      <>
                        <AlertCircle className="w-4 h-4" />
                        Switch to BSC to claim
                      </>
                    ) : (
                      <>
                        <Zap className="w-4 h-4" />
                        Claim ${totalClaimable} USDC
                        <ChevronRight className="w-4 h-4 opacity-60" />
                      </>
                    )}
                  </motion.button>
                )}
              </AnimatePresence>
            )}

            {/* Boost history */}
            {(boostHistory?.claims?.length ?? 0) > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                  <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">
                    Boost History
                  </h2>
                </div>
                <div className="space-y-1.5">
                  {boostHistory!.claims.map(c => (
                    <BoostClaimRow key={c.id} claim={c} />
                  ))}
                </div>
              </section>
            )}

            {/* Tier table */}
            {eligibility?.tierTable && eligibility.tierTable.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                  Boost Tiers
                </h2>
                <div className="rounded-xl border border-white/6 overflow-hidden">
                  {eligibility.tierTable.map((row, i) => (
                    <div
                      key={row.tier}
                      className={`flex items-center justify-between px-4 py-2.5 text-sm
                        ${i !== eligibility.tierTable.length - 1 ? 'border-b border-white/5' : ''}
                        ${eligibility.tier === row.tier
                          ? 'bg-emerald-500/5'
                          : 'bg-white/1 hover:bg-white/3'
                        } transition-colors`}
                    >
                      <div className="flex items-center gap-2.5">
                        {eligibility.tier === row.tier && (
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        )}
                        <TierBadge tier={row.tier} />
                        {row.minSupplyUsd && (
                          <span className="text-xs text-muted-foreground">
                            ≥ ${row.minSupplyUsd.toLocaleString()} supplied
                          </span>
                        )}
                      </div>
                      <span className="font-mono text-sm font-semibold text-emerald-400">
                        +{row.boostPct}%
                      </span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Boosts are applied to your MERKL earnings and paid in USDC from Peridot revenue.
                  Distributed monthly.
                </p>
              </section>
            )}
          </motion.div>
        )}
      </div>
    </div>
  )
}
