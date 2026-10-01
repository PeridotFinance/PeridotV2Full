const postgres = require('postgres')
const fs = require('fs')

// Database connection
const useTunnel = process.env.NODE_ENV !== 'production' && process.env.DATABASE_URL_TUNNEL
const databaseUrl = useTunnel || process.env.DATABASE_URL
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for database connection')
}

const sslCertPath = process.env.PGSSLROOTCERT
const sslServername = process.env.PGSSLSERVERNAME
const ssl =
  sslCertPath && fs.existsSync(sslCertPath)
    ? {
        rejectUnauthorized: true,
        ca: fs.readFileSync(sslCertPath, 'utf8'),
        servername: sslServername || undefined,
      }
    : { rejectUnauthorized: true, servername: sslServername || undefined }

const sql = postgres(databaseUrl, { ssl })

// Use mainnet tables if preset is mainnet
const isMainnet = (process.env.NEXT_PUBLIC_NETWORK_PRESET || 'testnet').toLowerCase().startsWith('mainnet')
const tables = isMainnet ? {
  userProfiles: 'user_profiles_mainnet',
  leaderboardUsers: 'leaderboard_users_mainnet',
  verifiedTransactions: 'verified_transactions_mainnet'
} : {
  userProfiles: 'user_profiles',
  leaderboardUsers: 'leaderboard_users',
  verifiedTransactions: 'verified_transactions'
}

async function checkWallet() {
  const wallet = '0xac56FC480bEa95f30e66f7fef2b4564762645EEe'.toLowerCase()

  console.log(`Checking wallet ${wallet} on ${isMainnet ? 'mainnet' : 'testnet'}...`)

  try {
    // Check user profile
    const profile = await sql`
      SELECT wallet_address, username, badges
      FROM ${sql(tables.userProfiles)}
      WHERE wallet_address = ${wallet}
    `

    if (profile.length === 0) {
      console.log('❌ Wallet not found in user_profiles')
      return
    }

    console.log('✅ Found wallet:', {
      address: profile[0].wallet_address,
      username: profile[0].username,
      hasBadges: !!profile[0].badges
    })

    // Parse badges
    if (profile[0].badges) {
      try {
        const badgesData = typeof profile[0].badges === 'string'
          ? JSON.parse(profile[0].badges)
          : profile[0].badges

        console.log('Current badges:', badgesData.earned || [])

        // Check if omnichain badge is present
        const hasOmnichain = badgesData.earned?.includes('s1_omnichain_presence')
        console.log('Has s1_omnichain_presence:', hasOmnichain)
      } catch (e) {
        console.log('❌ Error parsing badges:', e.message)
      }
    }

    // Check leaderboard data
    const leaderboard = await sql`
      SELECT total_points, supply_count, borrow_count
      FROM ${sql(tables.leaderboardUsers)}
      WHERE wallet_address = ${wallet}
    `

    if (leaderboard.length > 0) {
      console.log('Leaderboard data:', leaderboard[0])
    } else {
      console.log('❌ No leaderboard data found')
    }

    // Check transactions on BSC and Monad
    const bscTx = await sql`
      SELECT COUNT(*) as count, COALESCE(SUM(usd_value), 0) as total_usd
      FROM ${sql(tables.verifiedTransactions)}
      WHERE wallet_address = ${wallet} AND chain_id = 56 AND is_valid = true
    `

    const monadTx = await sql`
      SELECT COUNT(*) as count, COALESCE(SUM(usd_value), 0) as total_usd
      FROM ${sql(tables.verifiedTransactions)}
      WHERE wallet_address = ${wallet} AND chain_id = 143 AND is_valid = true
    `

    console.log('BSC (chain 56) transactions:', bscTx[0])
    console.log('Monad (chain 143) transactions:', monadTx[0])

  } catch (error) {
    console.error('❌ Error:', error)
  } finally {
    await sql.end()
  }
}

checkWallet()
