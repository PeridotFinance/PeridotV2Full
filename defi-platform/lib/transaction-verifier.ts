import { ethers } from 'ethers'
import { chainConfigs, getChainConfig } from '@/config/contracts'

// RPC providers for each chain
const providers: { [chainId: number]: ethers.JsonRpcProvider } = {}

// Initialize providers for supported chains
function getProvider(chainId: number): ethers.JsonRpcProvider {
  if (!providers[chainId]) {
    const config = getChainConfig(chainId)
    if (!config || !('rpcUrl' in config)) {
      throw new Error(`Unsupported chain ID: ${chainId}`)
    }
    providers[chainId] = new ethers.JsonRpcProvider(config.rpcUrl)
  }
  return providers[chainId]
}

// ABI for the pToken contracts - main functions we need to verify
const PTOKEN_ABI = [
  'event Mint(address minter, uint mintAmount, uint mintTokens)',
  'event Borrow(address borrower, uint borrowAmount, uint accountBorrows, uint totalBorrows)',
  'event RepayBorrow(address payer, address borrower, uint repayAmount, uint accountBorrows, uint totalBorrows)',
  'event Redeem(address redeemer, uint redeemAmount, uint redeemTokens)',
  'function underlying() view returns (address)',
]

// ERC20 ABI for token symbol lookup
const ERC20_ABI = [
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
]

export interface VerificationResult {
  isValid: boolean
  reason?: string
  actionType?: 'supply' | 'borrow' | 'repay' | 'redeem'
  contractAddress?: string
  tokenSymbol?: string
  amount?: string
  usdValue?: number
  blockNumber?: number
}

export async function verifyTransactionOnChain(
  txHash: string,
  chainId: number,
  expectedWalletAddress: string
): Promise<VerificationResult> {
  try {
    const provider = getProvider(chainId)
    const chainConfig = getChainConfig(chainId)
    
    if (!chainConfig) {
      return { isValid: false, reason: 'Unsupported chain' }
    }

    // Get transaction receipt
    const receipt = await provider.getTransactionReceipt(txHash)
    if (!receipt) {
      return { isValid: false, reason: 'Transaction not found' }
    }

    // Check transaction succeeded
    if (receipt.status !== 1) {
      return { isValid: false, reason: 'Transaction failed' }
    }

    // Get transaction details
    const transaction = await provider.getTransaction(txHash)
    if (!transaction) {
      return { isValid: false, reason: 'Transaction details not found' }
    }

    // Verify the transaction was sent by the expected wallet
    if (transaction.from.toLowerCase() !== expectedWalletAddress.toLowerCase()) {
      return { isValid: false, reason: 'Transaction not from expected wallet address' }
    }

    // Check if transaction interacted with our contracts
    const contractAddresses = getAllContractAddresses(chainConfig)
    const toAddress = transaction.to?.toLowerCase()
    
    if (!toAddress || !contractAddresses.includes(toAddress)) {
      return { isValid: false, reason: 'Transaction did not interact with protocol contracts' }
    }

    // Parse transaction logs to determine action type
    const contract = new ethers.Contract(toAddress, PTOKEN_ABI, provider)
    
    let actionType: 'supply' | 'borrow' | 'repay' | 'redeem' | undefined
    let amount: string | undefined
    let tokenSymbol: string | undefined

    // Parse logs to find relevant events
    for (const log of receipt.logs) {
      try {
        const parsedLog = contract.interface.parseLog(log)
        if (!parsedLog) continue

        switch (parsedLog.name) {
          case 'Mint':
            if (parsedLog.args.minter.toLowerCase() === expectedWalletAddress.toLowerCase()) {
              actionType = 'supply'
              amount = ethers.formatUnits(parsedLog.args.mintAmount, 18)
            }
            break
          case 'Borrow':
            if (parsedLog.args.borrower.toLowerCase() === expectedWalletAddress.toLowerCase()) {
              actionType = 'borrow'
              amount = ethers.formatUnits(parsedLog.args.borrowAmount, 18)
            }
            break
          case 'RepayBorrow':
            if (parsedLog.args.payer.toLowerCase() === expectedWalletAddress.toLowerCase()) {
              actionType = 'repay'
              amount = ethers.formatUnits(parsedLog.args.repayAmount, 18)
            }
            break
          case 'Redeem':
            if (parsedLog.args.redeemer.toLowerCase() === expectedWalletAddress.toLowerCase()) {
              actionType = 'redeem'
              amount = ethers.formatUnits(parsedLog.args.redeemAmount, 18)
            }
            break
        }
      } catch (error) {
        // Log parsing failed, continue to next log
        continue
      }
    }

    if (!actionType) {
      return { isValid: false, reason: 'No valid protocol interaction found in transaction' }
    }

    // Get token symbol
    try {
      tokenSymbol = await getTokenSymbol(toAddress, provider, chainConfig)
    } catch (error) {
      console.warn('Failed to get token symbol:', error)
      tokenSymbol = 'UNKNOWN'
    }

    // Calculate USD value (placeholder - you can integrate with price oracles)
    const usdValue = await estimateUSDValue(amount || '0', tokenSymbol, chainId)

    return {
      isValid: true,
      actionType,
      contractAddress: toAddress,
      tokenSymbol,
      amount,
      usdValue,
      blockNumber: receipt.blockNumber,
    }

  } catch (error) {
    console.error('Transaction verification error:', error)
    return { isValid: false, reason: 'Verification failed due to network error' }
  }
}

