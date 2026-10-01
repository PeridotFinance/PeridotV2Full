import { ethers } from 'ethers'
import { chainConfigs, getChainConfig, getOracleAddress } from '@/config/contracts'
import { getMarketsForChain } from '@/data/market-data'
import PriceOracleAbi from '@/app/abis/PriceOracle.json'
import { calculateTransactionPoints } from '@/lib/rewards/policy'

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
  let attempts = 0
  const maxAttempts = 5
  const delayMs = 3000 // 3 seconds between retries

  while (attempts < maxAttempts) {
    try {
      const provider = getProvider(chainId)
      const chainConfig = getChainConfig(chainId)
      
      if (!chainConfig) {
        return { isValid: false, reason: 'Unsupported chain' }
      }

      // Get transaction receipt
      const receipt = await provider.getTransactionReceipt(txHash)
      
      if (!receipt) {
        // If not found, wait and retry
        attempts++
        if (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, delayMs))
          continue
        }
        return { isValid: false, reason: 'Transaction not found after multiple attempts' }
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

      // --- REFACTORED LOGIC FOR SMART ACCOUNTS ---
      // Instead of assuming transaction.to/from, we scan logs for protocol interactions.
      const pTokenInterface = new ethers.Interface(PTOKEN_ABI)
      const protocolAddresses = getAllContractAddresses(chainConfig)
      
      const parsedLogs = receipt.logs.map(log => {
        try {
          // Only consider logs from our protocol contracts
          if (!protocolAddresses.includes(log.address.toLowerCase())) {
            return null
          }
          const parsed = pTokenInterface.parseLog(log)
          if (!parsed || !['Mint', 'Borrow', 'RepayBorrow', 'Redeem'].includes(parsed.name)) {
            return null
          }
          return {
            logAddress: log.address,
            parsed
          }
        } catch (e) {
          return null
        }
      }).filter((item): item is { logAddress: string; parsed: ethers.LogDescription } => item !== null)

      // Ensure there is at least one primary action event
      if (parsedLogs.length === 0) {
        return {
          isValid: false,
          reason: 'No primary protocol action event found in transaction logs.'
        }
      }

      // If multiple events are found, pick the most significant one based on a priority list.
      // Priority is defined as: Borrow > Supply (Mint) > Repay > Redeem
      const priority = ['Borrow', 'Mint', 'RepayBorrow', 'Redeem'];
      parsedLogs.sort((a, b) => priority.indexOf(a.parsed.name) - priority.indexOf(b.parsed.name));
      
      const { logAddress: toAddress, parsed: parsedLog } = parsedLogs[0];

      // Verify the action was performed by the expected wallet
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
          return { isValid: false, reason: 'Unrecognized primary action.' }
      }

      if (!rawAmount) {
        return { isValid: false, reason: 'Could not determine transaction amount from event.'}
      }

      // Get decimals, symbol, and USD value
      // Resolve underlying decimals and symbol with stronger fallbacks for native markets
      const { decimals, tokenSymbol, isNative } = await getResolvedTokenMetadata(
        toAddress,
        provider,
        chainConfig
      )

      // For native supply (PEther-style), cross-check rawAmount against transaction.value
      // ONLY for EOA transactions (where transaction.from is the user).
      if (isNative && actionType === 'supply' && transaction.from.toLowerCase() === expectedWalletAddress.toLowerCase()) {
        // Accept small differences (e.g., dust), but catch gross mismatches
        const txValue = ethers.toBigInt((transaction as any).value ?? 0)
        const raw = ethers.toBigInt(rawAmount)
        const diff = txValue > raw ? txValue - raw : raw - txValue
        const tolerance = BigInt(1000000000) // ~1e9 wei tolerance
        if (diff > tolerance) {
          return { isValid: false, reason: 'Native supply amount does not match transaction value' }
        }
      }

      const usdValue = await estimateUSDValue(rawAmount, tokenSymbol, decimals, chainId, toAddress, provider)
      
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
      console.error('Transaction verification attempt failed:', error)
      attempts++
      if (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, delayMs))
        continue
      }
      return { isValid: false, reason: 'Verification failed due to network error after multiple attempts' }
    }
  }

  return { isValid: false, reason: 'Max attempts reached' }
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
async function getResolvedTokenMetadata(
  contractAddress: string,
  provider: ethers.JsonRpcProvider,
  chainConfig: any
): Promise<{ decimals: number; tokenSymbol: string; isNative: boolean }> {
  // 1. FAST PATH: Check chain config markets mapping FIRST to avoid RPC calls
  if ('markets' in chainConfig) {
    for (const [symbol, market] of Object.entries(chainConfig.markets as any)) {
      const m = market as any
      if (m?.pToken?.toLowerCase() === contractAddress.toLowerCase()) {
        const isNative = Boolean(m?.isNative)
        const decimals = isNative ? 18 : (m?.decimals || 18)
        return { decimals, tokenSymbol: symbol, isNative }
      }
    }
  }

  // 2. SLOW PATH: Try to resolve via underlying() if available
  try {
    const pToken = new ethers.Contract(contractAddress, PTOKEN_ABI, provider)
    try {
      const underlyingAddress = await pToken.underlying()
      // ERC20 underlying
      const underlyingContract = new ethers.Contract(underlyingAddress, ERC20_ABI, provider)
      const [decimals, tokenSymbol] = await Promise.all([
        underlyingContract.decimals(),
        underlyingContract.symbol()
      ])
      return { decimals: Number.isFinite(Number(decimals)) ? Number(decimals) : 18, tokenSymbol, isNative: false }
    } catch (error) {
      // Not an ERC20 underlying, fall through
    }
  } catch (e) {
    // ignore
  }

  // 3. LAST RESORT: try ERC20 on the pToken itself for symbol only, but never use its decimals for scaling
  try {
    const tokenContract = new ethers.Contract(contractAddress, ERC20_ABI, provider)
    const tokenSymbol = await tokenContract.symbol()
    return { decimals: 18, tokenSymbol, isNative: false }
  } catch (e) {
    // Default if all else fails
    return { decimals: 18, tokenSymbol: 'UNKNOWN', isNative: false }
  }
}

