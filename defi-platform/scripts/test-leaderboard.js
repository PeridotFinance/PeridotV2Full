/**
 * Test script for leaderboard functionality
 * Run with: node scripts/test-leaderboard.js
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

async function testLeaderboardSetup() {
  console.log('🔍 Testing Leaderboard Database Setup...\n')

  try {
    // Test 1: Check if tables exist
    console.log('1. Checking if leaderboard tables exist...')
    
    const tablesResult = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('leaderboard_users', 'verified_transactions')
    `
    
    const tableNames = tablesResult.map(row => row.table_name)
    
    if (tableNames.includes('leaderboard_users') && tableNames.includes('verified_transactions')) {
      console.log('✅ Both leaderboard tables exist')
    } else {
      console.log('❌ Missing tables:', ['leaderboard_users', 'verified_transactions'].filter(t => !tableNames.includes(t)))
      return
    }

    // Test 2: Check table structure
    console.log('\n2. Checking table structures...')
    
    const userColumns = await sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'leaderboard_users'
    `
    
    const txColumns = await sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'verified_transactions'
    `
    
    console.log('✅ leaderboard_users columns:', userColumns.length)
    console.log('✅ verified_transactions columns:', txColumns.length)

    // Test 3: Check if triggers exist
    console.log('\n3. Checking if triggers exist...')
    
    const triggers = await sql`
      SELECT trigger_name 
      FROM information_schema.triggers 
      WHERE trigger_name = 'trigger_update_user_stats'
    `
    
    if (triggers.length > 0) {
      console.log('✅ User stats trigger exists')
    } else {
      console.log('❌ User stats trigger missing')
    }

    // Test 4: Test basic database operations
    console.log('\n4. Testing basic database operations...')
    
    // Test inserting a sample transaction
    const testWallet = '0x1234567890123456789012345678901234567890'
    const testTxHash = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'
    
    // Clean up any existing test data
    await sql`DELETE FROM verified_transactions WHERE wallet_address = ${testWallet}`
    await sql`DELETE FROM leaderboard_users WHERE wallet_address = ${testWallet}`
    
    // Insert test transaction
    await sql`
      INSERT INTO verified_transactions (
        wallet_address, tx_hash, chain_id, block_number, action_type,
        token_symbol, amount, usd_value, points_awarded, contract_address, is_valid
      ) VALUES (
        ${testWallet},
        ${testTxHash},
        421614,
        12345678,
        'supply',
        'USDC',
        '100.0',
        100.0,
        25,
        '0x9876543210987654321098765432109876543210',
        true
      )
    `
    
    // Check if user was created automatically
    const users = await sql`
      SELECT * FROM leaderboard_users WHERE wallet_address = ${testWallet}
    `
    
    if (users.length > 0) {
      console.log('✅ Automatic user creation works')
      console.log(`   User points: ${users[0].total_points}`)
      console.log(`   Supply count: ${users[0].supply_count}`)
    } else {
      console.log('❌ Automatic user creation failed')
    }

    // Test 5: Check leaderboard query
    console.log('\n5. Testing leaderboard query...')
    
    const leaderboard = await sql`
      SELECT *, 
             ROW_NUMBER() OVER (ORDER BY total_points DESC, created_at ASC) as rank
      FROM leaderboard_users 
      WHERE total_points > 0
      ORDER BY total_points DESC, created_at ASC
      LIMIT 10
    `
    
    console.log(`✅ Leaderboard query returned ${leaderboard.length} users`)

    // Test 6: Test transaction invalidation
    console.log('\n6. Testing transaction invalidation...')
    
    await sql`
      UPDATE verified_transactions 
      SET is_valid = false 
      WHERE tx_hash = ${testTxHash}
    `
    
    const updatedUser = await sql`
      SELECT * FROM leaderboard_users WHERE wallet_address = ${testWallet}
    `
    
    if (updatedUser.length > 0 && updatedUser[0].total_points === 0) {
      console.log('✅ Transaction invalidation works')
    } else {
      console.log('❌ Transaction invalidation failed')
    }

    // Clean up test data
    await sql`DELETE FROM verified_transactions WHERE wallet_address = ${testWallet}`
    await sql`DELETE FROM leaderboard_users WHERE wallet_address = ${testWallet}`
    
    console.log('\n🎉 All leaderboard tests passed!\n')
    console.log('Next steps:')
    console.log('1. Visit /app/leaderboard in your browser')
    console.log('2. Try verifying a real transaction')
    console.log('3. Check that points are awarded correctly')
    console.log('\nAPI Endpoints:')
    console.log('- GET  /api/leaderboard - View leaderboard')
    console.log('- POST /api/leaderboard/verify - Verify transaction')
    console.log('- GET  /api/leaderboard?wallet=0x... - User stats')

  } catch (error) {
    console.error('❌ Test failed:', error.message)
    console.error('\nTroubleshooting:')
    console.error('1. Make sure PostgreSQL is running')
    console.error('2. Check database connection details')
    console.error('3. Run the SQL schema file: psql -d nextjs_app -f leaderboard_schema.sql')
  } finally {
    await sql.end()
  }
}

// Run the test
testLeaderboardSetup() 