"use client"

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useReferral } from '@/hooks/use-referral'
import { Input } from '@/components/ui/input'
import { useAccount, useSignMessage } from 'wagmi'
import { useStellarWallet } from '@/hooks/use-stellar-wallet'
import { ConnectWalletButton } from '@/components/wallet/connect-wallet-button'
import { Copy, Share2, Users, Award, ExternalLink, RefreshCw, Sparkles, ChevronDown, Info, HelpCircle, Gift, Clock, CheckCircle2 } from 'lucide-react'
import { AMBASSADOR_PROGRAM, type AmbassadorProgress } from '@/lib/referral/ambassador'
import { useToast } from '@/components/ui/use-toast'
import { Skeleton } from '@/components/ui/skeleton'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { getActionDisplayName } from '@/hooks/use-stats-data'
import { getChainConfig } from '@/config/contracts'

interface VerifiedTransaction {
  tx_hash: string
  action_type: 'supply' | 'borrow' | 'repay' | 'redeem' | 'cross-chain_supply' | 'cross-chain_borrow' | 'cross-chain_repay' | 'cross-chain_redeem'
  token_symbol: string
  amount: string
  usd_value: number
  points_awarded: number
  verified_at: string
  chain_id: number
}

const getChainName = (chainId: number): string => {
  const config = getChainConfig(chainId)
  return config?.chainNameReadable || `Chain ${chainId}`
}

const getExplorerTxUrl = (chainId: number, txHash: string): string | null => {
  const cfg = getChainConfig(chainId) as any
  const base: string | undefined = cfg?.explorer
  if (!base) return null
  const trimmed = base.endsWith('/') ? base.slice(0, -1) : base
  return `${trimmed}/tx/${txHash}`
}


const formatUsd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const formatUsd2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })

/**
 * One invitee's progress toward the Ambassador milestone, in a sentence and a
 * bar. Written to be honest about the two states people ask support about: a
 * balance that is still under the threshold (the streak has not started) and a
 * wallet the sweep has not looked at yet (no numbers, not zero numbers).
 */
type RewardStatus = 'earned' | 'paid' | 'void' | null | undefined

const MilestoneProgress = ({
  progress,
  rewardStatus,
}: {
  progress?: AmbassadorProgress
  rewardStatus?: RewardStatus
}) => {
  if (!progress) {
    return (
      <p className="text-xs text-muted-foreground/70">
        Deposit progress is checked once a day — check back tomorrow.
      </p>
    )
  }

  const { minDepositUsd, holdDays, rewardUsd } = AMBASSADOR_PROGRAM
  const pct = Math.min(100, Math.round((progress.holdDays / holdDays) * 100))
  const balance =
    progress.supplyUsd === null ? null : formatUsd0.format(progress.supplyUsd)

  let line: React.ReactNode
  switch (progress.stage) {
    case 'qualified':
      // Reaching the milestone is not the same as being owed money: a referral
      // where both wallets turn out to belong to one Peridot account is booked
      // `void`. Saying "$5 for you" there would be a promise we never keep.
      line =
        rewardStatus === 'void' ? (
          <>
            Milestone reached, but this invite does not pay — both wallets belong to the
            same Peridot account.
          </>
        ) : (
          <>
            Milestone reached — {formatUsd0.format(rewardUsd)} for you and{' '}
            {formatUsd0.format(rewardUsd)} for them.
          </>
        )
      break
    case 'holding':
      line = (
        <>
          Holding {balance} on Stellar — day {progress.holdDays} of {holdDays}
          {progress.daysRemaining > 0 && (
            <span className="text-muted-foreground/60">
              {' '}({progress.daysRemaining} to go)
            </span>
          )}
        </>
      )
      break
    case 'below':
      line = (
        <>
          {balance} deposited — {formatUsd0.format(minDepositUsd)} starts the {holdDays}-day
          countdown.
        </>
      )
      break
    default:
      line = <>No deposit on Stellar yet.</>
  }

  return (
    <div className="w-full">
      <p className="text-xs text-muted-foreground/80 mb-1.5">{line}</p>
      <div className="h-1.5 w-full rounded-full bg-white/40 dark:bg-white/[0.06] overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            progress.qualified
              ? 'bg-gradient-to-r from-[#5E7945] to-[#7BA05B]'
              : 'bg-[#7BA05B]/60'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

/** Compact status chip for an invitee row. */
const MilestoneBadge = ({
  progress,
  rewardStatus,
}: {
  progress?: AmbassadorProgress
  rewardStatus?: RewardStatus
}) => {
  if (progress?.qualified && rewardStatus === 'void') {
    return (
      <Badge className="bg-white/5 text-muted-foreground border-white/10 backdrop-blur-sm">
        Not eligible
      </Badge>
    )
  }
  if (progress?.qualified) {
    return (
      <Badge className="bg-gradient-to-r from-[#5E7945] to-[#7BA05B] text-white border-0 shadow-[0_4px_12px_rgba(94,121,69,0.3)]">
        <Gift className="h-3 w-3 mr-1.5" />
        {rewardStatus === 'paid'
          ? `${formatUsd0.format(AMBASSADOR_PROGRAM.rewardUsd)} paid`
          : `${formatUsd0.format(AMBASSADOR_PROGRAM.rewardUsd)} earned`}
      </Badge>
    )
  }
  if (progress?.stage === 'holding') {
    return (
      <Badge className="bg-[#5E7945]/10 text-[#5E7945] dark:text-[#7BA05B] border border-[#5E7945]/20">
        <Clock className="h-3 w-3 mr-1.5" />
        Day {progress.holdDays}/{AMBASSADOR_PROGRAM.holdDays}
      </Badge>
    )
  }
  return (
    <Badge className="bg-white/5 text-muted-foreground border-white/10 backdrop-blur-sm">
      Not yet qualified
    </Badge>
  )
}

const InvitePageSkeleton = () => (
  <div className="min-h-screen relative overflow-hidden py-8 px-4">
    <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-emerald-50/30 to-slate-100 dark:from-slate-950 dark:via-emerald-950/20 dark:to-slate-900"></div>
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(94,121,69,0.08),transparent_50%)] dark:bg-[radial-gradient(circle_at_30%_20%,rgba(94,121,69,0.15),transparent_50%)]"></div>
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,rgba(123,160,91,0.05),transparent_50%)] dark:bg-[radial-gradient(circle_at_70%_80%,rgba(123,160,91,0.1),transparent_50%)]"></div>
    <div className="relative max-w-6xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="text-center mb-8"
      >
        <Skeleton className="h-12 w-1/2 mx-auto mb-4 bg-white/5" />
        <Skeleton className="h-6 w-3/4 mx-auto bg-white/5" />
      </motion.div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <div className="backdrop-blur-2xl bg-white/5 border border-white/10 rounded-3xl shadow-2xl h-full p-6">
            <Skeleton className="h-8 w-64 mb-2 bg-white/5" />
            <Skeleton className="h-5 w-80 mb-6 bg-white/5" />
            <Skeleton className="h-12 w-64 mx-auto bg-white/5" />
              </div>
        </div>
        <div>
          <div className="backdrop-blur-2xl bg-white/5 border border-white/10 rounded-3xl shadow-2xl h-full p-6">
            <Skeleton className="h-7 w-32 mb-4 bg-white/5" />
            <Skeleton className="h-24 w-full mb-4 bg-white/5" />
            <Skeleton className="h-24 w-full bg-white/5" />
              </div>
        </div>
      </div>
    </div>
  </div>
)

