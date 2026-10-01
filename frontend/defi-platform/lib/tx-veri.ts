import { ethers } from 'ethers'
import { chainConfigs, getChainConfig } from '@/config/contracts'

// RPC providers for each chain
const providers: { [chainId: number]: ethers.JsonRpcProvider } = {}

// Initialize providers for supported chains
function getProvider(chainId: number): ethers.JsonRpcProvider {
  if (!providers[chainId]) {
    const config = getChainConfig(chainId)
    if (!config || !('rpcUrl' in config)) {
      throw new Error(`Unsupported chain ID or missing RPC URL: ${chainId}`)
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
  decimals?: number
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

    // --- REFACTORED LOGIC ---
    // Stricter log parsing to prevent ambiguity exploits.
    
    // 1. Parse all logs from our contract interface
    const contract = new ethers.Contract(toAddress, PTOKEN_ABI, provider)
    const parsedLogs = receipt.logs.map(log => {
      try {
        // We only care about logs from the contract we interacted with
        if (log.address.toLowerCase() !== toAddress.toLowerCase()) {
          return null
        }
        return contract.interface.parseLog(log)
      } catch (e) {
        return null // Ignore logs that don't match our ABI
      }
    }).filter(log => log !== null && ['Mint', 'Borrow', 'RepayBorrow', 'Redeem'].includes(log.name)) as ethers.LogDescription[]

    // 2. Ensure there's only ONE primary action event
    if (parsedLogs.length !== 1) {
      return { 
        isValid: false, 
        reason: `Ambiguous transaction: found ${parsedLogs.length} primary action events. Expected 1.` 
      }
    }

    const parsedLog = parsedLogs[0]

    // 3. Verify the action was performed by the expected wallet
    const eventPerformer = (parsedLog.args.minter || parsedLog.args.borrower || parsedLog.args.payer || parsedLog.args.redeemer)?.toLowerCase()
    if (!eventPerformer || eventPerformer !== expectedWalletAddress.toLowerCase()) {
      return { 
        isValid: false, 
        reason: 'Event performer does not match the expected wallet address.'
      }
    }
    
    let actionType: 'supply' | 'borrow' | 'repay' | 'redeem'
    let rawAmount: ethers.BigNumberish

    switch (parsedLog.name) {
      case 'Mint':
        actionType = 'supply'
        rawAmount = parsedLog.args.mintAmount
        break
      case 'Borrow':
        actionType = 'borrow'
        rawAmount = parsedLog.args.borrowAmount
        break
      case 'RepayBorrow':
        actionType = 'repay'
        rawAmount = parsedLog.args.repayAmount
        break
      case 'Redeem':
        actionType = 'redeem'
        rawAmount = parsedLog.args.redeemAmount
        break
      default:
        // This case should not be reachable due to the filter above
        return { isValid: false, reason: 'Unrecognized primary action.' }
    }

    if (!rawAmount) {
      return { isValid: false, reason: 'Could not determine transaction amount from event.'}
    }

    // 4. Get decimals, symbol, and USD value
    const decimals = await getTokenDecimals(toAddress, provider, chainConfig)
    const tokenSymbol = await getTokenSymbol(toAddress, provider, chainConfig)
    const usdValue = await estimateUSDValue(rawAmount, tokenSymbol, decimals)
    
    return {
      isValid: true,
      actionType,
      contractAddress: toAddress,
      tokenSymbol,
      amount: ethers.formatUnits(rawAmount, decimals),
      usdValue,
      blockNumber: receipt.blockNumber,
      decimals
    }

  } catch (error) {
    console.error('Transaction verification error:', error)
    return { isValid: false, reason: 'Verification failed due to network error' }
  }
}

// Get all contract addresses for a chain
function getAllContractAddresses(chainConfig: any): string[] {
  const addresses: string[] = []
  
  // Recursively find all values that look like addresses
  function findAddresses(obj: any) {
    for (const key in obj) {
      if (typeof obj[key] === 'string' && obj[key].startsWith('0x')) {
        addresses.push(obj[key].toLowerCase())
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        findAddresses(obj[key])
      }
    }
  }

  findAddresses(chainConfig)
  
  return [...new Set(addresses)] // Return unique addresses
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
        if ((market as any).pToken?.toLowerCase() === contractAddress.toLowerCase()) {
          return symbol
        }
      }
    }
    
    return 'UNKNOWN'
  }
}

// Get token decimals from contract
async function getTokenDecimals(
  contractAddress: string,
  provider: ethers.JsonRpcProvider,
  chainConfig: any
): Promise<number> {
  try {
    // First, try to get it from the contract's underlying asset
    const contract = new ethers.Contract(contractAddress, PTOKEN_ABI, provider)
    
    try {
      const underlyingAddress = await contract.underlying()
      const underlyingContract = new ethers.Contract(underlyingAddress, ERC20_ABI, provider)
      return Number(await underlyingContract.decimals())
    } catch (error) {
      // Not a pToken or underlying call failed, continue
    }

    // Fallback: try direct decimals call
    const tokenContract = new ethers.Contract(contractAddress, ERC20_ABI, provider)
    return Number(await tokenContract.decimals())

  } catch (error) {
    // Fallback: look up in our contract config
    if ('markets' in chainConfig) {
      for (const [symbol, market] of Object.entries(chainConfig.markets as any)) {
        if ((market as any).pToken?.toLowerCase() === contractAddress.toLowerCase()) {
          return (market as any).decimals || 18 // Default to 18 if not specified
        }
      }
    }
    
    // Default if all else fails
    return 18
  }
}

// Estimate USD value using raw amount and decimals
async function estimateUSDValue(
  rawAmount: ethers.BigNumberish, 
  tokenSymbol: string, 
  decimals: number
): Promise<number> {
  // Placeholder prices - in production, integrate with price feeds
  const prices: { [symbol: string]: number } = {
    'USDC': 1.0,
    'USDT': 1.0,
    'PUSD': 1.0,
    'rUSDC': 1.0,
    'ETH': 3000,
    'WETH': 3000,
    'BTC': 65000,
    'WBTC': 65000,
    'LINK': 15,
    'WMON': 2.5,
    'BNB': 600,
  }
  
  const price = prices[tokenSymbol] || 0
  
  // Format the raw amount using its decimals
  const formattedAmount = parseFloat(ethers.formatUnits(rawAmount, decimals))
  
  return formattedAmount * price
}

// Calculate points based on action type and amount
export function calculatePoints(
  actionType: 'supply' | 'borrow' | 'repay' | 'redeem',
  amount?: string,
  usdValue?: number
): number {
  // Legacy file delegates to centralized policy to avoid drift
  const { calculateTransactionPoints } = require('@/lib/rewards/policy')
  return calculateTransactionPoints(actionType, usdValue)
}