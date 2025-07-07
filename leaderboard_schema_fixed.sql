-- Leaderboard Database Schema (Fixed Version)
-- Run this SQL to create the required tables for the leaderboard system

-- Table 1: Leaderboard Users
CREATE TABLE IF NOT EXISTS leaderboard_users (
    wallet_address VARCHAR(62) PRIMARY KEY,
    total_points INTEGER DEFAULT 0 NOT NULL,
    supply_count INTEGER DEFAULT 0 NOT NULL,
    borrow_count INTEGER DEFAULT 0 NOT NULL,
    repay_count INTEGER DEFAULT 0 NOT NULL,
    redeem_count INTEGER DEFAULT 0 NOT NULL,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table 2: Verified Transactions (without foreign key constraint)
CREATE TABLE IF NOT EXISTS verified_transactions (
    id SERIAL PRIMARY KEY,
    wallet_address VARCHAR(62) NOT NULL,
    tx_hash VARCHAR(66) UNIQUE NOT NULL,
    chain_id INTEGER NOT NULL,
    block_number BIGINT NOT NULL,
    action_type VARCHAR(20) NOT NULL CHECK (action_type IN ('supply', 'borrow', 'repay', 'redeem')),
    token_symbol VARCHAR(10),
    amount DECIMAL(36, 18),
    usd_value DECIMAL(20, 2),
    points_awarded INTEGER NOT NULL,
    verified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_valid BOOLEAN DEFAULT true,
    contract_address VARCHAR(62) NOT NULL
    -- No foreign key constraint to allow trigger to create users automatically
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_leaderboard_total_points ON leaderboard_users(total_points DESC);
CREATE INDEX IF NOT EXISTS idx_verified_tx_wallet ON verified_transactions(wallet_address);
CREATE INDEX IF NOT EXISTS idx_verified_tx_chain ON verified_transactions(chain_id);
CREATE INDEX IF NOT EXISTS idx_verified_tx_block ON verified_transactions(block_number);
CREATE INDEX IF NOT EXISTS idx_verified_tx_hash ON verified_transactions(tx_hash);
CREATE INDEX IF NOT EXISTS idx_verified_tx_action ON verified_transactions(action_type);
CREATE INDEX IF NOT EXISTS idx_verified_tx_valid ON verified_transactions(is_valid);

-- Drop existing trigger and function if they exist
DROP TRIGGER IF EXISTS trigger_update_user_stats ON verified_transactions;
DROP FUNCTION IF EXISTS update_user_stats();

-- Create function to update leaderboard_users stats automatically
CREATE OR REPLACE FUNCTION update_user_stats()
RETURNS TRIGGER AS $$
BEGIN
    -- Update user stats when a new verified transaction is added
    IF TG_OP = 'INSERT' THEN
        INSERT INTO leaderboard_users (wallet_address, total_points, supply_count, borrow_count, repay_count, redeem_count, last_updated)
        VALUES (
            NEW.wallet_address,
            NEW.points_awarded,
            CASE WHEN NEW.action_type = 'supply' THEN 1 ELSE 0 END,
            CASE WHEN NEW.action_type = 'borrow' THEN 1 ELSE 0 END,
            CASE WHEN NEW.action_type = 'repay' THEN 1 ELSE 0 END,
            CASE WHEN NEW.action_type = 'redeem' THEN 1 ELSE 0 END,
            CURRENT_TIMESTAMP
        )
        ON CONFLICT (wallet_address) DO UPDATE SET
            total_points = leaderboard_users.total_points + NEW.points_awarded,
            supply_count = leaderboard_users.supply_count + CASE WHEN NEW.action_type = 'supply' THEN 1 ELSE 0 END,
            borrow_count = leaderboard_users.borrow_count + CASE WHEN NEW.action_type = 'borrow' THEN 1 ELSE 0 END,
            repay_count = leaderboard_users.repay_count + CASE WHEN NEW.action_type = 'repay' THEN 1 ELSE 0 END,
            redeem_count = leaderboard_users.redeem_count + CASE WHEN NEW.action_type = 'redeem' THEN 1 ELSE 0 END,
            last_updated = CURRENT_TIMESTAMP;
        RETURN NEW;
    END IF;
    
    -- Handle transaction invalidation
    IF TG_OP = 'UPDATE' AND OLD.is_valid = true AND NEW.is_valid = false THEN
        UPDATE leaderboard_users SET
            total_points = GREATEST(0, total_points - OLD.points_awarded),
            supply_count = GREATEST(0, supply_count - CASE WHEN OLD.action_type = 'supply' THEN 1 ELSE 0 END),
            borrow_count = GREATEST(0, borrow_count - CASE WHEN OLD.action_type = 'borrow' THEN 1 ELSE 0 END),
            repay_count = GREATEST(0, repay_count - CASE WHEN OLD.action_type = 'repay' THEN 1 ELSE 0 END),
            redeem_count = GREATEST(0, redeem_count - CASE WHEN OLD.action_type = 'redeem' THEN 1 ELSE 0 END),
            last_updated = CURRENT_TIMESTAMP
        WHERE wallet_address = OLD.wallet_address;
        RETURN NEW;
    END IF;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create triggers
CREATE OR REPLACE TRIGGER trigger_update_user_stats
    AFTER INSERT OR UPDATE ON verified_transactions
    FOR EACH ROW EXECUTE FUNCTION update_user_stats();

-- Add some helpful views for analytics
CREATE OR REPLACE VIEW leaderboard_with_ranks AS
SELECT 
    wallet_address,
    total_points,
    supply_count,
    borrow_count,
    repay_count,
    redeem_count,
    last_updated,
    created_at,
    ROW_NUMBER() OVER (ORDER BY total_points DESC, created_at ASC) as rank
FROM leaderboard_users 
WHERE total_points > 0
ORDER BY total_points DESC, created_at ASC;

-- Analytics view for chain activity
CREATE OR REPLACE VIEW chain_activity_stats AS
SELECT 
    chain_id,
    COUNT(*) as total_transactions,
    COUNT(DISTINCT wallet_address) as unique_users,
    SUM(points_awarded) as total_points,
    AVG(usd_value) as avg_transaction_value,
    action_type,
    is_valid
FROM verified_transactions
GROUP BY chain_id, action_type, is_valid
ORDER BY chain_id, action_type;

-- Success message
SELECT 'Leaderboard schema updated successfully! Foreign key constraint removed to allow automatic user creation.' as status; 