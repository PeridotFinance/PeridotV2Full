// Centralized resolver for physical table and function names based on network preset

type TableNames = {
  apyLatest: string
  apyTimeSeries: string
  leaderboardUsers: string
  verifiedTransactions: string
  dailyLogins: string
  userLoginStats: string
  dashboardStatsCache: string
  tvlCache: string
  userProfiles: string
  referrals: string
  userBalanceSnapshots: string
  userPortfolioApySnapshots: string
  // Per-day USD portfolio value per user — the real time series behind the
  // Easy-mode chart (written on every successful live read).
  portfolioValueSnapshots: string
  userEarningsCache: string
  leaderboardRanks: string
  leaderboardAccountsMv: string
  mvRefreshLog: string
  referralStats: string
  referralCodes: string
  // function identifiers
  fnIsEligibleForDailyLogin: string
  fnAwardDailyLoginBonus: string
  userSecretRedemptions: string
  peridotAccounts: string
  accountWalletLinks: string
  walletLinkChallenges: string
  seasonArchive: string
  // market data
  marketDetailsSnapshots: string
  assetMetrics: string
  assetMetricsLatest: string
  marketTotalsCache: string
  // claim & boost system
  boostConfig: string
  premiumUsers: string
  boostClaims: string
  // Bridge.xyz fiat on-ramp — real-money, mainnet-only; names are not suffixed.
  bridgeCustomers: string
  bridgeVirtualAccounts: string
  bridgeTransferEvents: string
  bridgePayouts: string
  // Bridge.xyz fiat off-ramp (EURC → SEPA). `bridgePayouts` above is the
  // on-ramp's crypto tail, not a fiat payout — these are the cash-out tables.
  bridgeExternalAccounts: string
  bridgeLiquidationAddresses: string
  bridgeCashouts: string
  // Meld (Privy) card on-ramp settlement events — mainnet-only, not suffixed.
  meldOnrampEvents: string
  marginPoints: string
}

function getNetworkPreset(): string {
  const preset = process.env.NEXT_PUBLIC_NETWORK_PRESET || 'testnet'
  return preset
}

export function getTableNames(): TableNames {
  const preset = getNetworkPreset()

  // Default (testnet/dev) canonical names
  const base: TableNames = {
    apyLatest: 'apy_latest',
    apyTimeSeries: 'apy_time_series',
    leaderboardUsers: 'leaderboard_users',
    verifiedTransactions: 'verified_transactions',
    dailyLogins: 'daily_logins',
    userLoginStats: 'user_login_streaks',
    dashboardStatsCache: 'dashboard_stats_cache',
    tvlCache: 'tvl_cache',
    userProfiles: 'user_profiles',
    referrals: 'referrals',
    userBalanceSnapshots: 'user_balance_snapshots',
    userPortfolioApySnapshots: 'user_portfolio_apy_snapshots',
    portfolioValueSnapshots: 'portfolio_value_snapshots',
    userEarningsCache: 'user_earnings_cache',
    leaderboardRanks: 'leaderboard_ranks',
    leaderboardAccountsMv: 'leaderboard_accounts_mv',
    mvRefreshLog: 'mv_refresh_log',
    referralStats: 'referral_stats',
    referralCodes: 'referral_codes',
    fnIsEligibleForDailyLogin: 'is_eligible_for_daily_login',
    fnAwardDailyLoginBonus: 'award_daily_login_bonus',
    userSecretRedemptions: 'user_secret_redemptions',
    peridotAccounts: 'peridot_accounts',
    accountWalletLinks: 'account_wallet_links',
    walletLinkChallenges: 'wallet_link_challenges',
    seasonArchive: 'leaderboard_season_archive',
    marketDetailsSnapshots: 'market_details_snapshots',
    assetMetrics: 'asset_metrics',
    assetMetricsLatest: 'asset_metrics_latest',
    marketTotalsCache: 'market_totals_cache',
    boostConfig: 'boost_config',
    premiumUsers: 'premium_users',
    boostClaims: 'boost_claims',
    bridgeCustomers: 'bridge_customers',
    bridgeVirtualAccounts: 'bridge_virtual_accounts',
    bridgeTransferEvents: 'bridge_transfer_events',
    bridgePayouts: 'bridge_payouts',
    bridgeExternalAccounts: 'bridge_external_accounts',
    bridgeLiquidationAddresses: 'bridge_liquidation_addresses',
    bridgeCashouts: 'bridge_cashouts',
    meldOnrampEvents: 'meld_onramp_events',
    marginPoints: 'margin_points',
  }

  const isMainnet = typeof preset === 'string' && preset.toLowerCase().startsWith('mainnet')
  if (isMainnet) {
    return {
      apyLatest: 'apy_latest_mainnet',
      apyTimeSeries: 'apy_time_series_mainnet',
      leaderboardUsers: 'leaderboard_users_mainnet',
      verifiedTransactions: 'verified_transactions_mainnet',
      dailyLogins: 'daily_logins_mainnet',
      userLoginStats: 'user_login_streaks_mainnet',
      dashboardStatsCache: 'dashboard_stats_cache_mainnet',
      tvlCache: 'tvl_cache_mainnet',
      userProfiles: 'user_profiles_mainnet',
      referrals: 'referrals_mainnet',
      userBalanceSnapshots: 'user_balance_snapshots_mainnet',
      userPortfolioApySnapshots: 'user_portfolio_apy_snapshots_mainnet',
      portfolioValueSnapshots: 'portfolio_value_snapshots_mainnet',
      userEarningsCache: 'user_earnings_cache_mainnet',
      leaderboardRanks: 'leaderboard_ranks_mainnet',
      leaderboardAccountsMv: 'leaderboard_accounts_mv_mainnet',
      mvRefreshLog: 'mv_refresh_log',
      referralStats: 'referral_stats_mainnet',
      referralCodes: 'referral_codes_mainnet',
      fnIsEligibleForDailyLogin: 'is_eligible_for_daily_login_mainnet',
      fnAwardDailyLoginBonus: 'award_daily_login_bonus_mainnet',
      userSecretRedemptions: 'user_secret_redemptions_mainnet',
      peridotAccounts: 'peridot_accounts_mainnet',
      accountWalletLinks: 'account_wallet_links_mainnet',
      walletLinkChallenges: 'wallet_link_challenges_mainnet',
      seasonArchive: 'leaderboard_season_archive_mainnet',
      marketDetailsSnapshots: 'market_details_snapshots_mainnet',
      assetMetrics: 'asset_metrics_mainnet',
      assetMetricsLatest: 'asset_metrics_latest_mainnet',
      marketTotalsCache: 'market_totals_cache_mainnet',
      boostConfig: 'boost_config_mainnet',
      premiumUsers: 'premium_users_mainnet',
      boostClaims: 'boost_claims_mainnet',
      // Fiat on-ramp tables are mainnet-only by nature — no suffix split.
      bridgeCustomers: 'bridge_customers',
      bridgeVirtualAccounts: 'bridge_virtual_accounts',
      bridgeTransferEvents: 'bridge_transfer_events',
      bridgePayouts: 'bridge_payouts',
      bridgeExternalAccounts: 'bridge_external_accounts',
      bridgeLiquidationAddresses: 'bridge_liquidation_addresses',
      bridgeCashouts: 'bridge_cashouts',
      meldOnrampEvents: 'meld_onramp_events',
      marginPoints: 'margin_points_mainnet',
    }
  }

  return base
}

export type { TableNames }

