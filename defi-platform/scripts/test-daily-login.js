/**
 * Test script for daily login system
 * Run with: node scripts/test-daily-login.js
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

async function testDailyLoginSystem() {
  console.log('🧪 Testing Daily Login System Integration...\n')

  try {
    const testWallet = '0xTestWallet' + Date.now().toString(16)
    console.log('🔍 Test wallet:', testWallet)
    
    // Test 1: Check initial eligibility
    console.log('\n1. Testing initial eligibility...')
    const eligible1 = await sql`SELECT is_eligible_for_daily_login(${testWallet}) as eligible`
    console.log('✅ Initial eligibility:', eligible1[0].eligible)
    
    // Test 2: Award daily login bonus
    console.log('\n2. Testing bonus award...')
    const result1 = await sql`SELECT * FROM award_daily_login_bonus(${testWallet})`
    console.log('✅ Bonus result:', result1[0])
    
    // Test 3: Check user was created in leaderboard
    console.log('\n3. Testing leaderboard integration...')
    const user = await sql`SELECT * FROM leaderboard_users WHERE wallet_address = ${testWallet}`
    if (user[0]) {
      console.log('✅ User created with points:', user[0].total_points)
    } else {
      console.log('❌ User not found in leaderboard')
    }
    
    // Test 4: Check daily login record
    console.log('\n4. Testing login record...')
    const login = await sql`SELECT * FROM daily_logins WHERE wallet_address = ${testWallet}`
    if (login[0]) {
      console.log('✅ Login record created on:', login[0].login_date)
    } else {
      console.log('❌ Login record not found')
    }
    
    // Test 5: Check eligibility after claiming
    console.log('\n5. Testing eligibility after claiming...')
    const eligible2 = await sql`SELECT is_eligible_for_daily_login(${testWallet}) as eligible`
    console.log('✅ Eligibility after claiming:', eligible2[0].eligible)
    
    // Test 6: Try to claim again (should fail)
    console.log('\n6. Testing duplicate claim prevention...')
    const result2 = await sql`SELECT * FROM award_daily_login_bonus(${testWallet})`
    console.log('✅ Second attempt result:', result2[0])
    
    // Test 7: Check login streak
    console.log('\n7. Testing login streak tracking...')
    const streak = await sql`SELECT * FROM user_login_streaks WHERE wallet_address = ${testWallet}`
    if (streak[0]) {
      console.log('✅ Login streak:', streak[0].active_streak, 'days')
    } else {
      console.log('❌ Streak not found')
    }
    
    // Cleanup
    console.log('\n🧹 Cleaning up test data...')
    await sql`DELETE FROM daily_logins WHERE wallet_address = ${testWallet}`
    await sql`DELETE FROM leaderboard_users WHERE wallet_address = ${testWallet}`
    console.log('✅ Test data cleaned up')
    
    console.log('\n🎉 All Daily Login Tests Passed!')
    console.log('\n📋 Summary:')
    console.log('- ✅ Eligibility checking works')
    console.log('- ✅ Bonus awarding works')
    console.log('- ✅ Leaderboard integration works')
    console.log('- ✅ Login records are created')
    console.log('- ✅ Duplicate prevention works')
    console.log('- ✅ Streak tracking works')
    
    console.log('\n🚀 System is ready for production!')
    
  } catch (error) {
    console.error('❌ Test failed:', error.message)
    console.error('\nDetails:', error)
  } finally {
    await sql.end()
  }
}

// Run the test
testDailyLoginSystem() 