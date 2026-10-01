-- Migration: Create tables for Solana Trading Challenge
-- This handles caching data from Solana Tracker API

-- Track individual trades for eligibility check (3h hold rule)
CREATE TABLE IF NOT EXISTS solana_trading_trades (
    signature TEXT PRIMARY KEY,
    wallet_address TEXT NOT NULL,
    token_mint TEXT NOT NULL,
    transaction_type TEXT NOT NULL, -- 'buy' or 'sell'
    amount NUMERIC NOT NULL,
    usd_value NUMERIC NOT NULL,
    block_time BIGINT NOT NULL, -- Unix timestamp in milliseconds
    is_eligible BOOLEAN DEFAULT TRUE,
    processed_for_rewards BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Aggregated stats for the dashboard and leaderboard
CREATE TABLE IF NOT EXISTS solana_trading_stats (
    wallet_address TEXT PRIMARY KEY,
    token_mint TEXT NOT NULL,
    total_volume_usd NUMERIC DEFAULT 0,
    buy_volume_usd NUMERIC DEFAULT 0,
    sell_volume_usd NUMERIC DEFAULT 0,
    eligible_volume_usd NUMERIC DEFAULT 0,
    pending_rewards NUMERIC DEFAULT 0,
    is_registered BOOLEAN DEFAULT FALSE,
    joined_at TIMESTAMP,
    current_balance NUMERIC DEFAULT 0,
    rank INTEGER,
    avg_hold_hours NUMERIC,
    last_trade_at TIMESTAMP,
    last_synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Global stats for the challenge
CREATE TABLE IF NOT EXISTS solana_trading_challenge_config (
    token_mint TEXT PRIMARY KEY,
    total_volume_usd NUMERIC DEFAULT 0,
    total_rewards_paid NUMERIC DEFAULT 0,
    participant_count INTEGER DEFAULT 0,
    reward_rate NUMERIC DEFAULT 1, -- $1 reward
    volume_threshold NUMERIC DEFAULT 500, -- per $500 volume
    hold_threshold_hours INTEGER DEFAULT 3,
    last_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_solana_trading_trades_wallet ON solana_trading_trades(wallet_address);
CREATE INDEX IF NOT EXISTS idx_solana_trading_trades_token ON solana_trading_trades(token_mint);
CREATE INDEX IF NOT EXISTS idx_solana_trading_stats_volume ON solana_trading_stats(eligible_volume_usd DESC);
CREATE INDEX IF NOT EXISTS idx_solana_trading_stats_registered_rewards ON solana_trading_stats(token_mint, is_registered, pending_rewards DESC);
CREATE INDEX IF NOT EXISTS idx_trades_hold_calc ON solana_trading_trades (wallet_address, token_mint, transaction_type, block_time);