export default function InvitePage() {
  const { address, isConnected } = useAccount()
  // The program pays out on Stellar, so a Freighter-only session has to be able
  // to reach this page — it has no EVM address at all.
  const { isConnected: stellarConnected } = useStellarWallet()
  const { signMessageAsync } = useSignMessage()
  const { toast } = useToast()
  const {
    referralCode,
    username,
    stats,
    referredUsers,
    isLoading,
    error,
    generateReferralCode,
    generateReferralLink,
    copyReferralLink,
    refetch,
    fetchProfile,
    needsStellarSignIn,
    signInStellar,
    referralFetch
  } = useReferral()

  const [copied, setCopied] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)
  const [nameSuccess, setNameSuccess] = useState<string | null>(null)
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set())
  const [userTransactions, setUserTransactions] = useState<Record<string, { transactions: VerifiedTransaction[], loading: boolean }>>({})

  const handleCopyLink = async () => {
    const success = await copyReferralLink()
    if (success) {
      setCopied(true)
      toast({
        title: "Link Copied!",
        description: "Your referral link has been copied to clipboard.",
        duration: 3000,
      })
      setTimeout(() => setCopied(false), 3000)
    } else {
      toast({
        title: "Copy Failed",
        description: "Failed to copy link to clipboard.",
        variant: "destructive",
        duration: 3000,
      })
    }
  }

  const handleShare = async () => {
    if (!referralCode) return

    const link = generateReferralLink(referralCode)
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join Peridot Finance',
          text: `Join me on Peridot Finance — deposit ${formatUsd0.format(AMBASSADOR_PROGRAM.minDepositUsd)} on Stellar and keep it there for ${AMBASSADOR_PROGRAM.holdDays} days, and we each get ${formatUsd0.format(AMBASSADOR_PROGRAM.rewardUsd)}.`,
          url: link,
        })
      } catch (error) {
        console.error('Error sharing:', error)
      }
    } else {
      // Fallback to copy
      handleCopyLink()
    }
  }

  const formatUSD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

  const fetchUserTransactions = async (walletAddress: string) => {
    if (userTransactions[walletAddress]) return // Already loaded
    
    setUserTransactions(prev => ({ ...prev, [walletAddress]: { transactions: [], loading: true } }))
    try {
      // Same dual credential as the rest of the page: a kit user has a session
      // cookie, not a bearer.
      const res = await referralFetch(`/api/referral/referred-transactions?referred=${walletAddress}&limit=20`, { cache: 'no-store' })
      const data = await res.json()
      if (res.ok && data.success) {
        setUserTransactions(prev => ({ ...prev, [walletAddress]: { transactions: data.transactions || [], loading: false } }))
      } else {
        setUserTransactions(prev => ({ ...prev, [walletAddress]: { transactions: [], loading: false } }))
      }
    } catch (error) {
      console.error('Error fetching transactions:', error)
      setUserTransactions(prev => ({ ...prev, [walletAddress]: { transactions: [], loading: false } }))
    }
  }

  const handleToggleUser = (walletAddress: string) => {
    const newExpanded = new Set(expandedUsers)
    if (newExpanded.has(walletAddress)) {
      newExpanded.delete(walletAddress)
    } else {
      newExpanded.add(walletAddress)
      fetchUserTransactions(walletAddress)
    }
    setExpandedUsers(newExpanded)
  }

  const handleCopy = (text: string) => {
    try {
      navigator.clipboard.writeText(text)
      toast({ title: 'Copied', description: 'Transaction hash copied to clipboard.' })
    } catch {
      toast({ title: 'Copy failed', description: 'Could not copy to clipboard.', variant: 'destructive' })
    }
  }

  const handleSaveName = async () => {
    if (!address) return
    setNameError(null)
    setNameSuccess(null)
    const value = nameInput.trim()
    if (!value) {
      setNameError('Please enter a name')
      toast({ title: 'Invalid name', description: 'Please enter a valid name', variant: 'destructive' })
      return
    }
    // Client-side validation (mirror server rules)
    const valid = /^[a-zA-Z0-9_-]{3,32}$/.test(value)
    if (!valid) {
      setNameError('Use 3–32 letters, numbers, hyphen or underscore')
      toast({ title: 'Invalid name', description: 'Use 3–32 letters, numbers, hyphen or underscore', variant: 'destructive' })
      return
    }
    try {
      setSavingName(true)
      const timestamp = Date.now()
      const message = `Peridot: set username ${value} for ${address.toLowerCase()} at ${timestamp}`
      let signature: string
      try {
        signature = await signMessageAsync({ message, account: address })
      } catch (err) {
        setNameError('Signature was rejected')
        toast({ title: 'Signature rejected', description: 'We didn\'t save any changes', variant: 'destructive' })
        return
      }

      const res = await fetch('/api/user/profile/set-username', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: address, username: value, signature, timestamp })
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        const desc = data?.error || 'Try another name'
        setNameError(desc)
        toast({ title: 'Could not save name', description: desc, variant: 'destructive' })
        return
      }
      await fetchProfile()
      setNameSuccess('Saved! Your link uses your name now.')
      toast({ title: 'Name saved', description: 'Your referral link now uses your name.' })
      setNameInput('')
    } catch (e) {
      setNameError('Unexpected error. Please try again')
      toast({ title: 'Failed to save name', description: 'Please try again', variant: 'destructive' })
    } finally {
      setSavingName(false)
    }
  }

  if (!isConnected && !stellarConnected) {
    return (
      <div className="min-h-screen relative overflow-hidden flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-emerald-50/20 to-slate-100 dark:from-slate-950 dark:via-emerald-950/20 dark:to-slate-900"></div>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(94,121,69,0.03),transparent_70%)] dark:bg-[radial-gradient(circle_at_50%_50%,rgba(94,121,69,0.2),transparent_70%)] animate-pulse"></div>
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="relative text-center"
        >
          <div className="backdrop-blur-2xl bg-white/[0.03] border border-white/10 rounded-3xl shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.1)] max-w-md mx-auto p-8 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-[#5E7945]/5 to-[#7BA05B]/5 opacity-50"></div>
            <div className="relative">
            <CardHeader className="text-center pb-4">
                <CardTitle className="text-3xl font-bold bg-gradient-to-r from-[#5E7945] via-[#7BA05B] to-[#5E7945] bg-clip-text text-transparent bg-[length:200%_100%] animate-[shimmer_3s_ease-in-out_infinite]">
                Connect Wallet to Continue
              </CardTitle>
                <CardDescription className="text-muted-foreground mt-2">
                Please connect your wallet to access the referral system
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <ConnectWalletButton className="w-full" />
            </CardContent>
            </div>
          </div>
        </motion.div>
        <style dangerouslySetInnerHTML={{__html: `
          @keyframes shimmer {
            0%, 100% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
          }
        `}} />
      </div>
    )
  }
  
  if (isLoading && !referralCode) {
    return <InvitePageSkeleton />
  }

  return (
    <div className="min-h-screen relative overflow-hidden py-8 px-4">
      {/* Animated Background Layers */}
      <div className="fixed inset-0 -z-10">
        {/* Light mode: very light background with subtle gradients, Dark mode: dark background */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-emerald-50/20 to-slate-100 dark:from-slate-950 dark:via-emerald-950/20 dark:to-slate-900"></div>
        {/* Reduced opacity for light mode to improve contrast */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(94,121,69,0.03),transparent_50%)] dark:bg-[radial-gradient(circle_at_30%_20%,rgba(94,121,69,0.15),transparent_50%)] animate-[float_20s_ease-in-out_infinite]"></div>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,rgba(123,160,91,0.02),transparent_50%)] dark:bg-[radial-gradient(circle_at_70%_80%,rgba(123,160,91,0.1),transparent_50%)] animate-[float_25s_ease-in-out_infinite_reverse]"></div>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(94,121,69,0.02),transparent_70%)] dark:bg-[radial-gradient(circle_at_50%_50%,rgba(94,121,69,0.08),transparent_70%)] animate-[pulse_15s_ease-in-out_infinite]"></div>
      </div>

      <div className="relative max-w-6xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="text-center mb-12"
        >
          <div className="inline-block mb-4">
            <h1 className="text-5xl md:text-7xl font-bold bg-gradient-to-r from-[#5E7945] via-[#7BA05B] to-[#5E7945] bg-clip-text text-transparent bg-[length:200%_100%] animate-[shimmer_4s_ease-in-out_infinite] mb-4 dark:drop-shadow-[0_0_30px_rgba(94,121,69,0.3)]">
            Invite Friends
          </h1>
            <div className="h-1 w-24 mx-auto bg-gradient-to-r from-transparent via-[#5E7945] to-transparent rounded-full dark:blur-sm"></div>
          </div>
          <p className="text-lg md:text-xl text-muted-foreground/80 max-w-2xl mx-auto leading-relaxed">
            Invite a friend to Peridot. When they keep{' '}
            {formatUsd0.format(AMBASSADOR_PROGRAM.minDepositUsd)} deposited on Stellar for{' '}
            {AMBASSADOR_PROGRAM.holdDays} days, you both earn{' '}
            {formatUsd0.format(AMBASSADOR_PROGRAM.rewardUsd)}.
          </p>
        </motion.div>

        {/*
          Freighter-only session: the referral routes accept the Stellar wallet-
          session cookie, but minting one needs a signature. Ask for it here
          rather than popping the wallet unannounced on page load.
        */}
        {needsStellarSignIn && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="mb-8"
          >
            <div className="relative backdrop-blur-2xl bg-white/70 dark:bg-white/[0.03] border border-white/30 dark:border-white/10 rounded-3xl p-6 md:p-8 text-center max-w-2xl mx-auto">
              <h3 className="text-lg font-bold text-foreground mb-2">Verify your wallet</h3>
              <p className="text-sm text-muted-foreground/80 mb-5 leading-relaxed">
                Sign a short message so we can show you your invite link and who joined
                through it. It is a signature only — it costs nothing and moves nothing.
              </p>
              <Button
                onClick={async () => {
                  setVerifying(true)
                  const ok = await signInStellar()
                  setVerifying(false)
                  if (!ok) {
                    toast({
                      title: 'Not verified',
                      description: 'Sign the message in your wallet to load your referrals.',
                      variant: 'destructive',
                    })
                  }
                }}
                disabled={verifying}
                className="bg-gradient-to-r from-[#5E7945] to-[#7BA05B] text-white border-0"
              >
                {verifying ? 'Waiting for your wallet…' : 'Verify wallet'}
              </Button>
            </div>
          </motion.div>
        )}

        {/* Points Info Card */}
        {referralCode && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="mb-8"
          >
            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-[#5E7945]/20 via-[#7BA05B]/20 to-[#5E7945]/20 dark:from-[#5E7945]/20 dark:via-[#7BA05B]/20 dark:to-[#5E7945]/20 rounded-3xl blur-xl opacity-40 dark:opacity-50 group-hover:opacity-60 dark:group-hover:opacity-70 transition-opacity duration-300"></div>
              <div className="relative backdrop-blur-2xl bg-white/70 dark:bg-white/[0.03] border border-white/30 dark:border-white/10 rounded-3xl shadow-[0_4px_16px_rgba(0,0,0,0.08)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.1)] overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-[#5E7945]/5 via-transparent to-[#7BA05B]/5 dark:from-[#5E7945]/5 dark:via-transparent dark:to-[#7BA05B]/5 opacity-50"></div>
                <div className="relative p-6 md:p-8">
                  <div className="flex items-start gap-4">
                    <div className="relative shrink-0">
                      <div className="absolute inset-0 bg-[#5E7945]/20 rounded-xl blur-lg"></div>
                      <div className="relative p-3 bg-gradient-to-br from-[#5E7945]/10 to-[#7BA05B]/10 rounded-xl border border-[#5E7945]/20">
                        <Sparkles className="h-6 w-6 text-[#5E7945] drop-shadow-[0_0_8px_rgba(94,121,69,0.5)]" />
                      </div>
                    </div>
                    <div className="flex-1">
                      <h3 className="text-xl md:text-2xl font-bold text-foreground mb-2 flex items-center gap-2">
                        The Ambassador Program
                      </h3>
                      <p className="text-sm md:text-base text-muted-foreground/80 leading-relaxed mb-4">
                        Share your link. When someone who joined through it holds at least{' '}
                        {formatUsd0.format(AMBASSADOR_PROGRAM.minDepositUsd)} deposited in the
                        Peridot Stellar markets for {AMBASSADOR_PROGRAM.holdDays} days in a row,
                        you each earn {formatUsd0.format(AMBASSADOR_PROGRAM.rewardUsd)} in{' '}
                        {AMBASSADOR_PROGRAM.payoutAsset} — no cap on how many friends you invite.
                        Deposits are checked once a day; withdrawing below{' '}
                        {formatUsd0.format(AMBASSADOR_PROGRAM.minDepositUsd)} restarts the count.
                        Rewards are paid out manually after the milestone, so allow a few days.
                      </p>
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/60 dark:bg-white/[0.05] border border-white/20 dark:border-white/10 backdrop-blur-sm">
                          <Users className="h-4 w-4 text-[#5E7945]" />
                          <span className="text-sm font-semibold text-foreground">
                            {stats.totalReferrals} total referrals
                          </span>
                        </div>
                        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-[#5E7945]/10 to-[#7BA05B]/10 border border-[#5E7945]/20">
                          <CheckCircle2 className="h-4 w-4 text-[#5E7945]" />
                          <span className="text-sm font-bold text-[#5E7945] dark:text-[#7BA05B]">
                            {stats.qualifiedReferrals} reached the milestone
                          </span>
                          {/* Tooltip */}
                          <div className="relative inline-block">
                            <input type="checkbox" id="verified-tooltip-1" className="peer hidden" />
                            <label htmlFor="verified-tooltip-1" className="cursor-pointer">
                              <HelpCircle className="h-3.5 w-3.5 text-[#5E7945]/70 hover:text-[#5E7945] transition-colors" />
                            </label>
                            <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 p-3 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-white/20 dark:border-white/10 rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.2)] opacity-0 invisible peer-checked:opacity-100 peer-checked:visible transition-all duration-200 z-50 pointer-events-none">
                              <p className="text-xs text-foreground leading-relaxed">
                                A friend reaches the milestone once they have held at least{' '}
                                {formatUsd0.format(AMBASSADOR_PROGRAM.minDepositUsd)} deposited in
                                the Peridot Stellar markets for {AMBASSADOR_PROGRAM.holdDays}{' '}
                                consecutive days. Balances are read on chain once a day.
                              </p>
                              <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-white/95 dark:border-t-slate-900/95"></div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Stats Cards */}
        {referralCode && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10"
          >
            {/* Total Referrals Card */}
            <div className="group relative">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-[#5E7945] to-[#7BA05B] rounded-3xl blur opacity-10 dark:opacity-20 group-hover:opacity-20 dark:group-hover:opacity-30 transition-opacity duration-300"></div>
              <div className="relative backdrop-blur-2xl bg-white/60 dark:bg-white/[0.03] border border-white/20 dark:border-white/10 rounded-3xl shadow-[0_4px_16px_rgba(0,0,0,0.08)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.1)] p-6 hover:shadow-[0_6px_24px_rgba(94,121,69,0.15)] dark:hover:shadow-[0_12px_48px_rgba(94,121,69,0.2),inset_0_1px_0_rgba(255,255,255,0.15)] transition-all duration-300 hover:-translate-y-1">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground/70 mb-2 font-medium">Total Referrals</p>
                    <p className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-[#5E7945] to-[#7BA05B] bg-clip-text text-transparent dark:drop-shadow-[0_0_20px_rgba(94,121,69,0.4)]">
                      {stats.totalReferrals}
                    </p>
                  </div>
                  <div className="relative">
                    <div className="absolute inset-0 bg-[#5E7945]/10 dark:bg-[#5E7945]/20 rounded-full blur-xl"></div>
                    <Users className="h-10 w-10 text-[#5E7945] relative z-10 dark:drop-shadow-[0_0_10px_rgba(94,121,69,0.5)]" />
                  </div>
                </div>
              </div>
            </div>

            {/* Milestone Reached Card */}
            <div className="group relative">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-[#7BA05B] to-[#5E7945] rounded-3xl blur opacity-10 dark:opacity-20 group-hover:opacity-20 dark:group-hover:opacity-30 transition-opacity duration-300"></div>
              <div className="relative backdrop-blur-2xl bg-white/60 dark:bg-white/[0.03] border border-white/20 dark:border-white/10 rounded-3xl shadow-[0_4px_16px_rgba(0,0,0,0.08)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.1)] p-6 hover:shadow-[0_6px_24px_rgba(123,160,91,0.15)] dark:hover:shadow-[0_12px_48px_rgba(123,160,91,0.2),inset_0_1px_0_rgba(255,255,255,0.15)] transition-all duration-300 hover:-translate-y-1">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <p className="text-sm text-muted-foreground/70 font-medium">Milestone Reached</p>
                      {/* Tooltip */}
                      <div className="relative inline-block">
                        <input type="checkbox" id="verified-tooltip-2" className="peer hidden" />
                        <label htmlFor="verified-tooltip-2" className="cursor-pointer">
                          <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/60 hover:text-[#5E7945] transition-colors" />
                        </label>
                        <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 p-3 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-white/20 dark:border-white/10 rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.2)] opacity-0 invisible peer-checked:opacity-100 peer-checked:visible transition-all duration-200 z-50 pointer-events-none">
                          <p className="text-xs text-foreground leading-relaxed">
                            Friends who have held at least{' '}
                            {formatUsd0.format(AMBASSADOR_PROGRAM.minDepositUsd)} deposited on
                            Stellar for {AMBASSADOR_PROGRAM.holdDays} days in a row. Each one is
                            worth {formatUsd0.format(AMBASSADOR_PROGRAM.rewardUsd)} to you and{' '}
                            {formatUsd0.format(AMBASSADOR_PROGRAM.rewardUsd)} to them.
                          </p>
                          <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-white/95 dark:border-t-slate-900/95"></div>
                        </div>
                      </div>
                    </div>
                    <p className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-[#7BA05B] to-[#5E7945] bg-clip-text text-transparent dark:drop-shadow-[0_0_20px_rgba(123,160,91,0.4)]">
                      {stats.qualifiedReferrals}
                    </p>
                  </div>
                  <div className="relative">
                    <div className="absolute inset-0 bg-[#7BA05B]/10 dark:bg-[#7BA05B]/20 rounded-full blur-xl"></div>
                    <Award className="h-10 w-10 text-[#7BA05B] relative z-10 dark:drop-shadow-[0_0_10px_rgba(123,160,91,0.5)]" />
                  </div>
                </div>
              </div>
            </div>

            {/* Rewards Card — booked money, and what has already been sent. */}
            <div className="group relative">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-[#5E7945] to-[#7BA05B] rounded-3xl blur opacity-10 dark:opacity-20 group-hover:opacity-20 dark:group-hover:opacity-30 transition-opacity duration-300"></div>
              <div className="relative backdrop-blur-2xl bg-white/60 dark:bg-white/[0.03] border border-white/20 dark:border-white/10 rounded-3xl shadow-[0_4px_16px_rgba(0,0,0,0.08)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.1)] p-6 hover:shadow-[0_6px_24px_rgba(94,121,69,0.15)] dark:hover:shadow-[0_12px_48px_rgba(94,121,69,0.2),inset_0_1px_0_rgba(255,255,255,0.15)] transition-all duration-300 hover:-translate-y-1">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground/70 mb-2 font-medium">Rewards Earned</p>
                    <p className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-[#5E7945] to-[#7BA05B] bg-clip-text text-transparent dark:drop-shadow-[0_0_20px_rgba(94,121,69,0.4)]">
                      {formatUsd0.format((stats.rewardsEarnedUsd || 0) + (stats.rewardsPaidUsd || 0))}
                    </p>
                    <p className="text-xs text-muted-foreground/70 mt-2">
                      {stats.rewardsEarnedUsd > 0
                        ? `${formatUsd2.format(stats.rewardsEarnedUsd)} awaiting payout`
                        : stats.rewardsPaidUsd > 0
                          ? `${formatUsd2.format(stats.rewardsPaidUsd)} paid out`
                          : 'Nothing earned yet'}
                    </p>
                  </div>
                  <div className="relative">
                    <div className="absolute inset-0 bg-[#5E7945]/10 dark:bg-[#5E7945]/20 rounded-full blur-xl"></div>
                    <Gift className="h-10 w-10 text-[#5E7945] relative z-10 dark:drop-shadow-[0_0_10px_rgba(94,121,69,0.5)]" />
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-1 gap-8">
          {/* Name + Referral Link Card */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="lg:col-span-2"
          >
            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-[#5E7945]/10 via-[#7BA05B]/10 to-[#5E7945]/10 dark:from-[#5E7945]/20 dark:via-[#7BA05B]/20 dark:to-[#5E7945]/20 rounded-3xl blur-xl opacity-30 dark:opacity-50 group-hover:opacity-50 dark:group-hover:opacity-70 transition-opacity duration-500"></div>
              <div className="relative backdrop-blur-2xl bg-white/80 dark:bg-white/[0.03] border border-white/30 dark:border-white/10 rounded-3xl shadow-[0_4px_16px_rgba(0,0,0,0.08)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.1)] overflow-hidden">
                {/* Animated gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-br from-[#5E7945]/3 via-transparent to-[#7BA05B]/3 dark:from-[#5E7945]/5 dark:via-transparent dark:to-[#7BA05B]/5 opacity-50"></div>
                <div className="relative p-8">
                  <CardHeader className="pb-6">
                    <div className="flex items-center justify-between flex-wrap gap-4">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <div className="absolute inset-0 bg-[#5E7945]/20 rounded-xl blur-lg"></div>
                          <div className="relative p-2 bg-gradient-to-br from-[#5E7945]/10 to-[#7BA05B]/10 rounded-xl border border-[#5E7945]/20">
                            <Share2 className="h-6 w-6 text-[#5E7945] drop-shadow-[0_0_8px_rgba(94,121,69,0.5)]" />
                          </div>
                        </div>
                  <div>
                          <CardTitle className="text-2xl md:text-3xl font-bold text-foreground flex items-center gap-2">
                      {username ? `Your Referral Link` : `Pick Your Name`}
                    </CardTitle>
                          <CardDescription className="text-muted-foreground/80 mt-1">
                      {username ? `Share this link — every friend who holds ${formatUsd0.format(AMBASSADOR_PROGRAM.minDepositUsd)} for ${AMBASSADOR_PROGRAM.holdDays} days earns you both ${formatUsd0.format(AMBASSADOR_PROGRAM.rewardUsd)}` : 'Choose a public name for your link and leaderboard'}
                    </CardDescription>
                        </div>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={refetch}
                    disabled={isLoading}
                        className="border-white/10 hover:border-[#5E7945]/40 bg-white/5 hover:bg-white/10 backdrop-blur-sm transition-all duration-300 hover:scale-105"
                  >
                    <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Username chooser.
                    Claiming a name is proven with an EVM signature, so it is
                    only offered when there is an EVM address to sign with. A
                    Stellar-only session still gets a working link — it just
                    carries the referral code instead of a name. */}
                {address ? (
                    <div className="relative p-5 rounded-2xl bg-white/[0.02] border border-white/5 backdrop-blur-sm shadow-[inset_0_2px_8px_rgba(0,0,0,0.1),0_1px_0_rgba(255,255,255,0.05)]">
                      <p className="text-sm text-muted-foreground/80 mb-3 font-medium">Your Name</p>
                      <div className="flex gap-3">
                        <div className="flex-1 relative">
                    <Input 
                      placeholder={username || 'alice'}
                      value={nameInput}
                      onChange={(e) => { setNameInput(e.target.value); if (nameError) setNameError(null); if (nameSuccess) setNameSuccess(null); }}
                            className="bg-white/60 dark:bg-white/5 border border-slate-200/60 dark:border-white/10 focus:border-[#5E7945]/50 focus:ring-[#5E7945]/20 backdrop-blur-sm transition-all duration-300"
                    />
                        </div>
                    <Button 
                      onClick={handleSaveName} 
                      disabled={savingName || !nameInput}
                          className="shrink-0 bg-gradient-to-r from-[#5E7945] to-[#7BA05B] hover:from-[#5E7945]/90 hover:to-[#7BA05B]/90 text-white shadow-[0_4px_16px_rgba(94,121,69,0.3)] hover:shadow-[0_6px_24px_rgba(94,121,69,0.4)] transition-all duration-300 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {savingName ? 'Saving...' : (username ? 'Update' : 'Save')}
                    </Button>
                  </div>
                      <p className="text-xs text-muted-foreground/60 mt-3">Use 3–32 letters, numbers, hyphen or underscore.</p>
                  {username && (
                        <p className="text-xs mt-2 text-[#5E7945]/80">Current: <span className="font-mono text-[#7BA05B]">{username}</span></p>
                  )}
                      {nameError && (<p className="text-xs text-red-400 mt-2 flex items-center gap-1"><span>⚠</span> {nameError}</p>)}
                      {nameSuccess && (<p className="text-xs text-[#7BA05B] mt-2 flex items-center gap-1"><span>✓</span> {nameSuccess}</p>)}
                </div>
                ) : null}
                {referralCode ? (
                  <>
                    {/* Referral Code Display */}
                        <div className="relative p-5 rounded-2xl bg-gradient-to-r from-[#5E7945]/10 via-[#7BA05B]/10 to-[#5E7945]/10 border border-[#5E7945]/20 backdrop-blur-sm shadow-[0_4px_16px_rgba(94,121,69,0.15),inset_0_1px_0_rgba(255,255,255,0.1)] overflow-hidden">
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-[shimmer_3s_ease-in-out_infinite]"></div>
                          <div className="relative flex items-center justify-between flex-wrap gap-4">
                        <div>
                              <p className="text-sm text-muted-foreground/70 mb-2 font-medium">Your Referral Code</p>
                              <p className="text-3xl md:text-4xl font-mono font-bold bg-gradient-to-r from-[#5E7945] to-[#7BA05B] bg-clip-text text-transparent drop-shadow-[0_0_20px_rgba(94,121,69,0.4)]">
                                {referralCode}
                              </p>
                        </div>
                            <Badge className="bg-gradient-to-r from-[#5E7945] to-[#7BA05B] text-white border-0 shadow-[0_4px_12px_rgba(94,121,69,0.3)] px-4 py-1.5">
                              <Sparkles className="h-3 w-3 mr-1.5" />
                          Active
                        </Badge>
                      </div>
                    </div>

                    {/* Referral Link Display */}
                        <div className="space-y-4">
                          <div className="relative p-5 rounded-2xl bg-white/[0.02] border border-white/5 backdrop-blur-sm shadow-[inset_0_2px_8px_rgba(0,0,0,0.1)]">
                            <p className="text-sm text-muted-foreground/80 mb-3 font-medium">Referral Link</p>
                            <div className="flex items-center gap-3 flex-wrap">
                              <code className="flex-1 min-w-0 text-sm bg-black/20 p-3 rounded-xl border border-white/5 break-all font-mono text-foreground/90 backdrop-blur-sm">
                            {generateReferralLink(referralCode)}
                          </code>
                          <Button
                            size="sm"
                            onClick={handleCopyLink}
                                className={`shrink-0 transition-all duration-300 hover:scale-105 ${
                                  copied 
                                    ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 shadow-[0_4px_16px_rgba(16,185,129,0.4)]' 
                                    : 'bg-gradient-to-r from-[#5E7945] to-[#7BA05B] hover:from-[#5E7945]/90 hover:to-[#7BA05B]/90 shadow-[0_4px_16px_rgba(94,121,69,0.3)]'
                                }`}
                          >
                                <Copy className="h-4 w-4 mr-1.5" />
                            {copied ? 'Copied!' : 'Copy'}
                          </Button>
                        </div>
                      </div>

                      {/* Action Buttons */}
                          <div className="flex gap-3 flex-wrap">
                        <Button 
                          onClick={handleShare} 
                              className="flex-1 min-w-[140px] bg-gradient-to-r from-[#5E7945] to-[#7BA05B] hover:from-[#5E7945]/90 hover:to-[#7BA05B]/90 text-white shadow-[0_4px_16px_rgba(94,121,69,0.3)] hover:shadow-[0_6px_24px_rgba(94,121,69,0.4)] transition-all duration-300 hover:scale-105"
                        >
                          <Share2 className="h-4 w-4 mr-2" />
                          Share Link
                        </Button>
                        <Button 
                          variant="outline" 
                          onClick={() => window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Join me on Peridot Finance — deposit ${formatUsd0.format(AMBASSADOR_PROGRAM.minDepositUsd)} on Stellar, keep it there ${AMBASSADOR_PROGRAM.holdDays} days, and we each earn ${formatUsd0.format(AMBASSADOR_PROGRAM.rewardUsd)}. `)}${encodeURIComponent(generateReferralLink(referralCode))}`, '_blank')}
                              className="border-white/10 hover:border-[#5E7945]/40 bg-white/5 hover:bg-white/10 backdrop-blur-sm transition-all duration-300 hover:scale-105"
                        >
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Tweet
                        </Button>
                      </div>
                    </div>
                  </>
                ) : (
                      <div className="text-center py-12">
                        <div className="inline-block relative">
                          <div className="absolute -inset-4 bg-gradient-to-r from-[#5E7945]/20 to-[#7BA05B]/20 rounded-full blur-2xl animate-pulse"></div>
                    <Button 
                      onClick={generateReferralCode} 
                      disabled={isLoading}
                      size="lg"
                            className="relative bg-gradient-to-r from-[#5E7945] to-[#7BA05B] hover:from-[#5E7945]/90 hover:to-[#7BA05B]/90 text-white shadow-[0_8px_32px_rgba(94,121,69,0.4)] hover:shadow-[0_12px_48px_rgba(94,121,69,0.5)] transition-all duration-300 hover:scale-105 disabled:opacity-50 px-8 py-6 text-lg"
                    >
                      {isLoading ? (
                        <>
                                <RefreshCw className="h-5 w-5 mr-2 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                                <Share2 className="h-5 w-5 mr-2" />
                          Generate Referral Code
                        </>
                      )}
                    </Button>
                        </div>
                    {error && (
                          <p className="text-red-400 text-sm mt-4 flex items-center justify-center gap-2">
                            <span>⚠</span> {error}
                          </p>
                    )}
                  </div>
                )}
              </CardContent>
                </div>
              </div>
            </div>
          </motion.div>


        </div>

        {/* Referred Users List */}
        {referredUsers.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="mt-10"
          >
            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-[#5E7945]/10 via-[#7BA05B]/10 to-[#5E7945]/10 dark:from-[#5E7945]/10 dark:via-[#7BA05B]/10 dark:to-[#5E7945]/10 rounded-3xl blur-xl opacity-30 dark:opacity-50"></div>
              <div className="relative backdrop-blur-2xl bg-white/80 dark:bg-white/[0.03] border border-white/30 dark:border-white/10 rounded-3xl shadow-[0_4px_16px_rgba(0,0,0,0.08)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.1)] overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-[#5E7945]/3 via-transparent to-[#7BA05B]/3 dark:from-[#5E7945]/5 dark:via-transparent dark:to-[#7BA05B]/5 opacity-50"></div>
                <div className="relative p-8">
                  <CardHeader className="pb-6">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <div className="absolute inset-0 bg-[#5E7945]/20 rounded-xl blur-lg"></div>
                        <div className="relative p-2 bg-gradient-to-br from-[#5E7945]/10 to-[#7BA05B]/10 rounded-xl border border-[#5E7945]/20">
                          <Users className="h-5 w-5 text-[#5E7945] drop-shadow-[0_0_8px_rgba(94,121,69,0.5)]" />
                        </div>
                      </div>
                      <div>
                        <CardTitle className="text-xl md:text-2xl font-bold text-foreground">
                  Referred Users ({referredUsers.length})
                </CardTitle>
                        <CardDescription className="text-muted-foreground/80 mt-1">
                  Everyone who joined through your link, and how close each one is
                  to the {formatUsd0.format(AMBASSADOR_PROGRAM.rewardUsd)} milestone
                </CardDescription>
                      </div>
                    </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                      {referredUsers.map((user, index) => {
                        const isExpanded = expandedUsers.has(user.walletAddress)
                        const txData = userTransactions[user.walletAddress]
                        return (
                          <Collapsible
                      key={index}
                            open={isExpanded}
                            onOpenChange={() => handleToggleUser(user.walletAddress)}
                          >
                            <motion.div
                              initial={{ opacity: 0, x: -20 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ duration: 0.5, delay: 0.5 + index * 0.1 }}
                              className="group/item"
                            >
                              <CollapsibleTrigger asChild>
                                <div className="flex items-center justify-between p-4 rounded-2xl border border-white/20 dark:border-white/10 bg-white/60 dark:bg-white/[0.02] backdrop-blur-sm shadow-[0_2px_8px_rgba(0,0,0,0.04)] dark:shadow-[inset_0_2px_8px_rgba(0,0,0,0.1)] hover:bg-white/80 dark:hover:bg-white/[0.05] hover:border-[#5E7945]/30 dark:hover:border-[#5E7945]/20 transition-all duration-300 hover:scale-[1.01] cursor-pointer">
                                  <div className="flex items-center gap-4 flex-1">
                                    <div className="relative">
                                      <div className="absolute inset-0 bg-gradient-to-r from-[#5E7945] to-[#7BA05B] rounded-full blur-md opacity-30"></div>
                                      <div className="relative w-10 h-10 rounded-full bg-gradient-to-r from-[#5E7945] to-[#7BA05B] flex items-center justify-center text-white text-sm font-bold shadow-[0_4px_12px_rgba(94,121,69,0.3)]">
                          {index + 1}
                        </div>
                                    </div>
                                    <div className="flex-1">
                                      <p className="font-mono text-sm font-medium text-foreground">
                            {`${user.walletAddress.slice(0, 6)}...${user.walletAddress.slice(-4)}`}
                          </p>
                                      <p className="text-xs text-muted-foreground/70 mt-0.5">
                            {new Date(user.referredAt).toLocaleDateString()}
                          </p>
                                      <div className="mt-2 max-w-xs">
                                        <MilestoneProgress progress={user.progress} rewardStatus={user.rewardStatus} />
                                      </div>
                        </div>
                      </div>
                                  <div className="flex items-center gap-3">
                                    <div className="flex items-center gap-1.5">
                                      <MilestoneBadge progress={user.progress} rewardStatus={user.rewardStatus} />
                                      {/* Kept as a quiet secondary signal: "has
                                          transacted at least once" no longer earns
                                          anything, but it still tells the referrer
                                          the invitee actually showed up. */}
                                      {user.isVerified && !user.progress?.qualified && (
                                        <div className="relative inline-block">
                                          <input type="checkbox" id={`verified-tooltip-user-${index}`} className="peer hidden" />
                                          <label htmlFor={`verified-tooltip-user-${index}`} className="cursor-pointer">
                                            <Award className="h-3.5 w-3.5 text-[#5E7945]/70 hover:text-[#5E7945] transition-colors" />
                                          </label>
                                          <div className="absolute right-0 bottom-full mb-2 w-64 p-3 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-white/20 dark:border-white/10 rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.2)] opacity-0 invisible peer-checked:opacity-100 peer-checked:visible transition-all duration-200 z-50 pointer-events-none">
                                            <p className="text-xs text-foreground leading-relaxed">
                                              This friend has made at least one transaction with
                                              Peridot on chain. The{' '}
                                              {formatUsd0.format(AMBASSADOR_PROGRAM.rewardUsd)}{' '}
                                              reward needs the deposit milestone above, not just
                                              activity.
                                            </p>
                                            <div className="absolute right-4 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-white/95 dark:border-t-slate-900/95"></div>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                    <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                                  </div>
                                </div>
                              </CollapsibleTrigger>
                              <CollapsibleContent className="mt-2">
                                <div className="relative p-4 rounded-2xl border border-white/5 dark:border-white/10 bg-white/[0.03] dark:bg-white/[0.03] backdrop-blur-sm shadow-[inset_0_2px_8px_rgba(0,0,0,0.05)] dark:shadow-[inset_0_2px_8px_rgba(0,0,0,0.1)] overflow-hidden">
                                  <div className="absolute inset-0 bg-gradient-to-br from-[#5E7945]/5 via-transparent to-[#7BA05B]/5 opacity-50"></div>
                                  <div className="relative">
                                    <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                                      <Info className="h-4 w-4 text-[#5E7945]" />
                                      Recent Activity
                                    </h4>
                                    {txData?.loading ? (
                                      <div className="space-y-3">
                                        {Array.from({ length: 3 }).map((_, i) => (
                                          <div key={i} className="relative p-3 rounded-xl border border-white/10 dark:border-white/10 bg-white/40 dark:bg-white/[0.04] backdrop-blur-sm overflow-hidden">
                                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent dark:via-white/5 animate-[shimmer_2s_ease-in-out_infinite]"></div>
                                            <div className="relative flex items-start justify-between gap-3">
                                              <div className="flex-1 space-y-2">
                                                <div className="flex items-center gap-2">
                                                  <div className="h-5 w-16 rounded bg-white/60 dark:bg-white/10 animate-pulse"></div>
                                                  <div className="h-4 w-12 rounded bg-white/60 dark:bg-white/10 animate-pulse"></div>
                                                </div>
                                                <div className="h-3 w-48 rounded bg-white/60 dark:bg-white/10 animate-pulse"></div>
                                                <div className="flex items-center gap-2">
                                                  <div className="h-3 w-20 rounded bg-white/60 dark:bg-white/10 animate-pulse"></div>
                                                  <div className="h-3 w-16 rounded bg-white/60 dark:bg-white/10 animate-pulse"></div>
                                                  <div className="h-3 w-16 rounded bg-white/60 dark:bg-white/10 animate-pulse"></div>
                                                </div>
                                              </div>
                                              <div className="flex items-center gap-2">
                                                <div className="h-8 w-12 rounded bg-white/60 dark:bg-white/10 animate-pulse"></div>
                                                <div className="h-7 w-7 rounded-full bg-white/60 dark:bg-white/10 animate-pulse"></div>
                                              </div>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    ) : txData?.transactions && txData.transactions.length > 0 ? (
                                      <div className="space-y-2 max-h-[400px] overflow-y-auto">
                                        {txData.transactions.map((tx, txIndex) => {
                                          const explorerUrl = getExplorerTxUrl(tx.chain_id, tx.tx_hash)
                                          return (
                                            <motion.div
                                              key={tx.tx_hash}
                                              initial={{ opacity: 0, y: 10 }}
                                              animate={{ opacity: 1, y: 0 }}
                                              transition={{ duration: 0.3, delay: txIndex * 0.05 }}
                                              className="group/tx relative p-3 rounded-xl border border-white/20 dark:border-white/10 bg-white/70 dark:bg-white/[0.04] backdrop-blur-sm hover:bg-white/90 dark:hover:bg-white/[0.06] hover:border-[#5E7945]/30 dark:hover:border-[#5E7945]/20 transition-all duration-300"
                                            >
                                              <div className="flex items-start justify-between gap-3">
                                                <div className="flex-1 min-w-0">
                                                  <div className="flex items-center gap-2 mb-1">
                                                    <Badge variant="outline" className="text-[10px] border-[#5E7945]/30 text-[#5E7945] bg-[#5E7945]/10">
                                                      {getActionDisplayName(tx.action_type)}
                      </Badge>
                                                    <span className="text-xs font-medium text-foreground">{tx.token_symbol}</span>
                                                  </div>
                                                  <p className="text-xs text-muted-foreground/70 font-mono truncate mb-1">
                                                    {tx.tx_hash}
                                                  </p>
                                                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground/60">
                                                    <span>{formatUSD.format(Number(tx.usd_value || 0))}</span>
                                                    <span>•</span>
                                                    <span>{getChainName(tx.chain_id)}</span>
                                                    <span>•</span>
                                                    <span>{new Date(tx.verified_at).toLocaleDateString()}</span>
                                                  </div>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                  <div className="text-right">
                                                    <p className="text-xs font-bold text-[#5E7945]">+{tx.points_awarded}</p>
                                                    <p className="text-[10px] text-muted-foreground/60">pts</p>
                                                  </div>
                                                  <div className="flex gap-1 ml-2">
                                                    <Button
                                                      variant="ghost"
                                                      size="sm"
                                                      className="h-7 w-7 p-0 rounded-full hover:bg-[#5E7945]/10"
                                                      onClick={(e) => {
                                                        e.stopPropagation()
                                                        handleCopy(tx.tx_hash)
                                                      }}
                                                    >
                                                      <Copy className="h-3 w-3" />
                                                    </Button>
                                                    {explorerUrl && (
                                                      <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-7 w-7 p-0 rounded-full hover:bg-[#5E7945]/10"
                                                        asChild
                                                      >
                                                        <a href={explorerUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                                                          <ExternalLink className="h-3 w-3" />
                                                        </a>
                                                      </Button>
                                                    )}
                                                  </div>
                                                </div>
                                              </div>
                                            </motion.div>
                                          )
                                        })}
                                      </div>
                                    ) : (
                                      <div className="text-center py-6 text-sm text-muted-foreground/70">
                                        No transactions found yet
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </CollapsibleContent>
                            </motion.div>
                          </Collapsible>
                        )
                      })}
                    </div>
                  </CardContent>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* CSS Animations */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes float {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(30px, -30px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
        }
        @keyframes shimmer {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 0.5; transform: scale(1); }
          50% { opacity: 0.8; transform: scale(1.05); }
        }
      `}} />
    </div>
  )
} 