'use client'

import { useAccount, useReadContract } from 'wagmi'
import { usePTokenBalance } from '@/hooks/use-ptoken-balance'
import { useMarketMembership } from '@/hooks/use-market-membership'
import { getChainConfig } from '@/config/contracts'
import { getAssetContractAddresses } from '@/data/market-data'
import { formatUnits } from 'viem'
import combinedAbi from '@/app/abis/combinedAbi.json'

interface BalanceDebugInfoProps {
  assetId: string
  assetSymbol: string
}

export function BalanceDebugInfo({ assetId, assetSymbol }: BalanceDebugInfoProps) {
  const { address, isConnected, chainId } = useAccount()
  const {
    pTokenBalance,
    underlyingBalance,
    exchangeRate,
    decimals,
    formattedBalance,
    isLoading,
    error,
  } = usePTokenBalance({ assetId })

  // Get market membership info
  const {
    isCollateralEnabled,
    assetsIn,
    controllerAddress,
    isLoading: isCollateralLoading,
    error: collateralError,
  } = useMarketMembership({ assetId })

  // Get contract addresses
  const contractAddresses = chainId ? getAssetContractAddresses(assetId, chainId) : null
  const chainConfig = chainId ? getChainConfig(chainId) : null

  // Get account liquidity directly
  const { data: accountLiquidity, error: liquidityError } = useReadContract({
    address: controllerAddress as `0x${string}`,
    abi: combinedAbi,
    functionName: 'getAccountLiquidity',
    args: [address!],
    query: {
      enabled: !!controllerAddress && !!address,
    }
  })

  // Get oracle price for this market
  // First get the oracle address from controller
  const { data: oracleAddress, error: oracleAddressError } = useReadContract({
    address: controllerAddress as `0x${string}`,
    abi: combinedAbi,
    functionName: 'priceOracle',
    args: [],
    query: {
      enabled: !!controllerAddress,
    }
  })

  // Known oracle address for Monad testnet as fallback
  const knownOracleAddress = '0xeAEdaF63CbC1d00cB6C14B5c4DE161d68b7C63A0'
  const actualOracleAddress = oracleAddress || knownOracleAddress

  // Then call getUnderlyingPrice on the oracle contract
  const { data: oraclePrice, error: priceError } = useReadContract({
    address: actualOracleAddress as `0x${string}`,
    abi: combinedAbi,
    functionName: 'getUnderlyingPrice',
    args: [contractAddresses?.pTokenAddress!],
    query: {
      enabled: !!actualOracleAddress && !!contractAddresses?.pTokenAddress,
    }
  })

  // Get market info (collateral factor)
  const { data: marketInfo, error: marketError } = useReadContract({
    address: controllerAddress as `0x${string}`,
    abi: combinedAbi,
    functionName: 'markets',
    args: [contractAddresses?.pTokenAddress!],
    query: {
      enabled: !!controllerAddress && !!contractAddresses?.pTokenAddress,
    }
  })

  if (!isConnected || !address) {
    return <div className="text-xs text-gray-500">Wallet not connected</div>
  }

  if (isLoading) {
    return <div className="text-xs text-gray-500">Loading balances...</div>
  }

  if (error) {
    return <div className="text-xs text-red-500">Error: {error.message}</div>
  }

  // Calculate exchange rate in human readable form (already scaled by 1e18)
  const humanReadableExchangeRate = exchangeRate 
    ? parseFloat(formatUnits(BigInt(exchangeRate.toString()), 18)).toFixed(6)
    : '0'
  
  // Debug raw exchange rate value
  const rawExchangeRate = exchangeRate ? exchangeRate.toString() : '0'

  // Parse account liquidity
  let liquidityFormatted = 'N/A'
  let shortfallFormatted = 'N/A'
  let liquidityError1 = 'N/A'
  
  if (accountLiquidity) {
    const [error, liquidity, shortfall] = accountLiquidity as [bigint, bigint, bigint]
    liquidityError1 = error.toString()
    liquidityFormatted = formatUnits(liquidity, 18)
    shortfallFormatted = formatUnits(shortfall, 18)
  }

  // Parse oracle price
  const priceFormatted = oraclePrice 
    ? parseFloat(formatUnits(BigInt(oraclePrice.toString()), 18)).toFixed(4)
    : 'N/A'

  // Parse market info
  let marketListed = 'N/A'
  let collateralFactor = 'N/A'
  let isComped = 'N/A'
  
  if (marketInfo) {
    const [listed, factor, comped] = marketInfo as [boolean, bigint, boolean]
    marketListed = listed.toString()
    collateralFactor = parseFloat(formatUnits(factor, 18)).toFixed(4)
    isComped = comped.toString()
  }

  // Extract error messages safely
  const priceErrorMessage = priceError ? 
    (typeof priceError === 'object' && priceError && 'message' in priceError ? 
      String((priceError as any).message) : 
      'Error occurred') : 
    'None'
    
  const marketErrorMessage = marketError ? 
    (typeof marketError === 'object' && marketError && 'message' in marketError ? 
      String((marketError as any).message) : 
      'Error occurred') : 
    'None'
    
  const collateralErrorMessage = collateralError ? 
    (typeof collateralError === 'object' && collateralError && 'message' in collateralError ? 
      String((collateralError as any).message) : 
      'Error occurred') : 
    'None'
    
  const oracleAddressErrorMessage = oracleAddressError ? 
    (typeof oracleAddressError === 'object' && oracleAddressError && 'message' in oracleAddressError ? 
      String((oracleAddressError as any).message) : 
      'Error occurred') : 
    'None'

  return (
    <div className="p-3 bg-gray-100 rounded text-xs font-mono space-y-1 max-h-96 overflow-y-auto">
      <div className="font-bold text-sm mb-2">🔍 Complete Debug Info for {assetSymbol}:</div>
      
      {/* Contract Configuration */}
      <div className="border-t pt-2">
        <div className="font-semibold text-blue-600">📋 Contract Configuration:</div>
        <div>Chain ID: {chainId}</div>
        <div>Controller: {controllerAddress?.slice(0, 8)}...{controllerAddress?.slice(-6)}</div>
        <div>pToken: {contractAddresses?.pTokenAddress?.slice(0, 8)}...{contractAddresses?.pTokenAddress?.slice(-6)}</div>
        <div>Underlying: {contractAddresses?.underlyingAddress?.slice(0, 8)}...{contractAddresses?.underlyingAddress?.slice(-6)}</div>
      </div>

      {/* Balance Information */}
      <div className="border-t pt-2">
        <div className="font-semibold text-green-600">💰 Balance Information:</div>
        <div>pToken Decimals: {decimals}</div>
        <div>pToken Balance: {pTokenBalance ? formatUnits(pTokenBalance, decimals || 18) : '0'} p{assetSymbol}</div>
        <div>Raw Exchange Rate: {rawExchangeRate}</div>
        <div>Exchange Rate: {humanReadableExchangeRate} {assetSymbol} per p{assetSymbol}</div>
        <div className="text-green-600">Underlying Equivalent: {underlyingBalance ? formatUnits(underlyingBalance, 18) : '0'} {assetSymbol}</div>
        <div>Formatted Balance: {formattedBalance}</div>
      </div>

      {/* Market Information */}
      <div className="border-t pt-2">
        <div className="font-semibold text-purple-600">🏦 Market Information:</div>
        <div>Market Listed: {marketListed}</div>
        <div>Collateral Factor: {collateralFactor} ({parseFloat(collateralFactor) * 100}%)</div>
        <div>Is Comped: {isComped}</div>
        <div>Oracle Address (from controller): {oracleAddress ? `${(oracleAddress as string).slice(0, 8)}...${(oracleAddress as string).slice(-6)}` : 'FAILED'}</div>
        <div>Oracle Address Error: {oracleAddressErrorMessage}</div>
        <div>Fallback Oracle Address: {knownOracleAddress.slice(0, 8)}...{knownOracleAddress.slice(-6)}</div>
        <div>Actual Oracle Used: {actualOracleAddress.slice(0, 8)}...{actualOracleAddress.slice(-6)}</div>
        <div>Oracle Price: ${priceFormatted}</div>
        <div>Price Error: {priceErrorMessage}</div>
        <div>Market Error: {marketErrorMessage}</div>
      </div>

      {/* Collateral Status */}
      <div className="border-t pt-2">
        <div className="font-semibold text-orange-600">🏛️ Collateral Status:</div>
        <div>Is Collateral Enabled: {isCollateralEnabled ? 'YES ✅' : 'NO ❌'}</div>
        <div>Assets In Markets: {assetsIn.length}</div>
        <div>Loading Collateral: {isCollateralLoading ? 'YES' : 'NO'}</div>
        <div>Collateral Error: {collateralErrorMessage}</div>
      </div>

      {/* Account Liquidity */}
      <div className="border-t pt-2">
        <div className="font-semibold text-red-600">💸 Account Liquidity:</div>
        <div>Liquidity Error: {liquidityError}</div>
        <div>Available Liquidity: ${liquidityFormatted}</div>
        <div>Shortfall: ${shortfallFormatted}</div>
                 <div>Liquidity Call Error: {liquidityError ? String(liquidityError) : 'None'}</div>
      </div>

      {/* Expected Calculation */}
      <div className="border-t pt-2">
        <div className="font-semibold text-blue-600">🧮 Expected Borrowing Power:</div>
        <div>Supplied Value: {formattedBalance} {assetSymbol} × ${priceFormatted} = ${(parseFloat(formattedBalance.replace(/[<,]/g, '')) * parseFloat(priceFormatted)).toFixed(4)}</div>
        <div>Borrowing Power: ${(parseFloat(formattedBalance.replace(/[<,]/g, '')) * parseFloat(priceFormatted) * parseFloat(collateralFactor)).toFixed(4)} (@ {(parseFloat(collateralFactor) * 100).toFixed(1)}% LTV)</div>
      </div>

      <div className="text-sm text-gray-600 mt-2 border-t pt-2">
        <div>🔧 Troubleshooting:</div>
        <div>• If "Is Collateral Enabled" = NO, click "Enable Collateral"</div>
        <div>• If "Available Liquidity" = $0.00, check oracle price and market config</div>
        <div>• If "Market Listed" = false, market not configured</div>
      </div>
    </div>
  )
} 