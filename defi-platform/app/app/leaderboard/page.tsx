import { Metadata } from 'next'
import WalletIntegratedLeaderboard from '@/components/leaderboard/WalletIntegratedLeaderboard'

export const metadata: Metadata = {
  title: 'Leaderboard | Peridot Protocol',
  description: 'Compete with other users and earn points for interacting with the Peridot lending & borrowing protocol across multiple chains.',
  keywords: ['DeFi', 'leaderboard', 'lending', 'borrowing', 'points', 'gamification', 'multi-chain'],
}

export default function LeaderboardPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-background/80">
      <WalletIntegratedLeaderboard />
    </div>
  )
} 