"use client"

import React, { useEffect, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useAccount } from "wagmi"
import { useAppKitAccount } from "@reown/appkit/react"
import { useWallets, usePrivy } from "@privy-io/react-auth"
import { CyberCard } from "@/components/baseline/CyberCard"
import { CyberButton } from "@/components/baseline/CyberButton"
import { NumberTicker } from "@/components/baseline/NumberTicker"
import { toast } from "sonner"
import { 
  Trophy, 
  Zap, 
  Clock, 
  ShieldCheck,
  ArrowUpRight, 
  Wallet, 
  TrendingUp, 
  BarChart3,
  Award,
  AlertCircle,
  Copy,
  Check
} from "lucide-react"
import { cn } from "@/lib/utils"

interface Trader {
  address: string
  volume: number
  reward: number
  holdTime: string
  rank: number
}

interface GlobalStats {
  totalVolume: number
  totalPayout: number
  remainingPayout: number
  participantCount: number
  capAmount: number
  rewardRate: number
  volumeThreshold: number
  holdThreshold: number
}

interface UserStats {
  volume: number
  reward: number
}

export default function TradingChallengeDashboard() {
  // AppKit / Wagmi hooks
  const { address: wagmiAddress, isConnected: isWagmiConnected } = useAccount()
  const { address: appKitSolanaAddress, isConnected: isAppKitConnected, allAccounts } = useAppKitAccount({ namespace: 'solana' })
  const { address: defaultAppKitAddress } = useAppKitAccount()
  
  // Privy hooks
  const { authenticated } = usePrivy()
  const { wallets } = useWallets()
  
  const solanaAddressRegex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/
  
  let solanaAddressToUse = appKitSolanaAddress
  
  // 1. Check AppKit accounts
  if (!solanaAddressToUse && allAccounts && allAccounts.length > 0) {
    const foundSolanaAccount = allAccounts.find(acc => solanaAddressRegex.test(acc.address))
    if (foundSolanaAccount) {
      solanaAddressToUse = foundSolanaAccount.address
    }
  }
  
  // 2. Check Privy wallets for a Solana address
  if (!solanaAddressToUse && wallets && wallets.length > 0) {
    // Privy wallets typically expose chainType === 'solana', but regex is safest fallback
    const privySolanaWallet = wallets.find(w => 
      w.chainType === 'solana' || solanaAddressRegex.test(w.address)
    )
    if (privySolanaWallet) {
      solanaAddressToUse = privySolanaWallet.address
    }
  }
  
  // Fallback to active address if it happens to be valid Solana format (e.g. connected via raw Solana wallet adapter)
  const activeAddress = solanaAddressToUse || (defaultAppKitAddress && solanaAddressRegex.test(defaultAppKitAddress) ? defaultAppKitAddress : null) || wagmiAddress
  const isConnected = isAppKitConnected || isWagmiConnected || authenticated
  
  const isSolanaAddress = activeAddress ? solanaAddressRegex.test(activeAddress) : false

  const [traders, setTraders] = useState<Trader[]>([])
  const [stats, setStats] = useState<GlobalStats | null>(null)
  const [userStats, setUserStats] = useState<UserStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null)
  const [isJoining, setIsJoining] = useState(false)
  const [hasJoined, setHasJoined] = useState(false)

  const [showManualInput, setShowManualInput] = useState(false)
  const [manualAddress, setManualAddress] = useState('')
  const [linkedSolanaAddress, setLinkedSolanaAddress] = useState<string | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)
  // Ensures the page-load sync fires at most once per session per wallet address
  const sessionSyncedRef = useRef<string | null>(null)

  // On mount, check if this EVM user previously linked a Solana address in localStorage
  useEffect(() => {
    if (activeAddress && !isSolanaAddress) {
      const saved = localStorage.getItem(`linkedSolanaAddress_${activeAddress}`)
      if (saved) setLinkedSolanaAddress(saved)
    }
  }, [activeAddress, isSolanaAddress])

  // Check if current user (or their linked address) is already in the traders list
  useEffect(() => {
    const addressToCheck = isSolanaAddress ? activeAddress : linkedSolanaAddress
    if (addressToCheck && traders.some(t => t.address.toLowerCase() === addressToCheck.toLowerCase())) {
      setHasJoined(true)
    }
  }, [activeAddress, linkedSolanaAddress, isSolanaAddress, traders])

  const handleJoinChallenge = async (submittedAddress?: string) => {
    const targetAddress = typeof submittedAddress === 'string' ? submittedAddress : activeAddress
    if (!targetAddress) return
    
    // If auto-joining but the active address is EVM, prompt manual input instead
    if (!isSolanaAddress && targetAddress === activeAddress) {
      setShowManualInput(true)
      return
    }

    if (!solanaAddressRegex.test(targetAddress)) {
      toast.error("Invalid format", { description: "Please enter a valid Solana wallet address." })
      return
    }

    setIsJoining(true)
    try {
      const res = await fetch('/api/trading-challenge/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: targetAddress })
      })
      const payload = await res.json().catch(() => null)

      if (res.ok) {
        setHasJoined(true)
        setShowManualInput(false)
        // If they manually linked, save it so we remember on reload
        if (!isSolanaAddress) {
          setLinkedSolanaAddress(targetAddress)
          localStorage.setItem(`linkedSolanaAddress_${activeAddress}`, targetAddress)
        }
        toast.success("Successfully Registered", { description: payload?.message || "Your wallet is now tracking volume for the challenge!" })
        // Server kicked off a background sync — poll until we get fresh stats
        pollUserStats(targetAddress)
      } else if (res.status === 409 && payload?.code === 'ALREADY_JOINED') {
        setHasJoined(true)
        setShowManualInput(false)
        if (!isSolanaAddress) {
          setLinkedSolanaAddress(targetAddress)
          localStorage.setItem(`linkedSolanaAddress_${activeAddress}`, targetAddress)
        }
        toast.info("Already Registered", { description: payload?.error || "This wallet already joined the challenge." })
      } else {
        toast.error("Registration Failed", { description: payload?.error || "Request failed." })
      }
    } catch (err) {
      console.error("Failed to join challenge:", err)
      toast.error("Network Error", { description: "Failed to connect to the server." })
    } finally {
      setIsJoining(false)
    }
  }

  // Poll the user stats endpoint until a non-zero volume appears (background sync completed)
  // or until maxAttempts is reached.
  const pollUserStats = async (address: string, maxAttempts = 8, intervalMs = 4000) => {
    setIsSyncing(true)
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(r => setTimeout(r, intervalMs))
      try {
        const res = await fetch(`/api/trading-challenge/user?wallet=${address}`)
        const json = await res.json()
        if (json.success && json.data) {
          const vol = Number(json.data.totalVolume || json.data.volume || 0)
          setUserStats({ volume: vol, reward: Number(json.data.pendingRewards || 0) })
          if (vol > 0) break   // got real data — stop polling
        }
      } catch { /* keep polling */ }
    }
    setIsSyncing(false)
  }

  const shortenAddress = (address: string) => {
    if (address.length <= 10) return address
    return `${address.slice(0, 5)}...${address.slice(-5)}`
  }

  const copyToClipboard = async (address: string) => {
    try {
      await navigator.clipboard.writeText(address)
      setCopiedAddress(address)
      setTimeout(() => setCopiedAddress(null), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  useEffect(() => {
    const fetchData = async () => {
      try {
        const addressToQuery = isSolanaAddress ? activeAddress : linkedSolanaAddress

        const url = addressToQuery
          ? `/api/trading-challenge?address=${addressToQuery}`
          : `/api/trading-challenge`

        const response = await fetch(url)
        const json = await response.json()
        if (json.success) {
          setTraders(json.data.traders)
          setStats(json.data.stats)

          if (json.data.userStats) {
            setUserStats(json.data.userStats)
          }

          // If the user is already registered and we haven't synced yet this session,
          // trigger exactly one sync so their stats are fresh on page load.
          const isRegistered = Boolean(json.data.userStats)
          if (addressToQuery && isRegistered && sessionSyncedRef.current !== addressToQuery) {
            sessionSyncedRef.current = addressToQuery
            fetch('/api/trading-challenge/sync', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ wallet: addressToQuery }),
            })
              .then(r => r.json())
              .then(syncJson => {
                if (syncJson?.data?.eligibleVolume !== undefined) {
                  setUserStats(prev => prev
                    ? { ...prev, volume: syncJson.data.eligibleVolume }
                    : prev
                  )
                }
              })
              .catch(() => {/* non-critical */})
          }
        }
      } catch (error) {
        console.error("Failed to fetch challenge data:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [activeAddress, isSolanaAddress, linkedSolanaAddress])

  const springTransition = {
    type: "spring",
    stiffness: 100,
    damping: 15,
  } as const

  const progressPercent = stats ? (stats.totalPayout / stats.capAmount) * 100 : 0

  return (
    <div className="min-h-screen p-3 sm:p-4 md:p-8 font-inter text-foreground dark:text-cyber-text-primary relative overflow-hidden cyber-elegant">
      {/* Decorative Blobs - matching the leaderboard/portfolio style */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-cyber-accent-primary/5 blur-[120px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-cyber-accent-secondary/5 blur-[120px] rounded-full animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      <div className="mx-auto max-w-7xl space-y-4 md:space-y-8 relative z-10">
        {/* Header Section */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={springTransition}
        >
          <div 
            className="cyber-card overflow-hidden p-4 md:p-6 lg:p-10 relative"
            style={{
              backgroundImage: 'radial-gradient(60rem 40rem at 10% 10%, var(--glow-primary), transparent), radial-gradient(50rem 40rem at 90% 100%, var(--glow-secondary), transparent)'
            }}
          >
            {/* Floating accent blobs */}
            <motion.div 
              aria-hidden 
              className="absolute -top-12 -left-12 h-32 w-32 rounded-full bg-cyber-accent-primary/10 blur-3xl"
              animate={{ 
                opacity: [0.3, 0.5, 0.3],
                scale: [1, 1.1, 1]
              }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.div 
              aria-hidden 
              className="absolute -bottom-12 -right-12 h-40 w-40 rounded-full bg-cyber-accent-secondary/10 blur-3xl"
              animate={{ 
                opacity: [0.2, 0.4, 0.2],
                scale: [1, 1.15, 1]
              }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
            />

            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4 md:gap-6">
              <div className="flex items-center gap-3 md:gap-4">
                <div className="relative">
                  <div className="h-12 w-12 md:h-16 md:w-16 lg:h-20 lg:w-20 rounded-full bg-gradient-to-br from-white/90 to-white/60 dark:from-slate-900 dark:to-black flex items-center justify-center shadow-inner border border-white/20 dark:border-white/10">
                    <div className="h-10 w-10 md:h-12 md:w-12 lg:h-16 lg:w-16 rounded-full bg-white/80 dark:bg-black/60 backdrop-blur-md flex items-center justify-center border border-white/30 dark:border-white/10">
                      <Trophy className="h-5 w-5 md:h-6 md:w-6 lg:h-8 lg:w-8 text-cyber-accent-primary" />
                    </div>
                  </div>
                  <motion.div 
                    aria-hidden 
                    className="absolute -bottom-1 -right-1 h-6 w-6 md:h-8 md:w-8 rounded-full bg-cyber-accent-primary/40 blur-md"
                    animate={{ 
                      opacity: [0.4, 0.6, 0.4],
                      scale: [1, 1.2, 1]
                    }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  />
                </div>
                <div>
                  <h1 className="text-xl md:text-3xl lg:text-4xl xl:text-5xl font-black tracking-tight">
                    <span className="bg-gradient-to-r from-cyber-accent-primary via-cyber-accent-secondary to-cyber-accent-primary bg-[length:200%_auto] animate-marquee bg-clip-text text-transparent">
                      Peridot TRADING
                    </span>
                    <br />
                    <span className="text-cyber-text-primary">CHALLENGE</span>
                  </h1>
                  <p className="text-cyber-text-secondary mt-1 md:mt-2 flex items-center gap-1.5 md:gap-2 text-xs md:text-sm font-medium">
                    <Zap className="h-3 w-3 md:h-4 md:w-4 text-cyber-accent-primary" />
                    <span className="hidden sm:inline">Maximize volume on Solana to earn exclusive rewards</span>
                    <span className="sm:hidden">Earn rewards on Solana</span>
                  </p>
                </div>
              </div>
              
              {/* Join Challenge Button */}
              {isConnected && (
                <div className="flex w-full sm:w-auto flex-col items-stretch md:items-end mt-3 md:mt-0">
                  {showManualInput ? (
                    <div className="flex flex-col items-stretch md:items-end gap-2 w-full md:max-w-sm">
                      <div className="flex w-full flex-col sm:flex-row items-stretch sm:items-center gap-2">
                        <input
                          type="text"
                          placeholder="Paste Solana Address..."
                          className="flex h-10 w-full rounded-md border border-cyber-bg-hover bg-cyber-bg-main/50 px-3 py-2 text-sm text-cyber-text-primary placeholder:text-cyber-text-tertiary focus:outline-none focus:ring-1 focus:ring-cyber-accent-primary"
                          value={manualAddress}
                          onChange={(e) => setManualAddress(e.target.value)}
                        />
                        <CyberButton
                          onClick={() => handleJoinChallenge(manualAddress)}
                          disabled={isJoining || !manualAddress}
                          className="w-full sm:w-auto justify-center px-4 py-2 text-xs sm:text-sm font-black tracking-widest text-black bg-cyber-accent-primary hover:bg-cyber-accent-primary/90"
                        >
                          {isJoining ? <Zap className="h-4 w-4 animate-spin" /> : 'SUBMIT'}
                        </CyberButton>
                      </div>
                      <button
                        onClick={() => setShowManualInput(false)}
                        className="self-start sm:self-end text-[10px] text-cyber-text-tertiary hover:text-cyber-text-primary uppercase tracking-widest"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <CyberButton 
                        onClick={() => handleJoinChallenge()}
                        disabled={hasJoined || isJoining}
                        className={cn(
                          "w-full sm:w-auto justify-center px-4 sm:px-6 py-2.5 sm:py-3 text-xs sm:text-sm font-black tracking-widest uppercase transition-all duration-300 relative overflow-hidden group",
                          hasJoined 
                            ? "bg-cyber-success/10 text-cyber-success border-cyber-success/30 cursor-not-allowed" 
                            : "bg-cyber-accent-primary hover:bg-cyber-accent-primary/90 text-black hover:shadow-[0_0_20px_var(--glow-primary)]"
                        )}
                      >
                        {isJoining ? (
                          <span className="flex items-center gap-2">
                            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
                              <Zap className="h-4 w-4" />
                            </motion.div>
                            JOINING...
                          </span>
                        ) : hasJoined ? (
                          <span className="flex items-center gap-2">
                            <Check className="h-4 w-4" />
                            REGISTERED
                          </span>
                        ) : (
                          <span className="flex items-center gap-2">
                            JOIN CHALLENGE <ArrowUpRight className="h-4 w-4 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                          </span>
                        )}
                      </CyberButton>
                      {!hasJoined && (
                        <div className="mt-2 inline-flex flex-col text-left sm:text-right">
                          <span className="text-[10px] text-cyber-text-tertiary font-bold uppercase tracking-[0.1em]">
                            {isSolanaAddress ? "Register wallet to track volume" : "Link a Solana address"}
                          </span>
                          {!isSolanaAddress && (
                            <span className="text-[10px] text-cyber-text-primary font-mono break-all">
                              CA: Aeved5aegp2AKNAdwBPAwmPuLT8qL4YNYk1e1dWHpump
                            </span>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </motion.div>

        {/* Hero Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 md:gap-6">
          {[
            {
              label: "Your Total Volume",
              value: userStats?.volume || 0,
              prefix: "$",
              icon: TrendingUp,
              color: "text-cyber-accent-primary"
            },
            {
              label: "Pending Rewards",
              value: userStats?.reward || 0,
              prefix: "$",
              icon: Award,
              color: "text-cyber-success"
            },            { 
              label: "Total Participants", 
              value: stats?.participantCount || 0, 
              icon: Wallet,
              color: "text-cyber-accent-secondary"
            },
            { 
              label: "Total Challenge Volume", 
              value: stats?.totalVolume || 0, 
              prefix: "$", 
              icon: BarChart3,
              color: "text-cyber-text-primary"
            }
          ].map((item, idx) => (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...springTransition, delay: idx * 0.1 }}
              whileHover={{ y: -5 }}
            >
              <CyberCard className="p-3 sm:p-4 md:p-6 lg:p-8 flex flex-col h-full group relative overflow-hidden">
                {/* Subtle gradient overlay on hover */}
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                  style={{
                    background: `radial-gradient(circle at 50% 50%, ${item.color === 'text-cyber-accent-primary' ? 'rgba(16, 185, 129, 0.05)' : item.color === 'text-cyber-success' ? 'rgba(16, 185, 129, 0.05)' : item.color === 'text-cyber-accent-secondary' ? 'rgba(99, 102, 241, 0.05)' : 'rgba(0, 0, 0, 0.02)'}, transparent 70%)`
                  }}
                />
                
                <div className="relative z-10 flex items-start justify-between mb-2 sm:mb-3 md:mb-6">
                  <div className={cn(
                    "p-1.5 sm:p-2 md:p-3 rounded-lg sm:rounded-xl md:rounded-2xl transition-all duration-300 group-hover:scale-110",
                    item.color === 'text-cyber-accent-primary' ? "bg-cyber-accent-primary/10 group-hover:bg-cyber-accent-primary/20" :
                    item.color === 'text-cyber-success' ? "bg-cyber-success/10 group-hover:bg-cyber-success/20" :
                    item.color === 'text-cyber-accent-secondary' ? "bg-cyber-accent-secondary/10 group-hover:bg-cyber-accent-secondary/20" :
                    "bg-cyber-bg-hover/50 group-hover:bg-cyber-bg-hover"
                  )}>
                    <item.icon className={cn("h-3.5 w-3.5 sm:h-4 sm:w-4 md:h-5 md:w-5 lg:h-6 lg:w-6", item.color)} />
                  </div>
                  <div className="text-right flex-1 ml-2 sm:ml-3 md:ml-4 min-w-0">
                    <p className="text-[8px] sm:text-[9px] md:text-[10px] font-black text-cyber-text-tertiary uppercase tracking-[0.12em] sm:tracking-[0.15em] leading-tight mb-1 sm:mb-1.5 md:mb-2 truncate">{item.label}</p>
                    <div className="text-xs sm:text-base md:text-xl lg:text-base xl:text-lg 2xl:text-xl font-black tracking-tight md:tracking-tighter text-cyber-text-primary leading-none">
                      {loading ? (
                        <span className="opacity-50 animate-pulse">{item.prefix || ''}0</span>
                      ) : isSyncing && (item.label === "Your Total Volume" || item.label === "Pending Rewards") ? (
                        <span className="opacity-60 animate-pulse text-cyber-accent-primary">syncing…</span>
                      ) : (
                        <NumberTicker value={item.value} prefix={item.prefix} />
                      )}
                    </div>
                  </div>
                </div>
                <div className="hidden sm:flex mt-auto pt-3 md:pt-4 border-t border-cyber-bg-hover/30 items-center justify-between text-[8px] md:text-[10px] font-bold text-cyber-text-tertiary uppercase tracking-widest relative z-10">
                  <span>Live</span>
                  <div className="flex items-center gap-1 md:gap-1.5">
                    <div className="h-1 w-1 md:h-1.5 md:w-1.5 rounded-full bg-cyber-success animate-pulse" />
                    <span className="text-[7px] md:text-[9px] hidden sm:inline">Real-time</span>
                  </div>
                </div>
              </CyberCard>
            </motion.div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-8">
          {/* Challenge Rules & Cap */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={springTransition}
            className="lg:col-span-1 space-y-6"
          >
            <CyberCard className="p-4 md:p-8 space-y-3 md:space-y-6 relative overflow-hidden">
              {/* Background gradient */}
              <div className="absolute inset-0 opacity-20 pointer-events-none"
                style={{
                  background: 'radial-gradient(circle at 30% 20%, var(--glow-primary), transparent 60%)'
                }}
              />
              
              <div className="relative z-10">
                <div className="flex items-center gap-2 md:gap-3 mb-4 md:mb-6">
                  <div className="p-2 md:p-2.5 rounded-lg md:rounded-xl bg-cyber-success/10 border border-cyber-success/20">
                    <ShieldCheck className="h-4 w-4 md:h-5 md:w-5 text-cyber-success" />
                  </div>
                  <div>
                    <h2 className="text-base md:text-xl font-black tracking-tight">Challenge Rules</h2>
                    <p className="text-[9px] md:text-[10px] text-cyber-text-tertiary uppercase tracking-widest font-bold mt-0.5">How to Win</p>
                  </div>
                </div>
                
                <div className="space-y-2 md:space-y-4">
                  <motion.div 
                    className="flex items-start gap-2 md:gap-4 p-3 md:p-4 rounded-xl md:rounded-2xl bg-cyber-accent-primary/5 border border-cyber-accent-primary/20 hover:bg-cyber-accent-primary/10 hover:border-cyber-accent-primary/30 transition-all duration-300 group"
                    whileHover={{ scale: 1.02 }}
                  >
                    <div className="mt-0.5 bg-gradient-to-br from-cyber-accent-primary/20 to-cyber-accent-primary/10 p-2 md:p-2.5 rounded-lg md:rounded-xl text-cyber-accent-primary shadow-inner group-hover:scale-110 transition-transform duration-300">
                      <Zap className="h-4 w-4 md:h-5 md:w-5" />
                    </div>
                    <div className="flex-1">
                      <p className="font-black text-cyber-text-primary text-xs md:text-sm leading-tight mb-0.5 md:mb-1">$1 Reward for every $500 Volume</p>
                      <p className="text-[10px] md:text-[11px] text-cyber-text-secondary font-medium leading-relaxed">Combined buy and sell orders on our Solana token.</p>
                    </div>
                  </motion.div>

                  <motion.div 
                    className="flex items-start gap-2 md:gap-4 p-3 md:p-4 rounded-xl md:rounded-2xl bg-cyber-accent-secondary/5 border border-cyber-accent-secondary/20 hover:bg-cyber-accent-secondary/10 hover:border-cyber-accent-secondary/30 transition-all duration-300 group"
                    whileHover={{ scale: 1.02 }}
                  >
                    <div className="mt-0.5 bg-gradient-to-br from-cyber-accent-secondary/20 to-cyber-accent-secondary/10 p-2 md:p-2.5 rounded-lg md:rounded-xl text-cyber-accent-secondary shadow-inner group-hover:scale-110 transition-transform duration-300">
                      <Clock className="h-4 w-4 md:h-5 md:w-5" />
                    </div>
                    <div className="flex-1">
                      <p className="font-black text-cyber-text-primary text-xs md:text-sm leading-tight mb-0.5 md:mb-1">3 Hour Minimum Hold</p>
                      <p className="text-[10px] md:text-[11px] text-cyber-text-secondary font-medium leading-relaxed">Assets must be held for at least 3 hours post-purchase.</p>
                    </div>
                  </motion.div>

                  <motion.div 
                    className="flex items-start gap-2 md:gap-4 p-3 md:p-4 rounded-xl md:rounded-2xl bg-cyber-warning/5 border border-cyber-warning/20 hover:bg-cyber-warning/10 hover:border-cyber-warning/30 transition-all duration-300 group"
                    whileHover={{ scale: 1.02 }}
                  >
                    <div className="mt-0.5 bg-gradient-to-br from-cyber-warning/20 to-cyber-warning/10 p-2 md:p-2.5 rounded-lg md:rounded-xl text-cyber-warning shadow-inner group-hover:scale-110 transition-transform duration-300">
                      <AlertCircle className="h-4 w-4 md:h-5 md:w-5" />
                    </div>
                    <div className="flex-1">
                      <p className="font-black text-cyber-text-primary text-xs md:text-sm leading-tight mb-0.5 md:mb-1">Payout Cap</p>
                      <p className="text-[10px] md:text-[11px] text-cyber-text-secondary font-medium leading-relaxed">Total challenge payout is capped at $10,000 USD.</p>
                    </div>
                  </motion.div>
                </div>

                <div className="pt-4 md:pt-6 mt-4 md:mt-6 border-t border-cyber-bg-hover/40">
                  <div className="flex justify-between items-end mb-3 md:mb-4">
                    <div>
                      <p className="text-[9px] md:text-[10px] text-cyber-text-tertiary uppercase tracking-[0.2em] font-black mb-0.5 md:mb-1">Reward Pool</p>
                      <p className="text-xs md:text-sm font-black text-cyber-text-secondary">Payout Progress</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg md:text-2xl font-black text-cyber-accent-primary leading-none flex justify-end">
                        {loading ? (
                          <span className="opacity-50 animate-pulse">$0</span>
                        ) : (
                          <NumberTicker value={stats?.totalPayout || 0} prefix="$" />
                        )}
                      </p>
                      <p className="text-[9px] md:text-[10px] text-cyber-text-tertiary font-black uppercase tracking-widest mt-0.5 md:mt-1">/ $10,000 CAP</p>
                    </div>
                  </div>
                  <div className="h-4 md:h-5 w-full bg-cyber-bg-hover/50 rounded-full overflow-hidden p-0.5 border border-cyber-bg-hover/50 relative">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${progressPercent}%` }}
                      transition={{ duration: 2, ease: "circOut" }}
                      className="h-full rounded-full bg-gradient-to-r from-cyber-accent-primary via-cyber-accent-secondary to-cyber-accent-primary bg-[length:200%_auto] animate-marquee relative overflow-hidden"
                      style={{ boxShadow: '0 0 16px var(--glow-primary), inset 0 1px 0 rgba(255,255,255,0.1)' }}
                    >
                      {/* Shimmer effect */}
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
                    </motion.div>
                  </div>
                  <div className="flex justify-between items-center mt-1.5 md:mt-2 text-[8px] md:text-[10px] text-cyber-text-tertiary font-bold uppercase tracking-widest">
                    <span>{progressPercent.toFixed(1)}% Complete</span>
                    <span className="hidden sm:inline">${stats?.remainingPayout || 0} Remaining</span>
                    <span className="sm:hidden">${(stats?.remainingPayout || 0).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </CyberCard>
          </motion.div>

          {/* Leaderboard */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={springTransition}
            className="lg:col-span-2"
          >
            <CyberCard className="p-4 md:p-8 h-full relative overflow-hidden">
              {/* Subtle background gradient */}
              <div className="absolute inset-0 opacity-30 pointer-events-none"
                style={{
                  background: 'radial-gradient(circle at 20% 30%, var(--glow-primary), transparent 50%), radial-gradient(circle at 80% 70%, var(--glow-secondary), transparent 50%)'
                }}
              />
              
              <div className="relative z-10">
                <div className="flex items-center justify-between gap-3 mb-4 md:mb-8 pb-3 md:pb-4 border-b border-cyber-bg-hover/30">
                  <div className="flex items-center gap-2 md:gap-3">
                    <div className="p-2 md:p-2.5 rounded-lg md:rounded-xl bg-cyber-warning/10 border border-cyber-warning/20">
                      <Trophy className="h-4 w-4 md:h-5 md:w-5 text-cyber-warning" />
                    </div>
                    <div>
                      <h2 className="text-base md:text-xl font-black tracking-tight">Top Challengers</h2>
                      <p className="text-[9px] md:text-[10px] text-cyber-text-tertiary uppercase tracking-widest font-bold mt-0.5">Leaderboard</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 md:gap-2">
                    <div className="h-1.5 w-1.5 md:h-2 md:w-2 rounded-full bg-cyber-success animate-pulse" />
                    <span className="text-[8px] md:text-[10px] text-cyber-accent-primary font-black uppercase tracking-widest px-2 md:px-3 py-1 md:py-1.5 border border-cyber-accent-primary/30 rounded-full bg-cyber-accent-primary/5">
                      Live
                    </span>
                  </div>
                </div>

                <div className="md:hidden space-y-2">
                  <AnimatePresence>
                    {loading ? (
                      [...Array(5)].map((_, idx) => (
                        <motion.div
                          key={`mobile-skeleton-${idx}`}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="rounded-xl border border-cyber-bg-hover/30 bg-cyber-bg-card/30 p-3"
                        >
                          <div className="h-4 w-24 rounded bg-cyber-bg-hover/40 animate-pulse" />
                          <div className="mt-3 grid grid-cols-3 gap-2">
                            <div className="h-10 rounded-lg bg-cyber-bg-hover/40 animate-pulse" />
                            <div className="h-10 rounded-lg bg-cyber-bg-hover/40 animate-pulse" />
                            <div className="h-10 rounded-lg bg-cyber-bg-hover/40 animate-pulse" />
                          </div>
                        </motion.div>
                      ))
                    ) : traders.length > 0 ? (
                      traders.map((trader, idx) => (
                        <motion.div
                          key={`mobile-${trader.address}`}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.05 }}
                          className="rounded-xl border border-cyber-bg-hover/30 bg-cyber-bg-card/30 p-3"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className={cn(
                                  "inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-black shadow-lg ring-2",
                                  trader.rank === 1
                                    ? "bg-gradient-to-br from-yellow-300 via-yellow-400 to-amber-500 text-amber-950 ring-yellow-400/30 shadow-yellow-400/20"
                                    : trader.rank === 2
                                      ? "bg-gradient-to-br from-slate-200 via-slate-300 to-slate-400 text-slate-900 ring-slate-300/30 shadow-slate-300/20"
                                      : trader.rank === 3
                                        ? "bg-gradient-to-br from-orange-300 via-orange-400 to-orange-600 text-orange-950 ring-orange-400/30 shadow-orange-400/20"
                                        : "bg-cyber-bg-hover text-cyber-text-secondary ring-cyber-bg-hover/50"
                                )}
                              >
                                {trader.rank}
                              </span>
                              <button
                                onClick={() => copyToClipboard(trader.address)}
                                className="min-w-0 font-mono text-xs font-black tracking-tight text-cyber-text-primary flex items-center gap-1"
                                title={trader.address}
                              >
                                <span className="truncate">{shortenAddress(trader.address)}</span>
                                {copiedAddress === trader.address ? (
                                  <Check className="h-3.5 w-3.5 text-cyber-success shrink-0" />
                                ) : (
                                  <Copy className="h-3.5 w-3.5 text-cyber-text-tertiary shrink-0" />
                                )}
                              </button>
                            </div>
                            <span className="text-[9px] text-cyber-text-tertiary uppercase font-black tracking-[0.12em]">
                              Verified
                            </span>
                          </div>
                          <div className="mt-3 grid grid-cols-3 gap-2">
                            <div className="rounded-lg border border-cyber-bg-hover/30 bg-cyber-bg-hover/20 px-2 py-1.5 text-center">
                              <p className="text-[8px] uppercase tracking-[0.15em] font-black text-cyber-text-tertiary">Volume</p>
                              <p className="text-xs font-black text-cyber-text-primary mt-0.5">
                                <NumberTicker value={trader.volume} prefix="$" />
                              </p>
                            </div>
                            <div className="rounded-lg border border-cyber-success/30 bg-cyber-success/10 px-2 py-1.5 text-center">
                              <p className="text-[8px] uppercase tracking-[0.15em] font-black text-cyber-text-tertiary">Reward</p>
                              <p className="text-xs font-black text-cyber-success mt-0.5">
                                +${Number(trader.reward || 0).toFixed(2)}
                              </p>
                            </div>
                            <div className="rounded-lg border border-cyber-bg-hover/30 bg-cyber-bg-hover/20 px-2 py-1.5 text-center">
                              <p className="text-[8px] uppercase tracking-[0.15em] font-black text-cyber-text-tertiary">Hold</p>
                              <p className="text-xs font-black text-cyber-text-primary mt-0.5">{trader.holdTime}</p>
                            </div>
                          </div>
                        </motion.div>
                      ))
                    ) : (
                      <div className="rounded-xl border border-cyber-bg-hover/30 bg-cyber-bg-card/30 p-4 text-center text-xs font-bold uppercase tracking-[0.15em] text-cyber-text-tertiary">
                        No challengers yet
                      </div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="hidden md:block overflow-x-auto -mx-8 px-8">
                  <table className="w-full min-w-[760px] lg:min-w-0 text-left border-collapse table-fixed">
                    <thead>
                      <tr className="text-cyber-text-secondary text-[11px] border-b border-cyber-bg-hover/40">
                        <th className="pb-4 font-black uppercase tracking-[0.15em] w-[10%] text-left pl-1">
                          Rank
                        </th>
                        <th className="pb-4 font-black uppercase tracking-[0.15em] w-[30%]">Wallet</th>
                        <th className="pb-4 font-black uppercase tracking-[0.15em] text-right w-[20%]">Volume</th>
                        <th className="pb-4 font-black uppercase tracking-[0.15em] text-right w-[20%]">Reward</th>
                        <th className="pb-4 font-black uppercase tracking-[0.15em] text-right w-[20%] pr-8">Hold Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      <AnimatePresence>
                        {loading ? (
                          [...Array(5)].map((_, idx) => (
                            <motion.tr
                              key={`skeleton-${idx}`}
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              className="group border-b border-cyber-bg-hover/20"
                            >
                              <td className="py-5 w-16">
                                <span className="inline-flex items-center justify-center w-10 h-10 rounded-full text-sm font-black bg-cyber-bg-hover/50 text-cyber-text-tertiary/50 animate-pulse">
                                  {idx + 1}
                                </span>
                              </td>
                              <td className="py-5">
                                <div className="flex items-center gap-3">
                                  <div className="h-11 w-11 rounded-xl bg-cyber-bg-hover/50 flex items-center justify-center animate-pulse">
                                    <Wallet className="h-5 w-5 text-cyber-text-tertiary/30" />
                                  </div>
                                  <div className="space-y-1.5 flex-1">
                                    <span className="font-mono text-sm font-black text-cyber-text-tertiary/50 animate-pulse">.....</span>
                                    <span className="block text-[9px] text-cyber-text-tertiary/30 uppercase font-black tracking-[0.2em]">Verified</span>
                                  </div>
                                </div>
                              </td>
                              <td className="py-5 text-right">
                                <div className="flex flex-col items-end">
                                  <span className="text-xl font-black tracking-tighter text-cyber-text-tertiary/50 leading-none mb-1.5 animate-pulse">$0</span>
                                  <span className="text-[9px] text-cyber-text-tertiary/30 font-bold uppercase tracking-[0.15em]">Volume</span>
                                </div>
                              </td>
                              <td className="py-5 text-right flex justify-end">
                                <div className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-cyber-bg-hover/50 text-cyber-text-tertiary/50 font-black text-sm animate-pulse">
                                  <Award className="h-4 w-4" />
                                  <span>+$0.00</span>
                                </div>
                              </td>
                              <td className="py-5 text-right pr-8">
                                <div className="flex flex-col items-end">
                                  <span className="text-sm font-black text-cyber-text-tertiary/50 tabular-nums leading-tight animate-pulse">0.0h</span>
                                  <span className="text-[9px] text-cyber-text-tertiary/30 font-bold uppercase tracking-[0.15em] mt-0.5">Avg</span>
                                </div>
                              </td>
                            </motion.tr>
                          ))
                        ) : (
                          traders.map((trader, idx) => (
                            <motion.tr
                              key={trader.address}
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              transition={{ delay: idx * 0.05 }}
                              className="group border-b border-cyber-bg-hover/20 hover:bg-white/5 dark:hover:bg-white/5 transition-all duration-300"
                            >
                              <td className="py-5 relative z-10 w-16">
                                <span
                                  className={cn(
                                    "inline-flex items-center justify-center w-10 h-10 rounded-full text-sm font-black shadow-lg ring-2 transition-all duration-300 group-hover:scale-110",
                                    trader.rank === 1
                                      ? "bg-gradient-to-br from-yellow-300 via-yellow-400 to-amber-500 text-amber-950 ring-yellow-400/30 shadow-yellow-400/20"
                                      : trader.rank === 2
                                        ? "bg-gradient-to-br from-slate-200 via-slate-300 to-slate-400 text-slate-900 ring-slate-300/30 shadow-slate-300/20"
                                        : trader.rank === 3
                                          ? "bg-gradient-to-br from-orange-300 via-orange-400 to-orange-600 text-orange-950 ring-orange-400/30 shadow-orange-400/20"
                                          : "bg-cyber-bg-hover text-cyber-text-secondary ring-cyber-bg-hover/50"
                                  )}
                                >
                                  {trader.rank}
                                </span>
                              </td>
                              <td className="py-5 relative z-10">
                                <div className="flex items-center gap-3">
                                  <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-cyber-accent-primary/10 to-cyber-accent-secondary/10 flex items-center justify-center border border-cyber-accent-primary/20 group-hover:scale-110 group-hover:border-cyber-accent-primary/40 transition-all duration-300 shadow-sm">
                                    <Wallet className="h-5 w-5 text-cyber-accent-primary" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <button
                                      onClick={() => copyToClipboard(trader.address)}
                                      className="font-mono text-sm font-black tracking-tight text-cyber-text-primary block leading-tight hover:text-cyber-accent-primary transition-colors cursor-pointer group/address relative"
                                      title={trader.address}
                                    >
                                      <span className="flex items-center gap-1.5">
                                        {shortenAddress(trader.address)}
                                        {copiedAddress === trader.address ? (
                                          <Check className="h-3.5 w-3.5 text-cyber-success" />
                                        ) : (
                                          <Copy className="h-3.5 w-3.5 opacity-0 group-hover/address:opacity-100 transition-opacity" />
                                        )}
                                      </span>
                                    </button>
                                    <span className="text-[9px] text-cyber-text-tertiary uppercase font-black tracking-[0.2em] mt-0.5 inline-block">
                                      Verified
                                    </span>
                                  </div>
                                </div>
                              </td>
                              <td className="py-5 text-right relative z-10">
                                <div className="flex flex-col items-end">
                                  <span className="text-xl font-black tracking-tighter text-cyber-text-primary leading-none mb-1.5">
                                    <NumberTicker value={trader.volume} prefix="$" />
                                  </span>
                                  <span className="text-[9px] text-cyber-text-tertiary font-bold uppercase tracking-[0.15em]">Volume</span>
                                </div>
                              </td>
                              <td className="py-5 text-right relative z-10">
                                <div className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-br from-cyber-success/10 to-cyber-success/5 text-cyber-success border border-cyber-success/30 font-black text-sm shadow-sm group-hover:shadow-md group-hover:scale-105 transition-all duration-300">
                                  <Award className="h-4 w-4" />
                                  <span>+${Number(trader.reward || 0).toFixed(2)}</span>
                                </div>
                              </td>
                              <td className="py-5 text-right relative z-10 pr-8">
                                <div className="flex flex-col items-end">
                                  <span className="text-sm font-black text-cyber-text-primary tabular-nums leading-tight">{trader.holdTime}</span>
                                  <span className="text-[9px] text-cyber-text-tertiary font-bold uppercase tracking-[0.15em] mt-0.5">Avg</span>
                                </div>
                              </td>
                            </motion.tr>
                          ))
                        )}
                      </AnimatePresence>
                    </tbody>
                  </table>
                </div>
              </div>
          </CyberCard>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
