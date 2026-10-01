-- TVL Cache Table
-- Stores cached Total Value Locked for each chain to avoid rate limiting

CREATE TABLE IF NOT EXISTS tvl_cache (
    id SERIAL PRIMARY KEY,
    chain_id INTEGER NOT NULL UNIQUE,
    total_tvl DECIMAL(20, 2) NOT NULL DEFAULT 0,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast lookups by chain_id
CREATE INDEX IF NOT EXISTS idx_tvl_cache_chain_id ON tvl_cache(chain_id);

-- Index for ordering by update time
CREATE INDEX IF NOT EXISTS idx_tvl_cache_last_updated ON tvl_cache(last_updated DESC);

-- Insert initial records for supported chains (Monad testnet: 10143, BSC testnet: 97)
INSERT INTO tvl_cache (chain_id, total_tvl) 
VALUES (10143, 0), (97, 0)
ON CONFLICT (chain_id) DO NOTHING; 