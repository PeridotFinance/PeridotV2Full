-- Migration: Add stats column to user_profiles_mainnet
-- This column will store pre-computed metrics like streaks, transaction counts, and volumes
-- to avoid expensive on-the-fly calculations during API requests.

ALTER TABLE user_profiles_mainnet 
ADD COLUMN IF NOT EXISTS stats JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Also add to the testnet table for consistency if it exists
DO $$ 
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'user_profiles') THEN
        ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS stats JSONB NOT NULL DEFAULT '{}'::jsonb;
    END IF;
END $$;

-- Create an index for faster JSON queries if we need to filter by stats later
CREATE INDEX IF NOT EXISTS idx_user_profiles_mainnet_stats ON user_profiles_mainnet USING gin (stats);

COMMENT ON COLUMN user_profiles_mainnet.stats IS 'Pre-computed user metrics (streaks, volumes, counts) for leaderboard performance.';

