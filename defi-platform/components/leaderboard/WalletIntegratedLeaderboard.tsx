'use client'

import { useState, useEffect } from 'react'
import { useAccount, useChainId } from 'wagmi'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ConnectWalletButton } from '@/components/wallet/connect-wallet-button'
import { Wallet, Trophy, TrendingUp, Activity } from 'lucide-react'

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

export default function WalletIntegratedLeaderboard() {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  
  const [leaderboard, setLeaderboard] = useState<LeaderboardUser[]>([])
  const [userStats, setUserStats] = useState<LeaderboardUser | null>(null)
  const [userTransactions, setUserTransactions] = useState<VerifiedTransaction[]>([])
  const [stats, setStats] = useState<LeaderboardStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  
  // Transaction verification form
  const [txHash, setTxHash] = useState('')
  const [verifying, setVerifying] = useState(false)

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
      setError(err instanceof Error ? err.message : 'Failed to load leaderboard')
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

  // Verify transaction
  const verifyTransaction = async () => {
    if (!txHash || !address || !chainId) {
      setError('Please connect wallet and enter transaction hash')
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
          walletAddress: address,
          chainId,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Verification failed')
      }

      setSuccess(
        `🎉 Transaction verified! Awarded ${data.points_awarded} points. ` +
        `Your rank: ${data.user.rank || 'Unranked'}`
      )
      
      // Refresh data
      loadLeaderboard()
      loadUserData(address)
      
      // Clear form
      setTxHash('')
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed')
    } finally {
      setVerifying(false)
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

  const chainNames: { [key: string]: string } = {
    '421614': 'Arbitrum Sepolia',
    '84532': 'Base Sepolia',
    '1075': 'IOTA EVM Testnet',
    '1946': 'Soneium Minato',
    '10143': 'Monad Testnet',
    '97': 'BSC Testnet',
  }

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

  return (
    <div className="container mx-auto p-6 space-y-6">
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

      {/* Connected User Quick Stats */}
      {isConnected && userStats && (
        <Card className="bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  {userStats.rank && getRankEmoji(userStats.rank)}
                  Your Stats
                </h3>
                <p className="text-sm text-muted-foreground font-mono">
                  {address?.slice(0, 6)}...{address?.slice(-4)}
                </p>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-primary">{userStats.total_points}</div>
                <div className="text-sm text-muted-foreground">
                  Rank #{userStats.rank || 'Unranked'}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Overview */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-muted-foreground" />
                <div className="text-2xl font-bold">{stats.total_users}</div>
              </div>
              <div className="text-sm text-muted-foreground">Total Users</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                <div className="text-2xl font-bold">{stats.total_points_awarded.toLocaleString()}</div>
              </div>
              <div className="text-sm text-muted-foreground">Points Awarded</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold">{stats.total_verified_transactions}</div>
              <div className="text-sm text-muted-foreground">Verified Transactions</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold">{stats.total_supplies + stats.total_borrows}</div>
              <div className="text-sm text-muted-foreground">Total Actions</div>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs defaultValue="leaderboard" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
          <TabsTrigger value="verify">Verify Transaction</TabsTrigger>
          <TabsTrigger value="profile">My Profile</TabsTrigger>
        </TabsList>

        {/* Leaderboard Tab */}
        <TabsContent value="leaderboard">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5" />
                Top Users
              </CardTitle>
              <CardDescription>
                Rankings based on total points earned from protocol interactions
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8">Loading leaderboard...</div>
              ) : (
                <div className="space-y-4">
                  {leaderboard.map((user, index) => {
                    const isCurrentUser = address?.toLowerCase() === user.wallet_address.toLowerCase()
                    return (
                      <div
                        key={user.wallet_address}
                        className={`flex items-center justify-between p-4 border rounded-lg transition-colors ${
                          isCurrentUser ? 'bg-primary/5 border-primary/20' : ''
                        }`}
                      >
                        <div className="flex items-center space-x-4">
                          <div className="text-2xl font-bold text-muted-foreground flex items-center gap-1">
                            {getRankEmoji(index + 1)}
                            #{index + 1}
                          </div>
                          <div>
                            <div className={`font-mono text-sm ${isCurrentUser ? 'font-semibold text-primary' : ''}`}>
                              {user.wallet_address.slice(0, 6)}...{user.wallet_address.slice(-4)}
                              {isCurrentUser && <Badge className="ml-2" variant="secondary">You</Badge>}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {user.supply_count} supplies, {user.borrow_count} borrows
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-bold">{user.total_points.toLocaleString()}</div>
                          <div className="text-sm text-muted-foreground">points</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Verify Transaction Tab */}
        <TabsContent value="verify">
          <Card>
            <CardHeader>
              <CardTitle>Verify Transaction</CardTitle>
              <CardDescription>
                Submit your transaction hash to earn points for protocol interactions
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              
              {success && (
                <Alert className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950">
                  <AlertDescription className="text-green-800 dark:text-green-200">
                    {success}
                  </AlertDescription>
                </Alert>
              )}

              {!isConnected ? (
                <div className="text-center py-8">
                  <Wallet className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground mb-4">Connect your wallet to verify transactions</p>
                  <ConnectWalletButton />
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-primary/5 p-4 rounded-lg border border-primary/20">
                    <div className="flex items-center gap-2 mb-2">
                      <Wallet className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium">Connected Wallet</span>
                    </div>
                    <p className="font-mono text-sm">{address}</p>
                    <p className="text-sm text-muted-foreground">
                      Current Chain: {chainNames[chainId?.toString() || ''] || `Chain ${chainId}`}
                    </p>
                  </div>

                  <div>
                    <label className="text-sm font-medium">Transaction Hash</label>
                    <Input
                      placeholder="0x..."
                      value={txHash}
                      onChange={(e) => setTxHash(e.target.value)}
                    />
                  </div>

                  <Button
                    onClick={verifyTransaction}
                    disabled={verifying || !txHash}
                    className="w-full"
                  >
                    {verifying ? 'Verifying...' : 'Verify Transaction'}
                  </Button>

                  <div className="text-sm text-muted-foreground">
                    <p className="font-medium">Point Values:</p>
                    <ul className="list-disc list-inside space-y-1 mt-1">
                      <li>Supply: 10 points + value bonus</li>
                      <li>Borrow: 15 points + value bonus</li>
                      <li>Repay: 5 points</li>
                      <li>Redeem: 2 points</li>
                    </ul>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Profile Tab */}
        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>My Profile</CardTitle>
              <CardDescription>
                Your stats and transaction history
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!isConnected ? (
                <div className="text-center py-8">
                  <Wallet className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground mb-4">Connect your wallet to view your profile</p>
                  <ConnectWalletButton />
                </div>
              ) : userStats ? (
                <div className="space-y-6">
                  {/* User Stats */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold">{userStats.total_points}</div>
                      <div className="text-sm text-muted-foreground">Total Points</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold">#{userStats.rank || 'Unranked'}</div>
                      <div className="text-sm text-muted-foreground">Rank</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold">{userStats.supply_count}</div>
                      <div className="text-sm text-muted-foreground">Supplies</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold">{userStats.borrow_count}</div>
                      <div className="text-sm text-muted-foreground">Borrows</div>
                    </div>
                  </div>

                  {/* Transaction History */}
                  <div>
                    <h3 className="text-lg font-semibold mb-4">Recent Transactions</h3>
                    {userTransactions.length > 0 ? (
                      <div className="space-y-3">
                        {userTransactions.map((tx) => (
                          <div
                            key={tx.tx_hash}
                            className="flex items-center justify-between p-3 border rounded-lg"
                          >
                            <div className="flex items-center space-x-3">
                              <Badge className={actionColors[tx.action_type]}>
                                {tx.action_type}
                              </Badge>
                              <div>
                                <div className="font-mono text-sm">
                                  {tx.tx_hash.slice(0, 10)}...{tx.tx_hash.slice(-8)}
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  {parseFloat(tx.amount).toFixed(4)} {tx.token_symbol}
                                  {tx.usd_value && !isNaN(Number(tx.usd_value)) && ` ($${Number(tx.usd_value).toFixed(2)})`}
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="font-semibold">+{tx.points_awarded}</div>
                              <div className="text-sm text-muted-foreground">points</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        No transactions verified yet. Start using the protocol to earn points!
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No profile data found. Start using the protocol to create your profile!
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
} 