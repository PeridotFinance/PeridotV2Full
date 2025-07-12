'use client'

import { useState, useEffect } from 'react'
import { useAccount, useChainId } from 'wagmi'
import { useTheme } from 'next-themes'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ConnectWalletButton } from '@/components/wallet/connect-wallet-button'
import { Wallet, Trophy, TrendingUp, Activity, Star, Zap, Target, Crown, Medal, Award } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { motion, AnimatePresence } from 'framer-motion'
import { chainConfigs, getChainConfig } from '@/config/contracts'
import { useDailyLogin } from '@/hooks/use-daily-login'
import { DailyLoginPopup } from '@/components/ui/daily-login-popup'

const rankingTiers = [
  { level: 'Celestial', minPoints: 100000, emoji: '✨' },
  { level: 'Divine', minPoints: 50000, emoji: '👑' },
  { level: 'Mythic', minPoints: 25000, emoji: '🦄' },
  { level: 'Legendary', minPoints: 10000, emoji: '🥇' },
  { level: 'Master', minPoints: 5000, emoji: '🥈' },
  { level: 'Expert', minPoints: 1000, emoji: '🥉' },
  { level: 'Advanced', minPoints: 500, emoji: '🏆' },
  { level: 'Intermediate', minPoints: 100, emoji: '⭐' },
  { level: 'Beginner', minPoints: 0, emoji: '🎯' },
].sort((a, b) => b.minPoints - a.minPoints); // Ensure descending for point checking

interface LeaderboardUser {
  wallet_address: string
  total_points: number
  supply_count: number
  borrow_count: number
  repay_count: number
  redeem_count: number
  rank?: number
}

interface VerifiedTransaction {
  tx_hash: string
  action_type: 'supply' | 'borrow' | 'repay' | 'redeem'
  token_symbol: string
  amount: string
  usd_value: number
  points_awarded: number
  verified_at: string
  chain_id: number
}

interface LeaderboardStats {
  total_users: number
  total_points_awarded: number
  total_supplies: number
  total_borrows: number
  total_repays: number
  total_redeems: number
  total_verified_transactions: number
}

// Helper function to get chain name from chain ID
function getChainName(chainId: number): string {
  const config = getChainConfig(chainId)
  return config?.chainNameReadable || `Chain ${chainId}`
}

