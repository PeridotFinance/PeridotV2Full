export type GuideSection = {
  id: string
  title: string
  summary: string
  points: string[]
}

export const guideSections: GuideSection[] = [
  {
    id: 'intro',
    title: 'What the App Does',
    summary: 'Supply assets to earn APY, borrow against collateral for strategies, and climb the leaderboard with achievements.',
    points: [
      'Connect your wallet to start',
      'Supply tokens to earn interest (APY)',
      'Borrow against your supplied collateral',
      'Complete actions to earn points and achievements',
    ],
  },
  {
    id: 'inputs',
    title: 'Input Fields',
    summary: 'All actions use familiar inputs with real-time feedback and validation.',
    points: [
      'Token selector and amount entry',
      'Max buttons for quick fills',
      'USD estimates and slippage/risk hints',
    ],
  },
  {
    id: 'supply',
    title: 'Supplying & APY',
    summary: 'Supply assets to earn base APY plus potential rewards APY.',
    points: [
      'Earn passive yield on supplied balances',
      'Rewards APY may vary by market',
      'Withdraw anytime subject to liquidity',
    ],
  },
  {
    id: 'borrow',
    title: 'Borrowing & Hedging',
    summary: 'Borrow against collateral for leverage, hedging, or market-neutral strategies.',
    points: [
      'Health factor shows your safety buffer',
      'Borrow costs vs. rewards determine net APY',
      'Repay anytime to reduce risk and interest',
    ],
  },
  {
    id: 'repay',
    title: 'Repay & Redeem',
    summary: 'Repay borrowed amounts to lower utilization and improve health. Redeem supplied assets as liquidity allows.',
    points: [
      'Repay to lower borrow costs',
      'Redeem supplied assets when you need liquidity',
      'Avoid liquidation by keeping health strong',
    ],
  },
  {
    id: 'leaderboard',
    title: 'Points, Achievements & Leaderboard',
    summary: 'Your actions earn points. Hit milestones to unlock achievements and rise in the rankings.',
    points: [
      'Supply, borrow, and manage to earn points',
      'Achievements celebrate milestone actions',
      'Leaderboard showcases top performers',
    ],
  },
]


