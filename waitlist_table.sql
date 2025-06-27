-- Waitlist Members Table for Peridot DeFi Platform
-- Database: nextjs_app

-- Create the waitlist_members table
CREATE TABLE IF NOT EXISTS waitlist_members (
    id SERIAL PRIMARY KEY,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    role VARCHAR(50) NOT NULL CHECK (role IN ('developer', 'trader', 'investor', 'defi-user', 'institution', 'other')),
    company VARCHAR(255), -- Optional field
    expected_usage VARCHAR(50) NOT NULL CHECK (expected_usage IN ('lending', 'borrowing', 'both', 'integration', 'research', 'trading')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_waitlist_email ON waitlist_members(email);
CREATE INDEX IF NOT EXISTS idx_waitlist_role ON waitlist_members(role);
CREATE INDEX IF NOT EXISTS idx_waitlist_expected_usage ON waitlist_members(expected_usage);
CREATE INDEX IF NOT EXISTS idx_waitlist_created_at ON waitlist_members(created_at);

-- Create a trigger to automatically update the updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_waitlist_members_updated_at 
    BEFORE UPDATE ON waitlist_members 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE waitlist_members IS 'Stores waitlist signups for the Peridot DeFi platform';
COMMENT ON COLUMN waitlist_members.id IS 'Primary key, auto-incrementing';
COMMENT ON COLUMN waitlist_members.first_name IS 'User first name';
COMMENT ON COLUMN waitlist_members.last_name IS 'User last name';
COMMENT ON COLUMN waitlist_members.email IS 'User email address, must be unique';
COMMENT ON COLUMN waitlist_members.role IS 'User role: developer, trader, investor, defi-user, institution, or other';
COMMENT ON COLUMN waitlist_members.company IS 'Optional company/organization name';
COMMENT ON COLUMN waitlist_members.expected_usage IS 'How user plans to use Peridot: lending, borrowing, both, integration, research, or trading';
COMMENT ON COLUMN waitlist_members.created_at IS 'Timestamp when record was created';
COMMENT ON COLUMN waitlist_members.updated_at IS 'Timestamp when record was last updated';

-- Sample query to check table structure
-- SELECT column_name, data_type, is_nullable, column_default 
-- FROM information_schema.columns 
-- WHERE table_name = 'waitlist_members' 
-- ORDER BY ordinal_position;

-- Sample query to view waitlist statistics
-- SELECT 
--     role,
--     expected_usage,
--     COUNT(*) as count,
--     DATE(created_at) as signup_date
-- FROM waitlist_members 
-- GROUP BY role, expected_usage, DATE(created_at)
-- ORDER BY signup_date DESC, count DESC; 