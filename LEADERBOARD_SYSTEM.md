# Peridot Protocol Leaderboard System

A secure, verifiable leaderboard system for tracking user interactions with the Peridot lending & borrowing protocol across multiple EVM chains.

## Overview

The leaderboard system awards points to users for interacting with the protocol (supplying, borrowing, repaying, redeeming) and maintains secure rankings through on-chain transaction verification.

## Key Features

- **Multi-chain Support**: Works across all supported EVM chains (Monad, BSC, Arbitrum, Base, etc.)
- **On-chain Verification**: All transactions are verified on-chain to prevent manipulation
- **Real-time Rankings**: Dynamic leaderboard with real-time updates
- **Point System**: Configurable point awards for different actions
- **Data Integrity**: Automatic re-verification and reorg protection
- **Simple Integration**: Easy-to-use APIs and React components

## Architecture

### Database Schema (2 Tables)

1. **`leaderboard_users`** - User statistics and total points
2. **`verified_transactions`** - Individual verified transactions with full audit trail

### Security Features

- Transaction hash verification on-chain
- Wallet address validation
- Contract interaction verification
- Chain reorganization detection
- Periodic re-verification
- Anti-gaming mechanisms

## Setup Instructions

### 1. Database Setup

Run the SQL schema to create the required tables:

```bash
psql -U your_user -d your_db -f leaderboard_schema.sql
```

### 2. Install Dependencies

Ensure you have the required packages:

```json
{
  "ethers": "^6.13.7",
  "postgres": "^3.4.5"
}
```

### 3. Configuration

The system uses your existing chain configurations from `config/contracts.ts`. Ensure all RPC URLs are properly configured.

## API Endpoints

### Transaction Verification

**POST** `/api/leaderboard/verify`

Verify a transaction and award points.

```json
{
  "txHash": "0x...",
  "walletAddress": "0x...",
  "chainId": 421614
}
```

**Response:**
```json
{
  "success": true,
  "points_awarded": 25,
  "user": {
    "wallet_address": "0x...",
    "total_points": 150,
    "rank": 15
  },
  "transaction": {
    "action_type": "supply",
    "token_symbol": "USDC",
    "amount": "100.0",
    "usd_value": 100.0
  }
}
```

### Leaderboard Data

**GET** `/api/leaderboard`

Get leaderboard rankings and statistics.

**Query Parameters:**
- `limit` (optional): Number of users to return (1-1000, default: 100)
- `offset` (optional): Pagination offset (default: 0)
- `wallet` (optional): Get specific user data

**Response:**
```json
{
  "leaderboard": [
    {
      "wallet_address": "0x...",
      "total_points": 1500,
      "supply_count": 10,
      "borrow_count": 5,
      "rank": 1
    }
  ],
  "stats": {
    "total_users": 234,
    "total_points_awarded": 45000,
    "total_verified_transactions": 1200
  }
}
```

### Admin Re-verification

**POST** `/api/leaderboard/admin/re-verify`

Periodic re-verification of transactions (for cron jobs).

```json
{
  "chainId": 421614,
  "limit": 50
}
```

## Point System

### Base Points

- **Supply**: 10 points + value bonus
- **Borrow**: 15 points + value bonus  
- **Repay**: 5 points
- **Redeem**: 2 points

### Value Bonuses

- **$10,000+**: +50 points
- **$1,000+**: +20 points
- **$100+**: +5 points

## Frontend Integration

### Page Route

The leaderboard is accessible at `/app/leaderboard` and is automatically integrated into the app navigation header.

### Basic Usage

```typescript
import LeaderboardComponent from '@/components/leaderboard/LeaderboardComponent'

export default function LeaderboardPage() {
  return <LeaderboardComponent />
}
```

### Navigation Integration

The leaderboard link is automatically shown in the header when users are on `/app` routes:
- Desktop navigation shows "Home | Bridge | Leaderboard"
- Mobile navigation includes all app routes with active state highlighting
- Active page highlighting with primary color and font weight

### Custom Integration

```typescript
// Verify a transaction
const verifyTransaction = async (txHash: string, wallet: string, chainId: number) => {
  const response = await fetch('/api/leaderboard/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ txHash, walletAddress: wallet, chainId })
  })
  
  const result = await response.json()
  if (result.success) {
    console.log(`Awarded ${result.points_awarded} points!`)
  }
}

// Get leaderboard
const getLeaderboard = async () => {
  const response = await fetch('/api/leaderboard')
  const data = await response.json()
  return data.leaderboard
}

// Get user stats
const getUserStats = async (wallet: string) => {
  const response = await fetch(`/api/leaderboard?wallet=${wallet}`)
  const data = await response.json()
  return data.user
}
```

## Supported Chains

- **Arbitrum Sepolia** (421614)
- **Base Sepolia** (84532)
- **IOTA EVM Testnet** (1075)
- **Soneium Minato** (1946)
- **Monad Testnet** (10143)
- **BSC Testnet** (97)

## Verification Process

### 1. Transaction Validation
- Hash format validation
- Transaction existence check
- Success status verification
- Wallet address matching

### 2. Protocol Interaction Check
- Contract address verification
- Event log parsing
- Action type identification
- Amount extraction

### 3. Point Calculation
- Base points by action type
- USD value bonus calculation
- Anti-gaming checks

### 4. Database Storage
- Transaction record creation
- Automatic user stats update
- Duplicate prevention

## Security Measures

### Anti-Manipulation
- All data verified on-chain
- No client-side point calculation
- Transaction uniqueness enforcement
- Rate limiting and cooldowns

### Data Integrity
- Periodic re-verification
- Chain reorganization handling
- Automatic invalidation of failed txs
- Comprehensive audit logging

### Monitoring
- Failed verification tracking
- Suspicious pattern detection
- Performance monitoring
- Error alerting

## Maintenance

### Daily Tasks
- Run re-verification for active chains
- Monitor verification failure rates
- Check for chain reorganizations

### Weekly Tasks
- Review point distribution patterns
- Analyze user engagement metrics
- Update price feeds if needed

### Monthly Tasks
- Audit database integrity
- Review and update point values
- Performance optimization

## Troubleshooting

### Common Issues

**"Transaction not found"**
- Wait for transaction confirmation (3-5 blocks)
- Check correct chain ID
- Verify RPC endpoint connectivity

**"Transaction not from expected wallet"**
- Ensure correct wallet address
- Check transaction sender

**"No valid protocol interaction found"**
- Verify transaction interacted with protocol contracts
- Check contract addresses in config

### Debug Mode

Enable detailed logging by setting environment variables:

```bash
DEBUG_LEADERBOARD=true
VERBOSE_VERIFICATION=true
```

## Performance Considerations

- Database indexes on critical fields
- Connection pooling for RPC providers
- Batch processing for re-verification
- Caching for frequently accessed data

## Future Enhancements

- Real-time event monitoring
- Advanced analytics dashboard
- Social features (teams, challenges)
- Integration with governance tokens
- Mobile app support

## Support

For issues or questions:
1. Check the troubleshooting section
2. Review API error messages
3. Check database logs
4. Contact development team

---

**Note**: This system is designed for testnet environments. For mainnet deployment, ensure additional security audits and monitoring capabilities. 