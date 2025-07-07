/**
 * Fix leaderboard database schema
 * Run with: node scripts/fix-leaderboard-schema.js
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

async function fixLeaderboardSchema() {
  console.log('🔧 Fixing Leaderboard Database Schema...\n')

  try {
    // Step 1: Drop foreign key constraint if it exists
    console.log('1. Removing foreign key constraint...')
    
    await sql`
      ALTER TABLE verified_transactions 
      DROP CONSTRAINT IF EXISTS verified_transactions_wallet_address_fkey
    `
    console.log('✅ Foreign key constraint removed')

    // Step 2: Drop existing trigger and function
    console.log('\n2. Updating trigger function...')
    
    await sql`DROP TRIGGER IF EXISTS trigger_update_user_stats ON verified_transactions`
    await sql`DROP FUNCTION IF EXISTS update_user_stats()`
    
    // Step 3: Create improved trigger function
    await sql`
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
      $$ LANGUAGE plpgsql
    `

    // Step 4: Create trigger
    await sql`
      CREATE TRIGGER trigger_update_user_stats
          AFTER INSERT OR UPDATE ON verified_transactions
          FOR EACH ROW EXECUTE FUNCTION update_user_stats()
    `
    
    console.log('✅ Trigger function updated')

    // Step 5: Create helpful views
    console.log('\n3. Creating analytics views...')
    
    await sql`
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
      ORDER BY total_points DESC, created_at ASC
    `

    await sql`
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
      ORDER BY chain_id, action_type
    `
    
    console.log('✅ Analytics views created')

    console.log('\n🎉 Database schema fixed successfully!')
    console.log('\nKey changes:')
    console.log('- Removed foreign key constraint to allow automatic user creation')
    console.log('- Updated trigger function with better error handling')
    console.log('- Added GREATEST() functions to prevent negative values')
    console.log('- Created analytics views for better insights')
    
    console.log('\nYou can now run the test script again:')
    console.log('node scripts/test-leaderboard.js')

  } catch (error) {
    console.error('❌ Failed to fix schema:', error.message)
    console.error('\nDetails:', error)
  } finally {
    await sql.end()
  }
}

// Run the fix
fixLeaderboardSchema() 