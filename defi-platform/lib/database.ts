import postgres from 'postgres'

// Database connection - using same config as waitlist
const sql = postgres({
  host: '127.0.0.1',
  port: 5432,
  database: 'nextjs_app',
  username: 'nextjs_user',
  password: 'ylW1JpChPB0+2RWY1kxaNaFG5TmJvLxi6xho6kFqU8M=',
})

// Types for our leaderboard system
export interface LeaderboardUser {
  wallet_address: string
  total_points: number
  supply_count: number
  borrow_count: number
  repay_count: number
  redeem_count: number
  last_updated: Date
  created_at: Date
}

export interface VerifiedTransaction {
  id?: number
  wallet_address: string
  tx_hash: string
  chain_id: number
  block_number: bigint
  action_type: 'supply' | 'borrow' | 'repay' | 'redeem'
  token_symbol?: string
  amount?: string
  usd_value?: number
  points_awarded: number
  verified_at?: Date
  is_valid: boolean
  contract_address: string
}

// Database operations for leaderboard
export class LeaderboardDB {
  // Get user by wallet address
  static async getUser(walletAddress: string): Promise<LeaderboardUser | null> {
    try {
      const users = await sql`
        SELECT * FROM leaderboard_users 
        WHERE wallet_address = ${walletAddress.toLowerCase()}
      `
      return users[0] || null
    } catch (error) {
      console.error('Error fetching user:', error)
      throw error
    }
  }

  // Get leaderboard rankings
  static async getLeaderboard(limit: number = 100, offset: number = 0): Promise<LeaderboardUser[]> {
    try {
      const users = await sql`
        SELECT *, 
               ROW_NUMBER() OVER (ORDER BY total_points DESC, created_at ASC) as rank
        FROM leaderboard_users 
        WHERE total_points > 0
        ORDER BY total_points DESC, created_at ASC
        LIMIT ${limit} OFFSET ${offset}
      `
      return users as LeaderboardUser[]
    } catch (error) {
      console.error('Error fetching leaderboard:', error)
      throw error
    }
  }

  // Get user rank
  static async getUserRank(walletAddress: string): Promise<number | null> {
    try {
      const result = await sql`
        SELECT rank FROM (
          SELECT wallet_address, 
                 ROW_NUMBER() OVER (ORDER BY total_points DESC, created_at ASC) as rank
          FROM leaderboard_users 
          WHERE total_points > 0
        ) ranked
        WHERE wallet_address = ${walletAddress.toLowerCase()}
      `
      return result[0]?.rank || null
    } catch (error) {
      console.error('Error fetching user rank:', error)
      throw error
    }
  }

  // Add verified transaction (triggers will update user stats automatically)
  static async addVerifiedTransaction(transaction: VerifiedTransaction): Promise<void> {
    try {
      await sql`
        INSERT INTO verified_transactions (
          wallet_address, tx_hash, chain_id, block_number, action_type,
          token_symbol, amount, usd_value, points_awarded, contract_address, is_valid
        ) VALUES (
          ${transaction.wallet_address.toLowerCase()},
          ${transaction.tx_hash.toLowerCase()},
          ${transaction.chain_id},
          ${transaction.block_number.toString()},
          ${transaction.action_type},
          ${transaction.token_symbol},
          ${transaction.amount},
          ${transaction.usd_value},
          ${transaction.points_awarded},
          ${transaction.contract_address.toLowerCase()},
          ${transaction.is_valid}
        )
        ON CONFLICT (tx_hash) DO NOTHING
      `
    } catch (error) {
      console.error('Error adding verified transaction:', error)
      throw error
    }
  }

  // Check if transaction already exists
  static async transactionExists(txHash: string): Promise<boolean> {
    try {
      const result = await sql`
        SELECT 1 FROM verified_transactions 
        WHERE tx_hash = ${txHash.toLowerCase()}
        LIMIT 1
      `
      return result.length > 0
    } catch (error) {
      console.error('Error checking transaction existence:', error)
      throw error
    }
  }

  // Get user's transactions
  static async getUserTransactions(
    walletAddress: string, 
    limit: number = 50, 
    offset: number = 0
  ): Promise<VerifiedTransaction[]> {
    try {
      const transactions = await sql`
        SELECT * FROM verified_transactions 
        WHERE wallet_address = ${walletAddress.toLowerCase()} 
        AND is_valid = true
        ORDER BY verified_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `
      return transactions as VerifiedTransaction[]
    } catch (error) {
      console.error('Error fetching user transactions:', error)
      throw error
    }
  }

  // Invalidate transaction (for reorg handling)
  static async invalidateTransaction(txHash: string): Promise<void> {
    try {
      await sql`
        UPDATE verified_transactions 
        SET is_valid = false 
        WHERE tx_hash = ${txHash.toLowerCase()}
      `
    } catch (error) {
      console.error('Error invalidating transaction:', error)
      throw error
    }
  }

  // Get transactions to re-verify (for periodic checks)
  static async getTransactionsToReVerify(
    chainId: number, 
    olderThanHours: number = 24,
    limit: number = 100
  ): Promise<VerifiedTransaction[]> {
    try {
      const transactions = await sql`
        SELECT * FROM verified_transactions 
        WHERE chain_id = ${chainId} 
        AND is_valid = true 
        AND verified_at < NOW() - INTERVAL '${olderThanHours} hours'
        ORDER BY verified_at ASC
        LIMIT ${limit}
      `
      return transactions as VerifiedTransaction[]
    } catch (error) {
      console.error('Error fetching transactions to re-verify:', error)
      throw error
    }
  }

  // Get leaderboard stats
  static async getLeaderboardStats() {
    try {
      const stats = await sql`
        SELECT 
          COUNT(*) as total_users,
          SUM(total_points) as total_points_awarded,
          SUM(supply_count) as total_supplies,
          SUM(borrow_count) as total_borrows,
          SUM(repay_count) as total_repays,
          SUM(redeem_count) as total_redeems,
          (SELECT COUNT(*) FROM verified_transactions WHERE is_valid = true) as total_verified_transactions
        FROM leaderboard_users
        WHERE total_points > 0
      `
      return stats[0]
    } catch (error) {
      console.error('Error fetching leaderboard stats:', error)
      throw error
    }
  }
}

// Export the sql connection for direct use if needed
export { sql } 