-- Daily Login System Database Schema
-- Run this SQL to add daily login tracking to the leaderboard system

-- Table for tracking daily logins
CREATE TABLE IF NOT EXISTS daily_logins (
    id SERIAL PRIMARY KEY,
    wallet_address VARCHAR(62) NOT NULL,
    login_date DATE NOT NULL DEFAULT CURRENT_DATE,
    points_awarded INTEGER DEFAULT 20 NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Ensure one login per day per wallet
    UNIQUE(wallet_address, login_date)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_daily_logins_wallet ON daily_logins(wallet_address);
CREATE INDEX IF NOT EXISTS idx_daily_logins_date ON daily_logins(login_date);
CREATE INDEX IF NOT EXISTS idx_daily_logins_wallet_date ON daily_logins(wallet_address, login_date);

-- Create a view for login streak tracking
CREATE OR REPLACE VIEW user_login_streaks AS
WITH daily_login_data AS (
    SELECT 
        wallet_address,
        login_date,
        ROW_NUMBER() OVER (PARTITION BY wallet_address ORDER BY login_date) as rn,
        login_date - INTERVAL '1 day' * ROW_NUMBER() OVER (PARTITION BY wallet_address ORDER BY login_date) as group_date
    FROM daily_logins
    ORDER BY wallet_address, login_date
),
streak_groups AS (
    SELECT 
        wallet_address,
        group_date,
        COUNT(*) as streak_length,
        MIN(login_date) as streak_start,
        MAX(login_date) as streak_end
    FROM daily_login_data
    GROUP BY wallet_address, group_date
),
current_streaks AS (
    SELECT 
        wallet_address,
        streak_length,
        streak_start,
        streak_end,
        ROW_NUMBER() OVER (PARTITION BY wallet_address ORDER BY streak_end DESC) as rn
    FROM streak_groups
)
SELECT 
    wallet_address,
    streak_length as current_streak,
    streak_start,
    streak_end,
    CASE 
        WHEN streak_end = CURRENT_DATE OR streak_end = CURRENT_DATE - INTERVAL '1 day' 
        THEN streak_length 
        ELSE 0 
    END as active_streak
FROM current_streaks 
WHERE rn = 1;

-- Function to check if user is eligible for daily login bonus
CREATE OR REPLACE FUNCTION is_eligible_for_daily_login(user_wallet VARCHAR(62))
RETURNS BOOLEAN AS $$
DECLARE
    last_login_date DATE;
BEGIN
    -- Get the most recent login date for the user
    SELECT login_date INTO last_login_date
    FROM daily_logins 
    WHERE wallet_address = user_wallet 
    ORDER BY login_date DESC 
    LIMIT 1;
    
    -- If no previous login or last login was before today, user is eligible
    RETURN (last_login_date IS NULL OR last_login_date < CURRENT_DATE);
END;
$$ LANGUAGE plpgsql;

-- Function to award daily login bonus
CREATE OR REPLACE FUNCTION award_daily_login_bonus(user_wallet VARCHAR(62))
RETURNS TABLE(awarded BOOLEAN, points INTEGER, message TEXT) AS $$
DECLARE
    daily_points INTEGER := 20;
    login_exists BOOLEAN;
BEGIN
    -- Check if user already claimed today's bonus
    SELECT EXISTS(
        SELECT 1 FROM daily_logins 
        WHERE wallet_address = user_wallet 
        AND login_date = CURRENT_DATE
    ) INTO login_exists;
    
    IF login_exists THEN
        RETURN QUERY SELECT FALSE, 0, 'Already claimed today''s login bonus';
        RETURN;
    END IF;
    
    -- Insert daily login record
    INSERT INTO daily_logins (wallet_address, login_date, points_awarded)
    VALUES (user_wallet, CURRENT_DATE, daily_points);
    
    -- Add points to user's total (creating user if doesn't exist)
    INSERT INTO leaderboard_users (wallet_address, total_points, last_updated)
    VALUES (user_wallet, daily_points, CURRENT_TIMESTAMP)
    ON CONFLICT (wallet_address) DO UPDATE SET
        total_points = leaderboard_users.total_points + daily_points,
        last_updated = CURRENT_TIMESTAMP;
    
    RETURN QUERY SELECT TRUE, daily_points, 'Daily login bonus awarded successfully';
END;
$$ LANGUAGE plpgsql;

-- Add comments for documentation
COMMENT ON TABLE daily_logins IS 'Tracks daily login bonuses for users';
COMMENT ON COLUMN daily_logins.wallet_address IS 'User wallet address (lowercase)';
COMMENT ON COLUMN daily_logins.login_date IS 'Date of login bonus claim';
COMMENT ON COLUMN daily_logins.points_awarded IS 'Points awarded for this login (default 20)';
COMMENT ON FUNCTION is_eligible_for_daily_login(VARCHAR) IS 'Check if user can claim today''s login bonus';
COMMENT ON FUNCTION award_daily_login_bonus(VARCHAR) IS 'Award daily login bonus to user if eligible';

-- Success message
SELECT 'Daily login system schema created successfully!' as status; 