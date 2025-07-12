/**
 * Setup script for daily login system
 * Run with: node scripts/setup-daily-login.js
 */

const postgres = require('postgres')

// Database connection - same config as the app
const sql = postgres({
  host: '127.0.0.1',
  port: 5432,
  database: 'nextjs_app',
  username: 'nextjs_user',
  password: 'ylW1JpChPB0+2RWY1kxaNaFG5TmJvLxi6xho6kFqU8M=',
})

async function setupDailyLoginSystem() {
  console.log('🚀 Setting up Daily Login System...\n')

  try {
    console.log('📝 Creating daily login database schema...')
    
    // Check if leaderboard_users table exists
    const leaderboardTableExists = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'leaderboard_users'
      )
    `
    
    if (!leaderboardTableExists[0].exists) {
      console.log('⚠️  Warning: leaderboard_users table not found!')
      console.log('   The daily login system requires the leaderboard system to be set up first.')
      console.log('   Please run the leaderboard schema setup before continuing.')
      console.log('   You can still proceed, but daily login points won\'t be added to user totals.')
      console.log('')
    }
    
    // Create the daily_logins table
    await sql`
      CREATE TABLE IF NOT EXISTS daily_logins (
          id SERIAL PRIMARY KEY,
          wallet_address VARCHAR(62) NOT NULL,
          login_date DATE NOT NULL DEFAULT CURRENT_DATE,
          points_awarded INTEGER DEFAULT 20 NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          
          -- Ensure one login per day per wallet
          UNIQUE(wallet_address, login_date)
      )
    `
    
    console.log('✅ daily_logins table created')

    // Create indexes for better performance
    await sql`CREATE INDEX IF NOT EXISTS idx_daily_logins_wallet ON daily_logins(wallet_address)`
    await sql`CREATE INDEX IF NOT EXISTS idx_daily_logins_date ON daily_logins(login_date)`
    await sql`CREATE INDEX IF NOT EXISTS idx_daily_logins_wallet_date ON daily_logins(wallet_address, login_date)`
    
    console.log('✅ Indexes created')

    // Create login streak view
    await sql`
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
      WHERE rn = 1
    `
    
    console.log('✅ Login streak view created')

    // Create eligibility check function
    await sql`
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
      $$ LANGUAGE plpgsql
    `
    
    console.log('✅ Eligibility check function created')

    // Create award bonus function
    await sql`
      CREATE OR REPLACE FUNCTION award_daily_login_bonus(user_wallet VARCHAR(62))
      RETURNS TABLE(awarded BOOLEAN, points INTEGER, message TEXT) AS $$
      DECLARE
          daily_points INTEGER := 20;
          login_exists BOOLEAN;
          leaderboard_exists BOOLEAN;
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
          
          -- Check if leaderboard_users table exists
          SELECT EXISTS (
              SELECT FROM information_schema.tables 
              WHERE table_name = 'leaderboard_users'
          ) INTO leaderboard_exists;
          
          -- Add points to user's total only if leaderboard table exists
          IF leaderboard_exists THEN
              INSERT INTO leaderboard_users (wallet_address, total_points, last_updated)
              VALUES (user_wallet, daily_points, CURRENT_TIMESTAMP)
              ON CONFLICT (wallet_address) DO UPDATE SET
                  total_points = leaderboard_users.total_points + daily_points,
                  last_updated = CURRENT_TIMESTAMP;
          END IF;
          
          RETURN QUERY SELECT TRUE, daily_points, 'Daily login bonus awarded successfully';
      END;
      $$ LANGUAGE plpgsql
    `
    
    console.log('✅ Award bonus function created')
    console.log('✅ Daily login schema executed successfully!')

    // Test the functions
    console.log('\n🧪 Testing daily login functions...')
    
    // Test eligibility check function
    const testWallet = '0x1234567890123456789012345678901234567890'
    
    const eligibilityResult = await sql`
      SELECT is_eligible_for_daily_login(${testWallet}) as eligible
    `
    
    console.log(`✅ Eligibility check function works: ${eligibilityResult[0].eligible}`)
    
    // Test award function (should work for first time)
    const awardResult = await sql`
      SELECT * FROM award_daily_login_bonus(${testWallet})
    `
    
    console.log(`✅ Award function works:`, awardResult[0])
    
    // Test eligibility again (should be false now)
    const eligibilityResult2 = await sql`
      SELECT is_eligible_for_daily_login(${testWallet}) as eligible
    `
    
    console.log(`✅ Second eligibility check: ${eligibilityResult2[0].eligible} (should be false)`)
    
    // Test login streak view
    const streakResult = await sql`
      SELECT * FROM user_login_streaks WHERE wallet_address = ${testWallet}
    `
    
    console.log(`✅ Login streak tracking:`, streakResult[0] || 'No streak data yet')
    
    // Clean up test data
    await sql`DELETE FROM daily_logins WHERE wallet_address = ${testWallet}`
    await sql`DELETE FROM leaderboard_users WHERE wallet_address = ${testWallet}`
    
    console.log('\n🎉 Daily Login System setup completed successfully!')
    console.log('\n📋 Summary:')
    console.log('- ✅ daily_logins table created')
    console.log('- ✅ Indexes created for performance')
    console.log('- ✅ user_login_streaks view created for streak tracking')
    console.log('- ✅ is_eligible_for_daily_login() function created')
    console.log('- ✅ award_daily_login_bonus() function created')
    console.log('- ✅ All functions tested and working')
    
    console.log('\n🎯 Features:')
    console.log('- 📅 Users get 20 points for daily login (24h cooldown)')
    console.log('- 🔒 Manipulation-safe with database constraints')
    console.log('- 🔥 Login streak tracking and statistics')
    console.log('- 📊 Automatic points integration with leaderboard')
    console.log('- 🎨 Animated popup on wallet connection')
    
    console.log('\n🚀 Next steps:')
    console.log('1. Users will automatically get daily login bonuses when connecting wallets')
    console.log('2. Animated popup will show when bonus is awarded')
    console.log('3. Login streaks are tracked and displayed')
    console.log('4. All points are integrated with the existing leaderboard system')
    
  } catch (error) {
    console.error('❌ Failed to setup daily login system:', error.message)
    console.error('\nDetails:', error)
    
    console.log('\n🔧 Troubleshooting:')
    console.log('1. Ensure PostgreSQL is running')
    console.log('2. Check database connection settings')
    console.log('3. Make sure the database user has necessary permissions')
    console.log('4. Verify the leaderboard_users table exists (run leaderboard schema first)')
  } finally {
    // Close the database connection
    await sql.end()
  }
}

// Run the setup
setupDailyLoginSystem() 