export default function WalletIntegratedLeaderboard() {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { theme } = useTheme()
  const [isMounted, setIsMounted] = useState(false)
  const [openTooltip, setOpenTooltip] = useState<string | null>(null)
  
  // Daily login system
  const {
    showPopup,
    lastClaimResult,
    closePopup,
    loginStreak,
    isLoading: dailyLoginLoading
  } = useDailyLogin()

  useEffect(() => {
    setIsMounted(true)
  }, [])

  // Close tooltip when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (openTooltip && !(event.target as Element)?.closest('[data-tooltip-trigger]')) {
        setOpenTooltip(null)
      }
    }

    if (openTooltip) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
  }, [openTooltip])
  
  const [leaderboard, setLeaderboard] = useState<LeaderboardUser[]>([])
  const [userStats, setUserStats] = useState<LeaderboardUser | null>(null)
  const [userTransactions, setUserTransactions] = useState<VerifiedTransaction[]>([])
  const [stats, setStats] = useState<LeaderboardStats | null>(null)
  const [loading, setLoading] = useState(false)

  // Load leaderboard data
  const loadLeaderboard = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/leaderboard')
      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to load leaderboard')
      }
      
      setLeaderboard(data.leaderboard)
      setStats(data.stats)
    } catch (err) {
      console.error('Failed to load leaderboard:', err)
    } finally {
      setLoading(false)
    }
  }

  // Load user-specific data
  const loadUserData = async (wallet: string) => {
    if (!wallet || !wallet.match(/^0x[a-fA-F0-9]{40}$/)) return
    
    try {
      const response = await fetch(`/api/leaderboard?wallet=${wallet}`)
      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to load user data')
      }
      
      setUserStats(data.user)
      setUserTransactions(data.transactions)
    } catch (err) {
      console.error('Failed to load user data:', err)
    }
  }

  // Load data when wallet connects
  useEffect(() => {
    loadLeaderboard()
  }, [])

  useEffect(() => {
    if (address) {
      loadUserData(address)
    } else {
      setUserStats(null)
      setUserTransactions([])
    }
  }, [address])

  const actionColors = {
    supply: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    borrow: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
    repay: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
    redeem: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300',
  }

  const getRankEmoji = (rank: number) => {
    if (rank === 1) return '🥇'
    if (rank === 2) return '🥈' 
    if (rank === 3) return '🥉'
    if (rank <= 10) return '🏆'
    if (rank <= 50) return '⭐'
    return '🎯'
  }

  const getRankIcon = (rank: number) => {
    if (rank === 1) return Crown
    if (rank === 2) return Medal
    if (rank === 3) return Award
    if (rank <= 10) return Trophy
    if (rank <= 50) return Star
    return Target
  }

  const getRankColor = (rank: number) => {
    if (rank === 1) return 'from-yellow-400 to-yellow-600'
    if (rank === 2) return 'from-gray-300 to-gray-500'
    if (rank === 3) return 'from-orange-400 to-orange-600'
    if (rank <= 10) return 'from-green-400 to-green-600'
    if (rank <= 50) return 'from-blue-400 to-blue-600'
    return 'from-purple-400 to-purple-600'
  }

  const getPointsLevel = (points: number) => {
    return rankingTiers.find(tier => points >= tier.minPoints)?.level || 'Beginner'
  }

  const getActivityScore = (user: LeaderboardUser) => {
    return user.supply_count + user.borrow_count + user.repay_count + user.redeem_count
  }

  return (
    <TooltipProvider>
      {/* Fixed Professional Gradient Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className={cn(
          "absolute inset-0 bg-gradient-to-br transition-all duration-1000",
          isMounted && theme === "light"
            ? "from-green-50/30 via-emerald-50/20 to-slate-50/40"
            : "from-slate-900/50 via-green-900/30 to-slate-800/50"
        )} />
        <div className={cn(
          "absolute inset-0 bg-gradient-to-tr transition-all duration-1000",
          isMounted && theme === "light"
            ? "from-transparent via-white/10 to-green-100/30"
            : "from-transparent via-green-900/10 to-slate-900/30"
        )} />
      </div>
      
      <div className="relative container mx-auto p-3 sm:p-6 space-y-4 sm:space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold flex items-center justify-center gap-2">
          <Trophy className="h-8 w-8 text-primary" />
          Peridot Protocol Leaderboard
        </h1>
        <p className="text-muted-foreground mt-2">
          Earn points by interacting with our lending & borrowing protocol across multiple chains
        </p>
      </div>

      {/* Wallet Connection Status */}
      {!isConnected && (
        <Card className="border-primary/20">
          <CardContent className="p-6 text-center">
            <Wallet className="h-12 w-12 text-primary mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Connect Your Wallet</h3>
            <p className="text-muted-foreground mb-4">
              Connect your wallet to automatically track your transactions and see your ranking
            </p>
            <ConnectWalletButton />
          </CardContent>
        </Card>
      )}

      {/* Enhanced Connected User Quick Stats */}
      {isConnected && userStats && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className={cn(
            "relative p-4 md:p-6 rounded-3xl backdrop-blur-xl border overflow-hidden",
            "bg-gradient-to-r shadow-2xl",
            isMounted && theme === "light"
              ? "from-green-50/80 to-emerald-50/80 border-green-300/50 shadow-green-500/20"
              : "from-green-900/30 to-emerald-900/30 border-green-500/40 shadow-green-500/30"
          )}
        >
          {/* Animated Background */}
          <div className="absolute inset-0 bg-gradient-to-r from-green-400/10 via-emerald-400/5 to-green-500/10 rounded-3xl">
            <motion.div
              animate={{ 
                background: [
                  "radial-gradient(circle at 20% 80%, rgba(16, 185, 129, 0.15) 0%, transparent 50%)",
                  "radial-gradient(circle at 80% 20%, rgba(16, 185, 129, 0.15) 0%, transparent 50%)",
                  "radial-gradient(circle at 40% 40%, rgba(16, 185, 129, 0.15) 0%, transparent 50%)"
                ]
              }}
              transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
              className="absolute inset-0 rounded-3xl"
            />
          </div>

          <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-3">
              {/* Rank Badge */}
              <motion.div
                whileHover={{ scale: 1.1, rotate: 5 }}
                className={cn(
                  "relative w-12 h-12 md:w-16 md:h-16 rounded-2xl flex items-center justify-center flex-shrink-0",
                  "bg-gradient-to-br shadow-xl border-2",
                  userStats.rank ? getRankColor(userStats.rank) : "from-green-400 to-green-600",
                  "border-white/30"
                )}
              >
                <div className="text-center flex flex-col items-center justify-center">
                  <div className="text-lg md:text-xl leading-none mb-0.5">{userStats.rank && getRankEmoji(userStats.rank)}</div>
                  <div className="text-xs font-bold leading-none">
                    #{userStats.rank || '?'}
                  </div>
                </div>
              </motion.div>

              <div className="min-w-0 flex-1">
                <h3 className="text-lg md:text-xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text ">
                  Your Elite Status
                </h3>
                <div className="flex items-center gap-2 text-sm flex-wrap">
                  <span className="font-mono font-medium truncate">
                    {address?.slice(0, 6)}...{address?.slice(-4)}
                  </span>
                  <Badge className="bg-green-500 hover:bg-green-600 text-xs">
                    {getPointsLevel(userStats.total_points)}
                  </Badge>
                </div>
              </div>
            </div>

            <div className="text-center md:text-right">
              <motion.div 
                whileHover={{ scale: 1.05 }}
                className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text"
              >
                {userStats.total_points.toLocaleString()}
              </motion.div>
              <div className="text-sm text-muted-foreground flex items-center justify-center md:justify-end gap-1">
                <Zap className="h-3 w-3 text-green-500" />
                Total Points
              </div>
              <div className="text-xs text-green-600 font-medium mt-1">
                Activity Score: {getActivityScore(userStats)}
              </div>
            </div>
          </div>

          {/* Subtle Pulse Effect */}
          <motion.div
            animate={{ opacity: [0.5, 0.8, 0.5] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            className="absolute inset-0 rounded-3xl bg-gradient-to-r from-green-400/5 via-emerald-400/10 to-green-500/5 pointer-events-none"
          />
        </motion.div>
      )}

      {/* Enhanced Liquid Glass Stats Overview */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            whileHover={{ scale: 1.05, y: -5 }}
            className={cn(
              "group relative p-3 md:p-5 rounded-2xl backdrop-blur-xl border overflow-hidden cursor-pointer",
              "shadow-lg transition-all duration-300",
              isMounted && theme === "light"
                ? "bg-white/50 border-blue-200/50 hover:shadow-blue-200/50"
                : "bg-white/10 border-blue-500/30 hover:shadow-blue-500/20"
            )}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-blue-400/10 to-cyan-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <div className="relative flex items-center gap-3">
              <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 shadow-lg flex items-center justify-center">
                <Activity className="h-5 w-5 " />
              </div>
              <div>
                <div className="text-xl md:text-2xl font-bold text-blue-600">{stats.total_users}</div>
                <div className="text-xs text-muted-foreground">Total Users</div>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            whileHover={{ scale: 1.05, y: -5 }}
            className={cn(
              "group relative p-3 md:p-5 rounded-2xl backdrop-blur-xl border overflow-hidden cursor-pointer",
              "shadow-lg transition-all duration-300",
              isMounted && theme === "light"
                ? "bg-white/50 border-green-200/50 hover:shadow-green-200/50"
                : "bg-white/10 border-green-500/30 hover:shadow-green-500/20"
            )}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-green-400/10 to-emerald-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <div className="relative flex items-center gap-3">
              <div className="p-3 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 shadow-lg flex items-center justify-center">
                <Zap className="h-5 w-5 " />
              </div>
              <div>
                <div className="text-xl md:text-2xl font-bold text-green-600">{stats.total_points_awarded.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">Points Awarded</div>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            whileHover={{ scale: 1.05, y: -5 }}
            className={cn(
              "group relative p-3 md:p-5 rounded-2xl backdrop-blur-xl border overflow-hidden cursor-pointer",
              "shadow-lg transition-all duration-300",
              isMounted && theme === "light"
                ? "bg-white/50 border-purple-200/50 hover:shadow-purple-200/50"
                : "bg-white/10 border-purple-500/30 hover:shadow-purple-500/20"
            )}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-purple-400/10 to-pink-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <div className="relative flex items-center gap-3">
              <div className="p-3 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 shadow-lg flex items-center justify-center">
                <Target className="h-5 w-5 " />
              </div>
              <div>
                <div className="text-xl md:text-2xl font-bold text-purple-600">{stats.total_verified_transactions}</div>
                <div className="text-xs text-muted-foreground">Verified Transactions</div>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            whileHover={{ scale: 1.05, y: -5 }}
            className={cn(
              "group relative p-3 md:p-5 rounded-2xl backdrop-blur-xl border overflow-hidden cursor-pointer",
              "shadow-lg transition-all duration-300",
              isMounted && theme === "light"
                ? "bg-white/50 border-orange-200/50 hover:shadow-orange-200/50"
                : "bg-white/10 border-orange-500/30 hover:shadow-orange-500/20"
            )}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-orange-400/10 to-red-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <div className="relative flex items-center gap-3">
              <div className="p-3 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 shadow-lg flex items-center justify-center">
                <TrendingUp className="h-5 w-5 " />
              </div>
              <div>
                <div className="text-xl md:text-2xl font-bold text-orange-600">{stats.total_supplies + stats.total_borrows}</div>
                <div className="text-xs text-muted-foreground">Total Actions</div>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      <Tabs defaultValue="leaderboard" className="w-full">
        <TabsList className={cn(
          "grid w-full grid-cols-3 h-auto p-1 mb-6",
          "rounded-2xl backdrop-blur-sm border transition-all duration-300",
          "shadow-lg shadow-black/5",
          isMounted && theme === "light" 
            ? "bg-slate-100/80 border-slate-200/60" 
            : "bg-muted border-border"
        )}>
          <TabsTrigger 
            value="leaderboard"
            className={cn(
              "rounded-xl py-2.5 sm:py-3 px-2 sm:px-3",
              "text-xs sm:text-sm font-medium transition-all duration-300",
              "data-[state=active]:shadow-lg",
              isMounted && theme === "light"
                ? "data-[state=active]:bg-white/90 data-[state=active]:border data-[state=active]:border-white/60 data-[state=active]:shadow-slate-200/50 data-[state=active]:text-slate-800 text-slate-600 hover:text-slate-800 hover:bg-white/50"
                : "data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-black/20"
            )}
          >
            Leaderboard
          </TabsTrigger>
          <TabsTrigger 
            value="how-it-works"
            className={cn(
              "rounded-xl py-2.5 sm:py-3 px-2 sm:px-3",
              "text-xs sm:text-sm font-medium transition-all duration-300",
              "data-[state=active]:shadow-lg",
              isMounted && theme === "light"
                ? "data-[state=active]:bg-white/90 data-[state=active]:border data-[state=active]:border-white/60 data-[state=active]:shadow-slate-200/50 data-[state=active]:text-slate-800 text-slate-600 hover:text-slate-800 hover:bg-white/50"
                : "data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-black/20"
            )}
          >
            How It Works
          </TabsTrigger>
          <TabsTrigger 
            value="profile"
            className={cn(
              "rounded-xl py-2.5 sm:py-3 px-2 sm:px-3",
              "text-xs sm:text-sm font-medium transition-all duration-300",
              "data-[state=active]:shadow-lg",
              isMounted && theme === "light"
                ? "data-[state=active]:bg-white/90 data-[state=active]:border data-[state=active]:border-white/60 data-[state=active]:shadow-slate-200/50 data-[state=active]:text-slate-800 text-slate-600 hover:text-slate-800 hover:bg-white/50"
                : "data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-black/20"
            )}
          >
            My Profile
          </TabsTrigger>
        </TabsList>

        {/* Enhanced Interactive Leaderboard Tab */}
        <TabsContent value="leaderboard">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              "relative rounded-3xl backdrop-blur-xl border overflow-hidden",
              "shadow-2xl",
              isMounted && theme === "light"
                ? "bg-white/40 border-green-200/30 shadow-green-500/10"
                : "bg-white/5 border-green-500/20 shadow-green-500/20"
            )}
          >
            {/* Liquid Glass Header */}
            <div className={cn(
              "relative p-4 md:p-6 bg-gradient-to-r backdrop-blur-xl border-b",
              isMounted && theme === "light"
                ? "from-green-50/80 to-emerald-50/80 border-green-200/40"
                : "from-green-900/20 to-emerald-900/20 border-green-500/30"
            )}>
              <div className="absolute inset-0 bg-gradient-to-r from-green-400/10 via-emerald-400/5 to-green-500/10 rounded-t-3xl"></div>
              <div className="relative flex items-center gap-3">
                <motion.div
                  animate={{ rotate: [0, 5, -5, 0] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  className="p-3 rounded-2xl bg-gradient-to-br from-green-400 to-green-600 shadow-lg shadow-green-500/30"
                >
                  <Trophy className="h-6 w-6 " />
                </motion.div>
                <div>
                  <h2 className="text-2xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text">
                    Elite Protocol Users
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Rankings based on DeFi mastery and protocol engagement
                  </p>
                </div>
              </div>
            </div>

            {/* Interactive Leaderboard Content */}
            <div className="p-4 md:p-6">
              {loading ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center justify-center py-12"
                >
                  <div className="flex items-center gap-3">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full"
                    />
                    <span className="text-green-600 font-medium">Loading elite users...</span>
                  </div>
                </motion.div>
              ) : (
                <AnimatePresence>
                  <div className="space-y-3">
                  {leaderboard.map((user, index) => {
                    const isCurrentUser = address?.toLowerCase() === user.wallet_address.toLowerCase()
                      const RankIcon = getRankIcon(index + 1)
                      const activityScore = getActivityScore(user)
                      const pointsLevel = getPointsLevel(user.total_points)

                    return (
                                                <motion.div
                          key={user.wallet_address}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.1 }}
                          whileHover={{ scale: 1.02, y: -2 }}
                          className="group"
                        >
                          <Tooltip 
                            delayDuration={200}
                            open={openTooltip === user.wallet_address}
                            onOpenChange={(open) => {
                              setOpenTooltip(open ? user.wallet_address : null)
                            }}
                          >
                            <TooltipTrigger asChild>
                              <div 
                                data-tooltip-trigger
                                className={cn(
                                  "relative p-4 rounded-2xl backdrop-blur-sm border transition-all duration-300 cursor-pointer",
                                  "hover:shadow-lg active:scale-[0.98]",
                                  openTooltip === user.wallet_address && "ring-2 ring-green-500/50",
                                  isCurrentUser ? (
                                    isMounted && theme === "light"
                                      ? "bg-green-50/60 border-green-300/60 shadow-green-200/50"
                                      : "bg-green-900/20 border-green-500/40 shadow-green-500/20"
                                  ) : (
                                    isMounted && theme === "light"
                                      ? "bg-white/40 border-white/30 hover:bg-white/60 hover:border-green-200/50"
                                      : "bg-white/5 border-white/10 hover:bg-white/10 hover:border-green-500/30"
                                  )
                                )}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  const isCurrentlyOpen = openTooltip === user.wallet_address
                                  setOpenTooltip(isCurrentlyOpen ? null : user.wallet_address)
                                }}
                              >
                                <div className="flex items-center gap-3">
                                  {/* Rank Badge */}
                                  <motion.div
                                    whileHover={{ scale: 1.1 }}
                                    className={cn(
                                      "w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center flex-shrink-0",
                                      "bg-gradient-to-br shadow-lg border-2 border-white/20",
                                      getRankColor(index + 1)
                                    )}
                                  >
                                    <span className={cn(
                                      "text-xs font-bold text-center leading-none",
                                      isMounted && theme === "light" ? "text-slate-800" : "text-white"
                                    )}>#{index + 1}</span>
                                  </motion.div>

                                  {/* User Info */}
                                  <div className="flex items-center gap-2 min-w-0 flex-1">
                                    <div className="hidden md:flex items-center gap-2">
                                      <RankIcon className={cn(
                                        "h-4 w-4",
                                        index < 3 ? (isMounted && theme === "light" ? "text-yellow-600" : "text-yellow-400") : (isMounted && theme === "light" ? "text-green-700" : "text-green-400")
                                      )} />
                                      <span className="text-xl">{getRankEmoji(index + 1)}</span>
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className={cn(
                                          "font-mono text-sm font-medium truncate",
                                          isCurrentUser 
                                            ? "text-green-600 font-bold" 
                                            : isMounted && theme === "light" 
                                              ? "text-slate-700" 
                                              : "text-slate-200"
                                        )}>
                                          {user.wallet_address.slice(0, 6)}...{user.wallet_address.slice(-4)}
                                        </span>
                                        {isCurrentUser && (
                                          <motion.div
                                            initial={{ scale: 0 }}
                                            animate={{ scale: 1 }}
                                            className="px-2 py-1 rounded-full bg-green-500 text-xs font-bold"
                                          >
                                            YOU
                                          </motion.div>
                                        )}
                                      </div>
                                      <div className={cn(
                                        "flex items-center gap-2 text-xs",
                                        isMounted && theme === "light" ? "text-slate-600" : "text-muted-foreground"
                                      )}>
                                        <span className="truncate">{pointsLevel}</span>
                                        <span className="hidden md:inline">•</span>
                                        <span className="hidden md:inline">{activityScore} transactions</span>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Points Display */}
                                  <div className="text-right flex-shrink-0">
                                    <motion.div 
                                      whileHover={{ scale: 1.05 }}
                                      className={cn(
                                        "text-lg md:text-2xl font-bold",
                                        isMounted && theme === "light"
                                          ? "text-slate-800"
                                          : "bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent"
                                      )}
                                    >
                                      {user.total_points.toLocaleString()}
                                    </motion.div>
                                    <div className={cn(
                                      "text-xs flex items-center justify-end gap-1",
                                      isMounted && theme === "light" ? "text-slate-600" : "text-muted-foreground"
                                    )}>
                                      <Zap className={cn(
                                        "h-3 w-3",
                                        isMounted && theme === "light" ? "text-green-600" : "text-green-400"
                                      )} />
                                      <span className="hidden md:inline">points</span>
                                    </div>
                                  </div>
                                </div>

                                {/* Hover Glow Effect */}
                                <div className={cn(
                                  "absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none",
                                  "bg-gradient-to-r from-green-400/10 via-emerald-400/5 to-green-500/10"
                                )} />
                              </div>
                            </TooltipTrigger>
                            <TooltipContent 
                              side="top" 
                              align="center"
                              sideOffset={10}
                              className={cn(
                                "max-w-xs p-4 rounded-xl backdrop-blur-xl border z-50",
                                "shadow-2xl",
                                isMounted && theme === "light"
                                  ? "bg-white/95 border-green-300/60 shadow-green-200/20"
                                  : "bg-black/95 border-green-500/50 shadow-green-500/30"
                              )}
                            >
                              <div className="space-y-3">
                                <div className="flex items-center gap-2">
                                  <RankIcon className={cn(
                                    "h-4 w-4",
                                    isMounted && theme === "light" ? "text-green-700" : "text-green-400"
                                  )} />
                                  <span className={cn(
                                    "font-semibold",
                                    isMounted && theme === "light" ? "text-green-700" : "text-green-400"
                                  )}>Rank #{index + 1} • {pointsLevel}</span>
                                </div>
                                
                                <div className="grid grid-cols-2 gap-3 text-sm">
                                  <div className="flex items-center gap-1">
                                    <TrendingUp className={cn(
                                      "h-3 w-3",
                                      isMounted && theme === "light" ? "text-green-700" : "text-green-400"
                                    )} />
                                    <span>{user.supply_count} Supplies</span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <TrendingUp className={cn(
                                      "h-3 w-3 rotate-180",
                                      isMounted && theme === "light" ? "text-blue-700" : "text-blue-400"
                                    )} />
                                    <span>{user.borrow_count} Borrows</span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <Zap className={cn(
                                      "h-3 w-3",
                                      isMounted && theme === "light" ? "text-yellow-600" : "text-yellow-400"
                                    )} />
                                    <span>{user.repay_count} Repays</span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <Target className={cn(
                                      "h-3 w-3",
                                      isMounted && theme === "light" ? "text-purple-700" : "text-purple-400"
                                    )} />
                                    <span>{user.redeem_count} Redeems</span>
                                  </div>
                                </div>

                                <div className="pt-2 border-t border-border/50">
                                  <div className="text-xs text-muted-foreground">
                                    Total Activity Score: <span className={cn(
                                      "font-semibold",
                                      isMounted && theme === "light" ? "text-green-700" : "text-green-400"
                                    )}>{activityScore}</span>
                                  </div>
                        </div>
                      </div>
                            </TooltipContent>
                          </Tooltip>
                        </motion.div>
                    )
                  })}
                </div>
                </AnimatePresence>
              )}
            </div>
          </motion.div>
        </TabsContent>

        {/* How It Works Tab - Concise */}
        <TabsContent value="how-it-works">
          <div className="space-y-4">
            {/* Header Section */}
            <div
              className={cn(
                "p-4 md:p-6 rounded-2xl backdrop-blur-xl border",
                isMounted && theme === "light"
                  ? "bg-white/40 border-blue-200/30"
                  : "bg-white/5 border-blue-500/20"
              )}
            >
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 shadow-lg w-fit">
                  <Trophy className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                    How the Leaderboard Works
                  </h2>
                  <p className="text-muted-foreground text-sm">
                    Climb the ranks by interacting with the protocol.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {/* Point Earning System */}
              <div
                className={cn(
                  "rounded-2xl backdrop-blur-xl border overflow-hidden",
                  isMounted && theme === "light"
                    ? "bg-white/40 border-green-200/30"
                    : "bg-white/5 border-green-500/20"
                )}
              >
                <div className={cn("p-4 border-b", isMounted && theme === "light" ? "border-green-200/40" : "border-green-500/30")}>
                  <div className="flex items-center gap-3">
                    <Zap className="h-5 w-5 text-green-500" />
                    <h3 className="font-semibold">Earning Points</h3>
                  </div>
                </div>
                <div className="p-4 space-y-3 text-sm">
                  {[
                    { action: 'Supply Assets', points: '50-200' },
                    { action: 'Borrow Assets', points: '30-150' },
                    { action: 'Repay Loans', points: '20-100' },
                    { action: 'Redeem Assets', points: '15-75' }
                  ].map((item) => (
                    <div key={item.action} className="flex justify-between items-center">
                      <span className="text-muted-foreground">{item.action}</span>
                      <span className="font-medium text-green-600">+{item.points} pts</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Ranking System */}
              <div
                className={cn(
                  "rounded-2xl backdrop-blur-xl border overflow-hidden",
                  isMounted && theme === "light"
                    ? "bg-white/40 border-orange-200/30"
                    : "bg-white/5 border-orange-500/20"
                )}
              >
                <div className={cn("p-4 border-b", isMounted && theme === "light" ? "border-orange-200/40" : "border-orange-500/30")}>
                   <div className="flex items-center gap-3">
                    <Crown className="h-5 w-5 text-orange-500" />
                    <h3 className="font-semibold">Ranking Tiers</h3>
                  </div>
                </div>
                <div className="p-4 space-y-3 text-sm">
                  {rankingTiers.slice().reverse().map((tier) => (
                    <div key={tier.level} className="flex justify-between items-center">
                      <span className="flex items-center gap-2">{tier.emoji} {tier.level}</span>
                      <span className="font-mono text-xs text-muted-foreground">{tier.minPoints.toLocaleString()}+ pts</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Pro Tips */}
            <div
              className={cn(
                "rounded-2xl backdrop-blur-xl border overflow-hidden",
                isMounted && theme === "light"
                  ? "bg-white/40 border-purple-200/30"
                  : "bg-white/5 border-purple-500/20"
              )}
            >
               <div className={cn("p-4 border-b", isMounted && theme === "light" ? "border-purple-200/40" : "border-purple-500/30")}>
                  <div className="flex items-center gap-3">
                    <Star className="h-5 w-5 text-purple-500" />
                    <h3 className="font-semibold">Pro Tips</h3>
                  </div>
                </div>
                <ul className="p-4 pl-8 text-sm text-muted-foreground list-disc space-y-2">
                    <li>Higher USD value transactions generate more points.</li>
                    <li>Interact across multiple chains for more opportunities.</li>
                    <li>Consistent activity is rewarded more than single large actions.</li>
                    <li>Complete the full cycle (Supply → Borrow → Repay → Redeem) for maximum rewards.</li>
                </ul>
            </div>
          </div>
        </TabsContent>

        {/* Enhanced Modern Profile Tab */}
        <TabsContent value="profile">
          {!isConnected ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                "relative p-6 md:p-8 rounded-3xl backdrop-blur-xl border overflow-hidden text-center",
                "shadow-2xl",
                isMounted && theme === "light"
                  ? "bg-white/40 border-green-200/30 shadow-green-500/10"
                  : "bg-white/5 border-green-500/20 shadow-green-500/20"
              )}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-green-400/10 via-emerald-400/5 to-green-500/10 rounded-3xl"></div>
              <div className="relative">
                <motion.div
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                >
                  <Wallet className="h-16 w-16 text-green-500 mx-auto mb-4" />
                </motion.div>
                <h3 className="text-xl font-bold mb-2 bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                  Connect Your Wallet
                </h3>
                <p className="text-muted-foreground mb-6">
                  Connect your wallet to view your profile and track your DeFi journey
                </p>
                <ConnectWalletButton />
              </div>
            </motion.div>
          ) : userStats ? (
            <div className="space-y-4">


              {/* Enhanced Stats Cards */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {[
                  { label: 'Supplies', value: userStats.supply_count, icon: TrendingUp, color: 'from-green-400 to-emerald-500' },
                  { label: 'Borrows', value: userStats.borrow_count, icon: TrendingUp, color: 'from-blue-400 to-cyan-500' },
                  { label: 'Activity', value: getActivityScore(userStats), icon: Activity, color: 'from-purple-400 to-pink-500' }
                ].map((stat, index) => {
                  const IconComponent = stat.icon
                  return (
                    <motion.div
                      key={stat.label}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                      whileHover={{ scale: 1.05, y: -5 }}
                      className={cn(
                        "group relative p-3 md:p-4 rounded-2xl backdrop-blur-xl border overflow-hidden cursor-pointer",
                        "shadow-lg transition-all duration-300",
                        isMounted && theme === "light"
                          ? "bg-white/50 border-white/30 hover:shadow-lg"
                          : "bg-white/10 border-white/20 hover:shadow-xl"
                      )}
                    >
                      <div className={cn(
                        "absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300",
                        `bg-gradient-to-br ${stat.color}/10`
                      )} />
                      <div className="relative">
                        <div className={cn(
                          "w-8 h-8 md:w-10 md:h-10 rounded-xl mb-2 flex items-center justify-center",
                          `bg-gradient-to-br ${stat.color} shadow-lg`
                        )}>
                          <IconComponent className="h-4 w-4 md:h-5 md:h-5" />
                        </div>
                        <div className="text-lg md:text-xl font-bold">{stat.value}</div>
                        <div className="text-xs text-muted-foreground">{stat.label}</div>
                      </div>
                    </motion.div>
                  )
                })}
              </div>

              {/* Enhanced Transaction History */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className={cn(
                  "relative rounded-3xl backdrop-blur-xl border overflow-hidden",
                  "shadow-2xl",
                  isMounted && theme === "light"
                    ? "bg-white/40 border-white/30 shadow-green-500/10"
                    : "bg-white/5 border-white/20 shadow-green-500/20"
                )}
              >
                <div className={cn(
                  "p-4 md:p-6 bg-gradient-to-r backdrop-blur-xl border-b",
                  isMounted && theme === "light"
                    ? "from-green-50/80 to-emerald-50/80 border-green-200/40"
                    : "from-green-900/20 to-emerald-900/20 border-green-500/30"
                )}>
                  <h3 className="text-lg font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                    Recent Transactions
                  </h3>
                  <p className="text-sm text-muted-foreground">Your latest protocol interactions</p>
                </div>
                
                <div className="p-4 md:p-6">
                  {userTransactions.length > 0 ? (
                    <div className="space-y-3">
                      {userTransactions.map((tx, index) => (
                        <motion.div
                          key={tx.tx_hash}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.1 }}
                          whileHover={{ scale: 1.02, y: -2 }}
                          className={cn(
                            "relative p-3 md:p-4 rounded-2xl backdrop-blur-sm border transition-all duration-300",
                            "hover:shadow-lg",
                            isMounted && theme === "light"
                              ? "bg-white/40 border-white/30"
                              : "bg-white/5 border-white/10"
                          )}
                        >
                          <div className="flex flex-col md:flex-row md:items-center gap-3">
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <Badge className={cn("text-xs", actionColors[tx.action_type])}>
                                {tx.action_type}
                              </Badge>
                              <div className="min-w-0 flex-1">
                                <div className="font-mono text-xs md:text-sm font-medium truncate">
                                  {tx.tx_hash.slice(0, 8)}...{tx.tx_hash.slice(-6)}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {parseFloat(tx.amount).toFixed(4)} {tx.token_symbol}
                                  {tx.usd_value && !isNaN(Number(tx.usd_value)) && ` ($${Number(tx.usd_value).toFixed(2)})`}
                                  <br />
                                  <span className="inline-flex items-center gap-1">
                                    <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
                                      {getChainName(tx.chain_id)}
                                    </span>
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <div className="font-bold text-green-600">+{tx.points_awarded}</div>
                              <div className="text-xs text-muted-foreground">points</div>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <motion.div
                        animate={{ scale: [1, 1.05, 1] }}
                        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                      >
                        <Zap className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      </motion.div>
                      <p className="text-muted-foreground">
                        No transactions verified yet. Start using the protocol to earn points!
                      </p>
                    </div>
                  )}
                </div>
              </motion.div>
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                "relative p-6 md:p-8 rounded-3xl backdrop-blur-xl border overflow-hidden text-center",
                "shadow-2xl",
                isMounted && theme === "light"
                  ? "bg-white/40 border-orange-200/30 shadow-orange-500/10"
                  : "bg-white/5 border-orange-500/20 shadow-orange-500/20"
              )}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-orange-400/10 via-yellow-400/5 to-orange-500/10 rounded-3xl"></div>
              <div className="relative">
                <motion.div
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                >
                  <Star className="h-16 w-16 text-orange-500 mx-auto mb-4" />
                </motion.div>
                <p className="text-muted-foreground">
                  No profile data found. Start using the protocol to create your profile!
                </p>
              </div>
            </motion.div>
          )}
        </TabsContent>
      </Tabs>
      
      {/* Daily Login Popup */}
      <DailyLoginPopup
        isOpen={showPopup}
        onClose={closePopup}
        points={lastClaimResult?.points || 20}
        loginStreak={lastClaimResult?.loginStreak || loginStreak}
        isNewUser={lastClaimResult?.isNewUser || false}
        userName={address}
      />
    </div>
    </TooltipProvider>
  )
} 