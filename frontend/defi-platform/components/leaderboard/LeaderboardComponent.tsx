'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { getChainConfig } from '@/config/contracts'
import { useAccount } from 'wagmi'
import { useActiveWallet } from '@/hooks/use-active-wallet'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'
import { User, Zap, CheckCircle, Activity, Trophy, TrendingUp, TrendingDown, Target } from 'lucide-react'

interface LeaderboardUser {
  wallet_address: string
  total_points: number
  supply_count: number
  borrow_count: number
  repay_count: number
  redeem_count: number
  rank?: number
  username?: string
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

export default function LeaderboardComponent() {
  const { address } = useActiveWallet()
  const [leaderboard, setLeaderboard] = useState<LeaderboardUser[]>([])
  const [userStats, setUserStats] = useState<LeaderboardUser | null>(null)
  const [userTransactions, setUserTransactions] = useState<VerifiedTransaction[]>([])
  const [stats, setStats] = useState<LeaderboardStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  
  // Transaction verification form
  const [txHash, setTxHash] = useState('')
  const [walletAddress, setWalletAddress] = useState('')
  const [chainId, setChainId] = useState('10143') // Default to Arbitrum Sepolia
  const [verifying, setVerifying] = useState(false)

  // Load leaderboard data (aggregate, without wallet)
  const loadLeaderboard = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/leaderboard/aggregate')
      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to load leaderboard')
      }
      
