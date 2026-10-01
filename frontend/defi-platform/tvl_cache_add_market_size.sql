-- Migration: Add total_market_size column to tvl_cache tables
-- This column stores the total market size (total supplies + total borrows) in USD

-- Add column to testnet table
ALTER TABLE tvl_cache 
ADD COLUMN IF NOT EXISTS total_market_size DECIMAL(20, 2) NOT NULL DEFAULT 0;

-- Add column to mainnet table
ALTER TABLE tvl_cache_mainnet 
ADD COLUMN IF NOT EXISTS total_market_size DECIMAL(20, 2) NOT NULL DEFAULT 0;

-- Update existing records to set total_market_size = total_tvl (same value initially)
UPDATE tvl_cache SET total_market_size = total_tvl WHERE total_market_size = 0;
UPDATE tvl_cache_mainnet SET total_market_size = total_tvl WHERE total_market_size = 0;

