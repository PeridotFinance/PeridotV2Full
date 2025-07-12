import { useAccount, useReadContract } from 'wagmi'
import { useState, useEffect } from 'react'
import { formatUnits } from 'viem'
import { getMarketsForChain, getAssetContractAddresses } from '@/data/market-data'
import { chainConfigs, getChainConfig } from '@/config/contracts'
import combinedAbi from '@/app/abis/combinedAbi.json'

interface TokenPosition {
  assetId: string
  symbol: string
  chainId: number
  chainName: string
  suppliedBalance: number
  borrowedBalance: number
  suppliedValueUSD: number
  borrowedValueUSD: number
  priceUSD: number
  decimals: number
  pTokenAddress: string
}

interface ChainBalance {
  chainId: number
  chainName: string
  totalSupplied: number
  totalBorrowed: number
  liquidity: number
  shortfall: number
  positions: TokenPosition[]
}

interface CrossChainBalances {
  totalSupplied: number
  totalBorrowed: number
  borrowLimit: number
  borrowLimitUsed: number
  netAPY: number
  chainBalances: ChainBalance[]
  allPositions: TokenPosition[]
  isLoading: boolean
  error: string | null
}

export function useCrossChainBalances(): CrossChainBalances {
  const { address, isConnected } = useAccount()
  const [balances, setBalances] = useState<CrossChainBalances>({
    totalSupplied: 0,
    totalBorrowed: 0,
    borrowLimit: 0,
    borrowLimitUsed: 0,
    netAPY: 0,
    chainBalances: [],
    allPositions: [],
    isLoading: false,
    error: null
  })

  // Simple ABIs for the contract calls we need
  const balanceOfUnderlyingAbi = [{
    name: 'balanceOfUnderlying',
    type: 'function' as const,
    stateMutability: 'view' as const,
    inputs: [{ name: 'account', type: 'address' as const }],
    outputs: [{ name: '', type: 'uint256' as const }]
  }]

  const borrowBalanceAbi = [{
    name: 'borrowBalanceStored',
    type: 'function' as const,
    stateMutability: 'view' as const,
    inputs: [{ name: 'account', type: 'address' as const }],
    outputs: [{ name: '', type: 'uint256' as const }]
  }]

  const oracleAbi = [{
    name: 'getUnderlyingPrice',
    type: 'function' as const,
    stateMutability: 'view' as const,
    inputs: [{ name: 'pToken', type: 'address' as const }],
    outputs: [{ name: '', type: 'uint256' as const }]
  }]

  // Get all chain configs that have smart contracts
  const chainsWithContracts = Object.entries(chainConfigs).filter(([_, config]) => 
    'chainId' in config && config.chainId && 'markets' in config
  )

  // Create dynamic contract calls for all chains and all their markets
  const contractCalls: Array<{
    chainId: number
    chainName: string
    assetId: string
    symbol: string
    pTokenAddress: string
    oracleAddress: string
    decimals: number
    marketData: any
    supplyCall: any
    borrowCall: any
    priceCall: any
  }> = []

  chainsWithContracts.forEach(([chainKey, chainConfig]) => {
    if (!('chainId' in chainConfig) || !('markets' in chainConfig)) return
    
    const marketsForChain = getMarketsForChain(chainConfig.chainId)
    const assetsWithContracts = marketsForChain.filter(asset => asset.hasSmartContract)

    assetsWithContracts.forEach(asset => {
      const oracleAddress = 'oracle' in chainConfig ? chainConfig.oracle : 
                           'simplePriceOracle' in chainConfig ? chainConfig.simplePriceOracle : null

      const contractAddresses = getAssetContractAddresses(asset.id, chainConfig.chainId)
      if (!oracleAddress || !contractAddresses?.pTokenAddress) return

      contractCalls.push({
        chainId: chainConfig.chainId,
        chainName: chainConfig.chainNameReadable,
        assetId: asset.id,
        symbol: asset.symbol,
        pTokenAddress: contractAddresses.pTokenAddress,
        oracleAddress,
        decimals: asset.decimals || 18,
        marketData: asset,
        supplyCall: null, // Will be populated below
        borrowCall: null,
        priceCall: null,
      })
    })
  })

  // Create wagmi contract calls for each market
  const supplyResults = contractCalls.map(call => 
    useReadContract({
      address: call.pTokenAddress as `0x${string}`,
      abi: balanceOfUnderlyingAbi,
      functionName: 'balanceOfUnderlying',
      args: address ? [address] : undefined,
      chainId: call.chainId,
      query: { enabled: !!address && isConnected }
    })
  )

  const borrowResults = contractCalls.map(call => 
    useReadContract({
      address: call.pTokenAddress as `0x${string}`,
      abi: borrowBalanceAbi,
      functionName: 'borrowBalanceStored',
      args: address ? [address] : undefined,
      chainId: call.chainId,
      query: { enabled: !!address && isConnected }
    })
  )

  const priceResults = contractCalls.map(call => 
    useReadContract({
      address: call.oracleAddress as `0x${string}`,
      abi: oracleAbi,
      functionName: 'getUnderlyingPrice',
      args: [call.pTokenAddress as `0x${string}`],
      chainId: call.chainId,
      query: { enabled: true }
    })
  )

  useEffect(() => {
    // Check if any contracts are still loading
    const isLoading = supplyResults.some(r => r.isLoading) || 
                     borrowResults.some(r => r.isLoading) || 
                     priceResults.some(r => r.isLoading)

    if (isLoading) {
      setBalances(prev => ({ ...prev, isLoading: true }))
      return
    }

    console.log('=== Dynamic Cross-Chain Balance Debug ===')
    console.log('Total contract calls:', contractCalls.length)
    console.log('Chains with contracts:', chainsWithContracts.map(([key, config]) => 
      'chainNameReadable' in config ? config.chainNameReadable : key
    ))

    try {
      const allPositions: TokenPosition[] = []
      const chainBalanceMap = new Map<number, ChainBalance>()

      // Process results for each market
      contractCalls.forEach((call, index) => {
        const supplyResult = supplyResults[index]
        const borrowResult = borrowResults[index]
        const priceResult = priceResults[index]

        // Parse supply balance
        const supplyRaw = supplyResult.data as bigint | undefined
        const suppliedBalance = supplyRaw ? Number(formatUnits(supplyRaw, call.decimals)) : 0

        // Parse borrow balance
        const borrowRaw = borrowResult.data as bigint | undefined
        const borrowedBalance = borrowRaw ? Number(formatUnits(borrowRaw, call.decimals)) : 0

        // Parse price with fallback
        const priceRaw = priceResult.data as bigint | undefined
        let priceUSD = priceRaw ? Number(formatUnits(priceRaw, 18)) : 0
        
        // Use fallback prices if oracle fails
        if (priceUSD === 0 && (suppliedBalance > 0 || borrowedBalance > 0)) {
          const fallbackPrices: Record<string, number> = {
            'LINK': 15.0,
            'PUSD': 1.0,
            'USDC': 1.0,
            'USDT': 1.0,
            'WMON': 0.1,
            'WETH': 2400.0,
            'WBTC': 65000.0,
            'PDT': 0.01,
          }
          priceUSD = fallbackPrices[call.symbol] || call.marketData.oraclePrice || 1.0
          console.warn(`Using fallback price for ${call.symbol}:`, priceUSD)
        }

        const suppliedValueUSD = suppliedBalance * priceUSD
        const borrowedValueUSD = borrowedBalance * priceUSD

        console.log(`${call.chainName} ${call.symbol}:`, {
          supply: `${suppliedBalance.toFixed(6)} (${suppliedValueUSD.toFixed(2)} USD)`,
          borrow: `${borrowedBalance.toFixed(6)} (${borrowedValueUSD.toFixed(2)} USD)`,
          price: `$${priceUSD.toFixed(4)}`,
          pToken: call.pTokenAddress,
          oracle: call.oracleAddress,
          hasPosition: suppliedBalance > 0 || borrowedBalance > 0,
          errors: {
            supply: supplyResult.error?.message,
            borrow: borrowResult.error?.message,
            price: priceResult.error?.message,
          }
        })

        // Only create position if user has activity
        if (suppliedBalance > 0 || borrowedBalance > 0) {
          const position: TokenPosition = {
            assetId: call.assetId,
            symbol: call.symbol,
            chainId: call.chainId,
            chainName: call.chainName,
            suppliedBalance,
            borrowedBalance,
            suppliedValueUSD,
            borrowedValueUSD,
            priceUSD,
            decimals: call.decimals,
            pTokenAddress: call.pTokenAddress,
          }
          allPositions.push(position)

          // Update chain balance
          if (!chainBalanceMap.has(call.chainId)) {
            chainBalanceMap.set(call.chainId, {
              chainId: call.chainId,
              chainName: call.chainName,
              totalSupplied: 0,
              totalBorrowed: 0,
              liquidity: 0,
              shortfall: 0,
              positions: [],
            })
          }

          const chainBalance = chainBalanceMap.get(call.chainId)!
          chainBalance.totalSupplied += suppliedValueUSD
          chainBalance.totalBorrowed += borrowedValueUSD
          chainBalance.positions.push(position)
        }
      })

      // Calculate totals
      const totalSupplied = allPositions.reduce((sum, pos) => sum + pos.suppliedValueUSD, 0)
      const totalBorrowed = allPositions.reduce((sum, pos) => sum + pos.borrowedValueUSD, 0)
      const borrowLimit = totalSupplied * 0.75 // 75% collateral factor average
      const borrowLimitUsed = borrowLimit > 0 ? (totalBorrowed / borrowLimit) * 100 : 0

      console.log('=== Cross-Chain Totals ===', {
        totalSupplied: `$${totalSupplied.toFixed(2)}`,
        totalBorrowed: `$${totalBorrowed.toFixed(2)}`,
        borrowLimit: `$${borrowLimit.toFixed(2)}`,
        borrowLimitUsed: `${borrowLimitUsed.toFixed(1)}%`,
        activePositions: allPositions.length,
        activeChains: chainBalanceMap.size,
        breakdown: Array.from(chainBalanceMap.values()).map(chain => ({
          chain: chain.chainName,
          supplied: `$${chain.totalSupplied.toFixed(2)}`,
          borrowed: `$${chain.totalBorrowed.toFixed(2)}`,
          positions: chain.positions.length,
        }))
      })

      setBalances({
        totalSupplied,
        totalBorrowed,
        borrowLimit,
        borrowLimitUsed,
        netAPY: 0, // Would need additional calculation
        chainBalances: Array.from(chainBalanceMap.values()),
        allPositions,
        isLoading: false,
        error: null
      })

    } catch (err) {
      console.error('Cross-chain balance calculation error:', err)
      setBalances(prev => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err.message : 'Failed to fetch cross-chain balances'
      }))
    }
  }, [
    // Dependencies on all the contract call results
    ...supplyResults.map(r => r.data),
    ...borrowResults.map(r => r.data), 
    ...priceResults.map(r => r.data),
    ...supplyResults.map(r => r.isLoading),
    ...borrowResults.map(r => r.isLoading),
    ...priceResults.map(r => r.isLoading),
    ...supplyResults.map(r => r.error),
    ...borrowResults.map(r => r.error),
    ...priceResults.map(r => r.error),
    address,
    isConnected
  ])

  return balances
} 