      setLeaderboard(data.leaderboard)
      setStats(data.stats)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load leaderboard')
    } finally {
      setLoading(false)
    }
  }

  // Load user-specific data (aggregate with wallet)
  const loadUserData = async (wallet: string) => {
    if (!wallet || !wallet.match(/^0x[a-fA-F0-9]{40}$/)) return
    
    try {
      const response = await fetch(`/api/leaderboard/aggregate?wallet=${wallet}`)
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

  // Verify transaction
  const verifyTransaction = async () => {
    if (!txHash || !walletAddress || !chainId) {
      setError('Please fill in all fields')
      return
    }

    setVerifying(true)
    setError('')
    setSuccess('')

    try {
      const response = await fetch('/api/leaderboard/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          txHash,
          walletAddress,
          chainId: parseInt(chainId),
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Verification failed')
      }

      setSuccess(
        `Transaction verified! Awarded ${data.points_awarded} points. ` +
        `Your rank: ${data.user.rank || 'Unranked'}`
      )
      
      // Refresh data
      loadLeaderboard()
      loadUserData(walletAddress)
      
      // Clear form
      setTxHash('')
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed')
    } finally {
      setVerifying(false)
    }
  }

  useEffect(() => {
    loadLeaderboard()
  }, [])

  // Helper function to get chain name from chain ID
  const getChainName = (chainId: number): string => {
    const config = getChainConfig(chainId)
    return config?.chainNameReadable || `Chain ${chainId}`
  }

  const chainNames: { [key: string]: string } = {
    '421614': 'Arbitrum Sepolia',
    '84532': 'Base Sepolia',
    '1075': 'IOTA EVM Testnet',
    '50312': 'Somnia',
    '10143': 'Monad Testnet',
    '97': 'BSC Testnet',
  }

  const actionColors = {
    supply: 'bg-green-100 text-green-800',
    borrow: 'bg-blue-100 text-blue-800',
    repay: 'bg-yellow-100 text-yellow-800',
    redeem: 'bg-gray-100 text-gray-800',
  }

  const cardClassName = "bg-white/40 dark:bg-black/20 backdrop-blur-lg border border-white/20 dark:border-white/10 rounded-2xl shadow-lg"

  return (
    <div className="container mx-auto p-6 space-y-6 text-slate-800 dark:text-slate-200">
      <div className="text-center pt-8 pb-4">
        <h1 className="text-4xl font-bold flex items-center justify-center gap-3 text-slate-900 dark:text-white">
          <Trophy className="h-9 w-9 text-[#5e7945]" />
          Leaderboard
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mt-2 max-w-2xl mx-auto">
          This is a legacy component for viewing leaderboard stats and verifying transactions.
        </p>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { icon: User, label: "Total Users", value: stats.total_users.toLocaleString() },
            { icon: Zap, label: "Points Awarded", value: stats.total_points_awarded.toLocaleString() },
            { icon: CheckCircle, label: "Verified Transactions", value: stats.total_verified_transactions.toLocaleString() },
            { icon: Activity, label: "Total Actions", value: (stats.total_supplies + stats.total_borrows).toLocaleString() },
          ].map((stat, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
              <div className={cardClassName}>
                <div className="p-5 flex flex-col items-center text-center">
                  <div className="p-3 bg-[#5e7945]/10 rounded-full mb-2">
                    <stat.icon className="h-6 w-6 text-[#5e7945]" />
                  </div>
                  <p className="text-xl font-bold text-slate-900 dark:text-white">{stat.value}</p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">{stat.label}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <Tabs defaultValue="leaderboard" className="w-full">
        <TabsList className="grid w-full grid-cols-3 bg-slate-200/50 dark:bg-slate-800/50 rounded-lg p-1">
          <TabsTrigger value="leaderboard" className="data-[state=active]:bg-white dark:data-[state=active]:bg-black data-[state=active]:shadow-md rounded-md">Leaderboard</TabsTrigger>
          <TabsTrigger value="verify" className="data-[state=active]:bg-white dark:data-[state=active]:bg-black data-[state=active]:shadow-md rounded-md">Verify Tx</TabsTrigger>
          <TabsTrigger value="profile" className="data-[state=active]:bg-white dark:data-[state=active]:bg-black data-[state=active]:shadow-md rounded-md">My Profile</TabsTrigger>
        </TabsList>

        <TabsContent value="leaderboard">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className={cn(cardClassName, 'overflow-hidden')}>
            <div className="p-6">
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Top Users</h2>
              <p className="text-slate-600 dark:text-slate-400">Rankings based on total points earned.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="border-b border-white/10">
                  <tr>
                    <th className="p-4 font-semibold text-slate-600 dark:text-slate-400">Rank</th>
                    <th className="p-4 font-semibold text-slate-600 dark:text-slate-400">User</th>
                    <th className="p-4 font-semibold text-slate-600 dark:text-slate-400 text-right">Points</th>
                  </tr>
                </thead>
                <tbody>
              {loading ? (
                    <tr><td colSpan={3} className="text-center p-8">Loading...</td></tr>
              ) : (
                    leaderboard.map((user, index) => (
                      <tr key={(user as any).account_key ?? user.wallet_address} className="border-b border-white/5 hover:bg-slate-500/10">
                        <td className="p-4 font-bold text-lg text-slate-700 dark:text-slate-300 w-20">#{index + 1}</td>
                        <td className="p-4 font-mono text-sm text-slate-800 dark:text-slate-200">{user.username || user.wallet_address}</td>
                        <td className="p-4 font-bold text-lg text-right text-[#5e7945]">{user.total_points.toLocaleString()}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
                        </div>
          </motion.div>
        </TabsContent>

        <TabsContent value="verify">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className={cn(cardClassName, "p-6 space-y-4")}>
                <div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Verify Transaction</h2>
              <p className="text-slate-600 dark:text-slate-400">Submit your transaction hash to earn points.</p>
                </div>
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
            {success && <Alert><AlertDescription>{success}</AlertDescription></Alert>}
            <div className="space-y-4">
              <Input_Styled label="Transaction Hash" placeholder="0x..." value={txHash} onChange={setTxHash} />
              <Input_Styled label="Wallet Address" placeholder="0x..." value={walletAddress} onChange={(val) => { setWalletAddress(val); loadUserData(val); }} />
                <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">Chain</label>
                <select className="w-full p-2 bg-white/50 dark:bg-black/20 border border-white/20 rounded-md" value={chainId} onChange={(e) => setChainId(e.target.value)}>
                  {Object.entries(chainNames).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                  </select>
                </div>
              <Button onClick={verifyTransaction} disabled={verifying} className="w-full bg-[#5e7945] hover:bg-[#5e7945]/90 text-white">
                  {verifying ? 'Verifying...' : 'Verify Transaction'}
                </Button>
              </div>
          </motion.div>
        </TabsContent>

        <TabsContent value="profile">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className={cn(cardClassName, "p-6")}>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">My Profile</h2>
              {userStats ? (
                <div className="space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                  <div>
                    <p className="text-2xl font-bold text-slate-900 dark:text-white">{userStats.total_points}</p>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Total Points</p>
                    </div>
                  <div>
                    <p className="text-2xl font-bold text-slate-900 dark:text-white">#{userStats.rank || 'N/A'}</p>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Rank</p>
                    </div>
                  <div>
                    <p className="text-2xl font-bold text-slate-900 dark:text-white">{userStats.supply_count}</p>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Supplies</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-slate-900 dark:text-white">{userStats.borrow_count}</p>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Borrows</p>
                  </div>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-[#5e7945] mb-4">Recent Transactions</h3>
                    <div className="space-y-3">
                      {userTransactions.map((tx) => (
                      <div key={tx.tx_hash} className="flex items-center justify-between p-3 bg-slate-100/50 dark:bg-slate-900/50 rounded-lg">
                            <div>
                          <Badge className="capitalize mb-1" variant="outline" style={{ borderColor: '#5e7945', color: '#5e7945' }}>{tx.action_type}</Badge>
                          <p className="font-mono text-xs text-slate-500 dark:text-slate-400">{tx.tx_hash}</p>
                          </div>
                          <div className="text-right">
                          <p className="font-bold text-[#5e7945]">+{tx.points_awarded} pts</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{getChainName(tx.chain_id)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
              <p className="text-center text-slate-500 dark:text-slate-400 py-4">
                Enter your wallet address in the verification tab to load your profile.
              </p>
              )}
          </motion.div>
        </TabsContent>
      </Tabs>
      
    </div>
  )
} 

const Input_Styled = ({ label, placeholder, value, onChange }) => (
  <div>
    <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">{label}</label>
    <Input
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-white/50 dark:bg-black/20 border-white/20"
    />
  </div>
) 