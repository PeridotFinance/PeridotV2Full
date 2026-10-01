// ─── Demo Mode — Centralized Mock Data ────────────────────────────────────────
// Single source of truth for all fake data shown to wallet-less users.
// Import from here in all easy pages — never scatter mock data in page files.

// ── Positions ─────────────────────────────────────────────────────────────────

export const DEMO_POSITIONS = [
  {
    assetId: "usdc",
    chainId: 8453,
    symbol: "USDC",
    chainName: "Base",
    icon: "/tokenimages/app/usd-coin-usdc-logo.svg",
    suppliedBalance: 2450,
    suppliedValueUSD: 2450,
    borrowedBalance: 0,
    borrowedValueUSD: 0,
    priceUSD: 1,
  },
  {
    assetId: "eth",
    chainId: 42161,
    symbol: "ETH",
    chainName: "Arbitrum",
    icon: "/tokenimages/app/ethereum-eth-logo.svg",
    suppliedBalance: 0.85,
    suppliedValueUSD: 2618,
    borrowedBalance: 0,
    borrowedValueUSD: 0,
    priceUSD: 3080,
  },
  {
    assetId: "usdc",
    chainId: 1,
    symbol: "USDC",
    chainName: "Ethereum",
    icon: "/tokenimages/app/usd-coin-usdc-logo.svg",
    suppliedBalance: 800,
    suppliedValueUSD: 800,
    borrowedBalance: 0,
    borrowedValueUSD: 0,
    priceUSD: 1,
  },
]

export const DEMO_TOTAL_SUPPLIED = DEMO_POSITIONS.reduce((s, p) => s + p.suppliedValueUSD, 0)

// ── Borrows (used by BorrowSection empty/active states in demo mode) ─────────
// Kept empty by default so the demo landing shows the "no active loans" empty
// state. Flip to the sample entry below to exercise the repay flow.

export const DEMO_BORROWS: typeof DEMO_POSITIONS = []

export const DEMO_BORROWS_SAMPLE = [
  {
    assetId: "usdc",
    chainId: 8453,
    symbol: "USDC",
    chainName: "Base",
    icon: "/tokenimages/app/usd-coin-usdc-logo.svg",
    suppliedBalance: 0,
    suppliedValueUSD: 0,
    borrowedBalance: 500,
    borrowedValueUSD: 500,
    priceUSD: 1,
  },
]

// ── APY Data ──────────────────────────────────────────────────────────────────

export const DEMO_APY_DATA: Record<number, Record<string, { supplyApy: number; borrowApy: number }>> = {
  8453:  { usdc: { supplyApy: 5.2, borrowApy: 6.8 } },
  42161: { eth:  { supplyApy: 3.4, borrowApy: 4.2 } },
  1:     { usdc: { supplyApy: 4.8, borrowApy: 6.1 } },
}

// ── Transactions ──────────────────────────────────────────────────────────────

export interface DemoTxRow {
  tx_hash: string
  action_type: string
  token_symbol: string
  amount: string
  usd_value: string
  points_awarded: number
  verified_at: string
  chain_id: number
}

export const DEMO_TRANSACTIONS: DemoTxRow[] = [
  {
    tx_hash: "0xdemo_a1b2c3d4",
    action_type: "supply",
    token_symbol: "USDC",
    amount: "800",
    usd_value: "800.00",
    points_awarded: 80,
    verified_at: "2026-03-14T09:22:00Z",
    chain_id: 1,
  },
  {
    tx_hash: "0xdemo_f6g7h8i9",
    action_type: "supply",
    token_symbol: "ETH",
    amount: "0.43",
    usd_value: "1324.40",
    points_awarded: 132,
    verified_at: "2026-02-28T14:05:00Z",
    chain_id: 42161,
  },
  {
    tx_hash: "0xdemo_k1l2m3n4",
    action_type: "cross-chain_supply",
    token_symbol: "USDC",
    amount: "500",
    usd_value: "500.00",
    points_awarded: 50,
    verified_at: "2026-02-11T11:30:00Z",
    chain_id: 8453,
  },
  {
    tx_hash: "0xdemo_p6q7r8s9",
    action_type: "repay",
    token_symbol: "USDC",
    amount: "310",
    usd_value: "310.00",
    points_awarded: 31,
    verified_at: "2026-01-22T16:44:00Z",
    chain_id: 8453,
  },
  {
    tx_hash: "0xdemo_u1v2w3x4",
    action_type: "borrow",
    token_symbol: "USDC",
    amount: "300",
    usd_value: "300.00",
    points_awarded: 0,
    verified_at: "2026-01-18T10:15:00Z",
    chain_id: 8453,
  },
  {
    tx_hash: "0xdemo_z6a7b8c9",
    action_type: "supply",
    token_symbol: "USDC",
    amount: "1950",
    usd_value: "1950.00",
    points_awarded: 195,
    verified_at: "2026-01-05T08:00:00Z",
    chain_id: 8453,
  },
  {
    tx_hash: "0xdemo_enter_mkt",
    action_type: "enter_markets",
    token_symbol: "USDC",
    amount: "0",
    usd_value: "0",
    points_awarded: 100,
    verified_at: "2025-12-20T12:00:00Z",
    chain_id: 8453,
  },
]

// ── User / Profile ────────────────────────────────────────────────────────────

export const DEMO_USER = {
  address: "0xde000000000000000000000000000000000000m0" as `0x${string}`,
  initials: "DM",
  displayLabel: "Demo Account",
  loginMethod: "Exploring without wallet",
}
