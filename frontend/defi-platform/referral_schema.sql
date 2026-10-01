-- Referral System Database Schema

-- Table to store referral codes for each user
CREATE TABLE referral_codes (
    id SERIAL PRIMARY KEY,
    user_wallet_address VARCHAR(42) UNIQUE NOT NULL,
    referral_code VARCHAR(20) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table to track referrals (who referred whom)
CREATE TABLE referrals (
    id SERIAL PRIMARY KEY,
    referrer_wallet_address VARCHAR(42) NOT NULL,
    referred_wallet_address VARCHAR(42) NOT NULL,
    referral_code VARCHAR(20) NOT NULL,
    referred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_verified BOOLEAN DEFAULT FALSE,
    
    -- Ensure a user can only be referred once
    UNIQUE(referred_wallet_address),
    
    -- Foreign key constraints
    FOREIGN KEY (referrer_wallet_address) REFERENCES referral_codes(user_wallet_address),
    FOREIGN KEY (referral_code) REFERENCES referral_codes(referral_code)
);

-- Table to track referral rewards/statistics
CREATE TABLE referral_stats (
    id SERIAL PRIMARY KEY,
    user_wallet_address VARCHAR(42) UNIQUE NOT NULL,
    total_referrals INTEGER DEFAULT 0,
    verified_referrals INTEGER DEFAULT 0,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Foreign key constraint
    FOREIGN KEY (user_wallet_address) REFERENCES referral_codes(user_wallet_address)
);

-- Indexes for better performance
CREATE INDEX idx_referral_codes_wallet ON referral_codes(user_wallet_address);
CREATE INDEX idx_referrals_referrer ON referrals(referrer_wallet_address);
CREATE INDEX idx_referrals_referred ON referrals(referred_wallet_address);
CREATE INDEX idx_referrals_code ON referrals(referral_code);

-- Function to generate unique referral codes
CREATE OR REPLACE FUNCTION generate_referral_code(wallet_address VARCHAR(42))
RETURNS VARCHAR(20) AS $$
DECLARE
    code_suffix VARCHAR(20);
    new_code VARCHAR(20);
    code_exists BOOLEAN;
BEGIN
    -- Take last 6 characters of wallet address and add random suffix
    code_suffix := UPPER(RIGHT(wallet_address, 6));
    
    LOOP
        -- Generate a code with wallet suffix + 4 random characters
        new_code := code_suffix || UPPER(substr(md5(random()::text), 1, 4));
        
        -- Check if code already exists
        SELECT EXISTS(SELECT 1 FROM referral_codes WHERE referral_code = new_code) INTO code_exists;
        
        -- If code doesn't exist, break the loop
        IF NOT code_exists THEN
            EXIT;
        END IF;
    END LOOP;
    
    RETURN new_code;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update referral_stats when a new referral is added
CREATE OR REPLACE FUNCTION update_referral_stats()
RETURNS TRIGGER AS $$
BEGIN
    -- Update total referrals count
    INSERT INTO referral_stats (user_wallet_address, total_referrals, verified_referrals)
    VALUES (NEW.referrer_wallet_address, 1, CASE WHEN NEW.is_verified THEN 1 ELSE 0 END)
    ON CONFLICT (user_wallet_address)
    DO UPDATE SET
        total_referrals = referral_stats.total_referrals + 1,
        verified_referrals = CASE 
            WHEN NEW.is_verified THEN referral_stats.verified_referrals + 1
            ELSE referral_stats.verified_referrals
        END,
        last_updated = CURRENT_TIMESTAMP;
    
    -- Award 100 leaderboard points for the referral
    INSERT INTO leaderboard_users (wallet_address, total_points, last_updated)
    VALUES (NEW.referrer_wallet_address, 100, CURRENT_TIMESTAMP)
    ON CONFLICT (wallet_address)
    DO UPDATE SET
        total_points = leaderboard_users.total_points + 100,
        last_updated = CURRENT_TIMESTAMP;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
CREATE TRIGGER trigger_update_referral_stats
    AFTER INSERT ON referrals
    FOR EACH ROW
    EXECUTE FUNCTION update_referral_stats();

-- Trigger to update stats when referral verification status changes
CREATE OR REPLACE FUNCTION update_verification_stats()
RETURNS TRIGGER AS $$
BEGIN
    -- Only proceed if is_verified status changed
    IF OLD.is_verified != NEW.is_verified THEN
        UPDATE referral_stats
        SET verified_referrals = verified_referrals + CASE WHEN NEW.is_verified THEN 1 ELSE -1 END,
            last_updated = CURRENT_TIMESTAMP
        WHERE user_wallet_address = NEW.referrer_wallet_address;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create verification update trigger
CREATE TRIGGER trigger_update_verification_stats
    AFTER UPDATE ON referrals
    FOR EACH ROW
    EXECUTE FUNCTION update_verification_stats(); 