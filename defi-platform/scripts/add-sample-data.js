/**
 * Add sample data to leaderboard for demonstration
 * Run with: node scripts/add-sample-data.js
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

// Sample data for demonstration
const sampleUsers = [
  {
    wallet: '0x742dB6c5dFe6F3b9877e6234B3D4C5e2f5b8E5A1',
    transactions: [
      { 
        tx_hash: '0xabc123456789abcdef123456789abcdef123456789abcdef123456789abcd01',
        action_type: 'supply', 
        token_symbol: 'USDC', 
        amount: '1000.0', 
        usd_value: 1000.0, 
        points: 30,
        chain_id: 421614,
        block_number: 12345678,
        contract_address: '0x9876543210987654321098765432109876543210'
      },
      { 
        tx_hash: '0xdef123456789abcdef123456789abcdef123456789abcdef123456789abcd02',
        action_type: 'borrow', 
        token_symbol: 'USDT', 
        amount: '500.0', 
        usd_value: 500.0, 
        points: 35,
        chain_id: 421614,
        block_number: 12345679,
        contract_address: '0x9876543210987654321098765432109876543210'
      }
    ]
  },
  {
    wallet: '0x856F7c9B4E3d2A8c7B5E4F1a2C8B9D3e6F0A5B7C',
    transactions: [
      { 
        tx_hash: '0x789abc456def123456789abc456def123456789abc456def123456789abc4503',
        action_type: 'supply', 
        token_symbol: 'WMON', 
        amount: '2000.0', 
        usd_value: 5000.0, 
        points: 60,
        chain_id: 10143,
        block_number: 23456789,
        contract_address: '0x8765432109876543210987654321098765432109'
      }
    ]
  },
  {
    wallet: '0x3C9E4B2F8A7D1E5C6B9A4F2E7D0C5B8A3E6F1D4C',
    transactions: [
      { 
        tx_hash: '0x456def789abc123def456789abc123def456789abc123def456789abc12304',
        action_type: 'supply', 
        token_symbol: 'USDC', 
        amount: '500.0', 
        usd_value: 500.0, 
        points: 25,
        chain_id: 84532,
        block_number: 34567890,
        contract_address: '0x7654321098765432109876543210987654321098'
      },
      { 
        tx_hash: '0x123def456abc789def123456abc789def123456abc789def123456abc78905',
        action_type: 'repay', 
        token_symbol: 'USDC', 
        amount: '100.0', 
        usd_value: 100.0, 
        points: 10,
        chain_id: 84532,
        block_number: 34567891,
        contract_address: '0x7654321098765432109876543210987654321098'
      }
    ]
  },
  {
    wallet: '0xB8F3A9C7E2D5F1B4A8C6E9F2D5B8A1C4E7F0B3A6',
    transactions: [
      { 
        tx_hash: '0x789def123abc456def789123abc456def789123abc456def789123abc45606',
        action_type: 'borrow', 
        token_symbol: 'LINK', 
        amount: '100.0', 
        usd_value: 1500.0, 
        points: 35,
        chain_id: 10143,
        block_number: 45678901,
        contract_address: '0x6543210987654321098765432109876543210987'
      }
    ]
  },
  {
    wallet: '0x4F7B2A8E1C5D9F3B6A7E0C4F8B1A5E2D9C6F3B8A',
    transactions: [
      { 
        tx_hash: '0xabc456def789123abc456def789123abc456def789123abc456def78912307',
        action_type: 'supply', 
        token_symbol: 'PUSD', 
        amount: '750.0', 
        usd_value: 750.0, 
        points: 25,
        chain_id: 97,
        block_number: 56789012,
        contract_address: '0x5432109876543210987654321098765432109876'
      },
      { 
        tx_hash: '0xdef789abc123def456abc789def123456abc789def123456abc789def12308',
        action_type: 'redeem', 
        token_symbol: 'PUSD', 
        amount: '200.0', 
        usd_value: 200.0, 
        points: 7,
        chain_id: 97,
        block_number: 56789013,
        contract_address: '0x5432109876543210987654321098765432109876'
      }
    ]
  }
]

async function addSampleData() {
  console.log('🎯 Adding Sample Leaderboard Data...\n')

  try {
    console.log('1. Cleaning existing sample data...')
    
    // Clean up any existing sample data
    for (const user of sampleUsers) {
      await sql`DELETE FROM verified_transactions WHERE wallet_address = ${user.wallet}`
      await sql`DELETE FROM leaderboard_users WHERE wallet_address = ${user.wallet}`
    }
    
    console.log('✅ Cleaned existing data')

    console.log('\n2. Adding sample transactions...')
    
    let totalTransactions = 0
    
    // Add sample transactions for each user
    for (const user of sampleUsers) {
      console.log(`   Adding transactions for ${user.wallet.slice(0, 8)}...`)
      
      for (const tx of user.transactions) {
        await sql`
          INSERT INTO verified_transactions (
            wallet_address, tx_hash, chain_id, block_number, action_type,
            token_symbol, amount, usd_value, points_awarded, contract_address, is_valid
          ) VALUES (
            ${user.wallet},
            ${tx.tx_hash},
            ${tx.chain_id},
            ${tx.block_number},
            ${tx.action_type},
            ${tx.token_symbol},
            ${tx.amount},
            ${tx.usd_value},
            ${tx.points},
            ${tx.contract_address},
            true
          )
        `
        totalTransactions++
      }
    }
    
    console.log(`✅ Added ${totalTransactions} sample transactions`)

    console.log('\n3. Verifying user creation and stats...')
    
    // Check that users were created automatically
    const users = await sql`
      SELECT wallet_address, total_points, supply_count, borrow_count, repay_count, redeem_count,
             ROW_NUMBER() OVER (ORDER BY total_points DESC, created_at ASC) as rank
      FROM leaderboard_users 
      WHERE total_points > 0
      ORDER BY total_points DESC
    `
    
    console.log(`✅ Created ${users.length} users with automatic stats`)
    
    console.log('\n4. Sample Leaderboard:')
    console.log('Rank | Wallet       | Points | Actions')
    console.log('-----|--------------|--------|--------')
    
    for (const user of users) {
      const wallet = user.wallet_address.slice(0, 8) + '...'
      const actions = `${user.supply_count}S/${user.borrow_count}B/${user.repay_count}R/${user.redeem_count}D`
      console.log(`  ${user.rank.toString().padStart(2)} | ${wallet.padEnd(12)} | ${user.total_points.toString().padStart(6)} | ${actions}`)
    }

    console.log('\n5. Chain distribution:')
    
    const chainStats = await sql`
      SELECT chain_id, COUNT(*) as tx_count, SUM(points_awarded) as total_points
      FROM verified_transactions
      WHERE is_valid = true
      GROUP BY chain_id
      ORDER BY total_points DESC
    `
    
    const chainNames = {
      421614: 'Arbitrum Sepolia',
      84532: 'Base Sepolia',
      10143: 'Monad Testnet',
      97: 'BSC Testnet'
    }
    
    for (const chain of chainStats) {
      const name = chainNames[chain.chain_id] || `Chain ${chain.chain_id}`
      console.log(`   ${name}: ${chain.tx_count} txs, ${chain.total_points} points`)
    }

    console.log('\n🎉 Sample data added successfully!')
    console.log('\nNow you can:')
    console.log('1. Visit /app/leaderboard to see the rankings')
    console.log('2. Connect one of the sample wallets to see user-specific data')
    console.log('3. Try verifying additional transactions')
    
    console.log('\nSample wallet addresses for testing:')
    for (const user of sampleUsers) {
      console.log(`- ${user.wallet}`)
    }

  } catch (error) {
    console.error('❌ Failed to add sample data:', error.message)
    console.error('\nDetails:', error)
  } finally {
    await sql.end()
  }
}

// Run the script
addSampleData() 