-- Database optimization indexes for LevelPill performance
-- Run these to improve query performance

-- Composite index for time-based transaction queries (most important)
CREATE INDEX IF NOT EXISTS idx_verified_tx_wallet_time_valid 
ON verified_transactions(wallet_address, verified_at DESC, is_valid);

-- Composite index for transaction stats by type
CREATE INDEX IF NOT EXISTS idx_verified_tx_wallet_action_valid 
ON verified_transactions(wallet_address, action_type, is_valid);

-- Index for user_profiles JOIN (if not exists)
CREATE INDEX IF NOT EXISTS idx_user_profiles_wallet 
ON user_profiles(wallet_address);

-- Index for daily logins by wallet and date
CREATE INDEX IF NOT EXISTS idx_daily_logins_wallet_date 
ON daily_logins(wallet_address, login_date DESC);

-- Index for referral stats
CREATE INDEX IF NOT EXISTS idx_referral_stats_user 
ON referral_stats(user_wallet_address);

-- Index for referrals by referrer
CREATE INDEX IF NOT EXISTS idx_referrals_referrer 
ON referrals(referrer_wallet_address);

-- Composite index for leaderboard ranking queries
CREATE INDEX IF NOT EXISTS idx_leaderboard_points_created 
ON leaderboard_users(total_points DESC, created_at ASC);

-- Index for period-based queries (if using date ranges)
CREATE INDEX IF NOT EXISTS idx_verified_tx_verified_at 
ON verified_transactions(verified_at DESC);