// Estimate USD value using raw amount and decimals
async function estimateUSDValue(
  rawAmount: ethers.BigNumberish, 
  tokenSymbol: string, 
  decimals: number,
  chainId: number,
  pTokenAddress: string,
  provider: ethers.JsonRpcProvider
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
    'GMON': 2.5,
    'PGMON': 2.5,
    'BNB': 600,
  }
  
  // 1. FAST PATH: try to get price from our market data or static map
  const markets = getMarketsForChain(chainId)
  const marketBySymbol = markets.find(m => (m.symbol || '').toUpperCase() === (tokenSymbol || '').toUpperCase())
  const marketPrice = marketBySymbol ? (Number(marketBySymbol.oraclePrice) || Number(marketBySymbol.price) || 0) : 0
  const fallbackPrice = prices[(tokenSymbol || '').toUpperCase()] || 0
  
  let price = marketPrice > 0 ? marketPrice : fallbackPrice

  // 2. SLOW PATH: Try on-chain price oracle ONLY if we don't have a reliable price yet
  if (price === 0) {
    const oraclePrice = await getOraclePrice(chainId, pTokenAddress, provider)
    if (oraclePrice > 0) {
      price = oraclePrice
    }
  }
  
  // Format the raw amount using its decimals
  const formattedAmount = parseFloat(ethers.formatUnits(rawAmount, decimals))
  
  return formattedAmount * price
}

// Fetch USD price per 1 unit of underlying via on-chain price oracle (if configured)
async function getOraclePrice(
  chainId: number,
  pTokenAddress: string,
  provider: ethers.JsonRpcProvider
): Promise<number> {
  try {
    const oracleAddress = getOracleAddress(chainId)
    if (!oracleAddress) return 0

    const oracle = new ethers.Contract(oracleAddress, PriceOracleAbi as any, provider)
    // Many Compound-style oracles return price scaled by 1e18 (USD with 18 decimals)
    const priceMantissa: bigint = await oracle.getUnderlyingPrice(pTokenAddress)
    if (!priceMantissa || priceMantissa === BigInt(0)) return 0
    return Number(ethers.formatUnits(priceMantissa, 18))
  } catch (error) {
    return 0
  }
}

// Calculate points based on action type and amount
export function calculatePoints(
  actionType: 'supply' | 'borrow' | 'repay' | 'redeem',
  amount?: string,
  usdValue?: number
): number {
  return calculateTransactionPoints(actionType, usdValue)
}