// Get all contract addresses for a chain
function getAllContractAddresses(chainConfig: any): string[] {
  const addresses: string[] = []
  
  // Add all contract addresses from the config
  for (const [key, value] of Object.entries(chainConfig)) {
    if (typeof value === 'string' && value.startsWith('0x')) {
      addresses.push(value.toLowerCase())
    } else if (typeof value === 'object' && value !== null) {
      // Handle nested objects like markets
      for (const [nestedKey, nestedValue] of Object.entries(value)) {
        if (typeof nestedValue === 'string' && nestedValue.startsWith('0x')) {
          addresses.push(nestedValue.toLowerCase())
        } else if (typeof nestedValue === 'object' && nestedValue !== null) {
          // Handle deeper nesting like markets.USDC.pToken
          for (const [deepKey, deepValue] of Object.entries(nestedValue)) {
            if (typeof deepValue === 'string' && deepValue.startsWith('0x')) {
              addresses.push(deepValue.toLowerCase())
            }
          }
        }
      }
    }
  }
  
  return addresses
}

// Get token symbol from contract
async function getTokenSymbol(
  contractAddress: string, 
  provider: ethers.JsonRpcProvider,
  chainConfig: any
): Promise<string> {
  try {
    // First try to get it from the contract itself if it's a pToken
    const contract = new ethers.Contract(contractAddress, PTOKEN_ABI, provider)
    
    try {
      const underlyingAddress = await contract.underlying()
      const underlyingContract = new ethers.Contract(underlyingAddress, ERC20_ABI, provider)
      return await underlyingContract.symbol()
    } catch (error) {
      // Not a pToken or underlying call failed
    }

    // Try direct symbol call
    const tokenContract = new ethers.Contract(contractAddress, ERC20_ABI, provider)
    return await tokenContract.symbol()
    
  } catch (error) {
    // Fallback: look up in our contract config
    if ('markets' in chainConfig) {
      for (const [symbol, market] of Object.entries(chainConfig.markets as any)) {
        if (market.pToken?.toLowerCase() === contractAddress.toLowerCase()) {
          return symbol
        }
      }
    }
    
    return 'UNKNOWN'
  }
}

// Estimate USD value (placeholder implementation)
async function estimateUSDValue(amount: string, tokenSymbol: string, chainId: number): Promise<number> {
  // Placeholder prices - in production, integrate with price feeds
  const prices: { [symbol: string]: number } = {
    'USDC': 1.0,
    'USDT': 1.0,
    'PUSD': 1.0,
    'ETH': 3000,
    'WETH': 3000,
    'BTC': 65000,
    'WBTC': 65000,
    'LINK': 15,
    'WMON': 2.5, // Placeholder for Monad
    'BNB': 600,
  }
  
  const price = prices[tokenSymbol] || 0
  const numAmount = parseFloat(amount)
  
  return numAmount * price
}

// Calculate points based on action type and amount
export function calculatePoints(
  actionType: 'supply' | 'borrow' | 'repay' | 'redeem',
  amount?: string,
  usdValue?: number
): number {
  const basePoints = {
    supply: 10,
    borrow: 15,
    repay: 5,
    redeem: 2,
  }
  
  let points = basePoints[actionType]
  
  // Add bonus points based on USD value
  if (usdValue && usdValue > 0) {
    if (usdValue >= 10000) {
      points += 50 // Large transaction bonus
    } else if (usdValue >= 1000) {
      points += 20 // Medium transaction bonus
    } else if (usdValue >= 100) {
      points += 5 // Small transaction bonus
    }
  }
  
  return points
} 