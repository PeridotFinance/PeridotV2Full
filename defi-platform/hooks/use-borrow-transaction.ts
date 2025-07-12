import { useState, useEffect, useCallback, useRef } from 'react'
import { useAccount, useWriteContract, useReadContract, useWaitForTransactionReceipt } from 'wagmi'
import { parseUnits, Address, formatUnits } from 'viem'
import { getAssetContractAddresses, getMarketsForChain } from '@/data/market-data'
import { getChainConfig } from '@/config/contracts'
import { useBorrowingPower } from './use-borrowing-power'
import combinedAbi from '@/app/abis/combinedAbi.json'
import { autoVerifyTransaction } from '@/lib/auto-leaderboard-verifier'

interface UseBorrowTransactionProps {
  assetId: string
  amount: string
  onSuccess?: () => void
  onError?: (error: Error) => void
}

type TransactionStep = 'idle' | 'checking-liquidity' | 'borrowing' | 'success' | 'error'

export function useBorrowTransaction({
  assetId,
  amount,
  onSuccess,
  onError,
}: UseBorrowTransactionProps) {
  const { address, chainId } = useAccount()
  const [step, setStep] = useState<TransactionStep>('idle')
  const [error, setError] = useState<string | null>(null)
  const [borrowHash, setBorrowHash] = useState<`0x${string}` | undefined>()

  const onErrorRef = useRef(onError);
  useEffect(() => {
      onErrorRef.current = onError;
  });

  // Get contract addresses for the asset
  const contractAddresses = chainId ? getAssetContractAddresses(assetId, chainId) : null
  
  // Get chain config to access controller address
  const chainConfig = chainId ? getChainConfig(chainId) : null
  const controllerAddress = chainConfig && 'unitrollerProxy' in chainConfig ? chainConfig.unitrollerProxy : null

  // Get borrowing power information
  const { borrowingPower, isBorrowAmountSafe, getMaxBorrowAmount, refetch: refetchBorrowingPower } = useBorrowingPower()

  // Get asset information for validation
  const allAssets = chainId ? getMarketsForChain(chainId) : []
  const currentAsset = allAssets.find(a => a.id === assetId)

  // Read underlying token decimals
  const { data: underlyingDecimals } = useReadContract({
    address: contractAddresses?.underlyingAddress as `0x${string}`,
    abi: combinedAbi,
    functionName: 'decimals',
    args: [],
    query: {
      enabled: !!contractAddresses?.underlyingAddress,
    }
  })

  // Check if we have valid contract addresses
  const canBorrow = contractAddresses && contractAddresses.pTokenAddress

  // Clean and parse amount to proper units
  const cleanAmount = (rawAmount: string): string => {
    if (!rawAmount) return '0'
    // Remove commas and any other formatting characters, keep only numbers and decimal point
    return rawAmount.replace(/[^0-9.]/g, '')
  }
  
  const parsedAmount = amount ? parseUnits(cleanAmount(amount), (underlyingDecimals as number) || 18) : BigInt(0)
  const numericAmount = parseFloat(cleanAmount(amount)) || 0

  // Read account liquidity from controller
  const { data: accountLiquidity, refetch: refetchLiquidity } = useReadContract({
    address: controllerAddress as Address,
    abi: combinedAbi,
    functionName: 'getAccountLiquidity',
    args: [address!],
    query: {
      enabled: !!controllerAddress && !!address,
    }
  })

  // Write contract hook for borrow
  const { 
    writeContract: writeBorrow,
    isPending: isBorrowPending,
    data: borrowData,
    error: borrowError,
    reset: resetBorrow,
  } = useWriteContract()

  // Set hash when transaction is submitted
  useEffect(() => {
    if (borrowData) {
      setBorrowHash(borrowData)
    }
  }, [borrowData])

  // Wait for transaction receipt
  const { 
    isLoading: isBorrowConfirming, 
    isSuccess: isBorrowSuccess,
    error: borrowReceiptError 
  } = useWaitForTransactionReceipt({
    hash: borrowHash,
  })

  // Handle borrow success
  useEffect(() => {
    if (isBorrowSuccess) {
      setStep('success')
      onSuccess?.()

      // Auto-verify borrow transaction in leaderboard
      if (borrowHash && address && chainId) {
        autoVerifyTransaction({
          txHash: borrowHash,
          walletAddress: address,
          chainId,
          onSuccess: (result) => {
            console.log('Borrow transaction automatically verified and added to leaderboard:', result)
          },
          onError: (error) => {
            console.warn('Auto-verification failed (user can still verify manually):', error.message)
          },
        }).catch(() => {
          // Silent fail - user can still verify manually if needed
        })
      }
    }
  }, [isBorrowSuccess, onSuccess, borrowHash, address, chainId])

  // Handle errors
  useEffect(() => {
    const combinedError = borrowError || borrowReceiptError
    if (combinedError) {
      const errorObject = combinedError instanceof Error ? combinedError : new Error(String(combinedError))
      console.error("A borrow error occurred:", errorObject)
      
      if (errorObject.message.includes('User rejected')) {
        setError('Borrow transaction rejected. Please try again.')
        reset() // Reset state if user rejects
      } else {
        onErrorRef.current?.(errorObject)
        setError(errorObject.message)
        setStep('error')
      }
    }
  }, [borrowError, borrowReceiptError])

  // Execute borrow transaction
  const executeBorrow = async () => {
    try {
      setError(null)
      setStep('checking-liquidity')
      
      if (!canBorrow) {
        throw new Error('Smart contracts for this asset are not available on this network')
      }

      if (!address) {
        throw new Error('Please connect your wallet first')
      }

      if (!amount || parseFloat(amount) <= 0) {
        throw new Error('Please enter a valid amount')
      }

      if (!contractAddresses) {
        throw new Error('Contract addresses not found')
      }

      // Refresh borrowing power data before validation
      await refetchBorrowingPower?.()
      await refetchLiquidity()

      // Give a small delay for state to update
      await new Promise(resolve => setTimeout(resolve, 100))

      // Enhanced validation using borrowing power calculations
      console.log('Borrow validation - borrowingPower:', borrowingPower)
      console.log('Borrow validation - availableBorrowingPowerUSD:', borrowingPower.availableBorrowingPowerUSD)
      console.log('Borrow validation - accountLiquidity:', accountLiquidity)
      
      // Also check the raw account liquidity as backup validation
      let hasLiquidity = false
      if (accountLiquidity) {
        const [error, liquidity, shortfall] = accountLiquidity as [bigint, bigint, bigint]
        if (error === BigInt(0) && liquidity > BigInt(0)) {
          hasLiquidity = true
          const liquidityUSD = parseFloat(formatUnits(liquidity, 18))
          console.log('Raw account liquidity USD:', liquidityUSD)
        }
      }
      
      if (borrowingPower.availableBorrowingPowerUSD <= 0 && !hasLiquidity) {
        throw new Error(`No borrowing capacity available. Please supply collateral first. Available: $${borrowingPower.availableBorrowingPowerUSD}`)
      }

      // Check if the specific borrow amount is safe
      if (!isBorrowAmountSafe(assetId, numericAmount)) {
        const maxAmount = getMaxBorrowAmount(assetId)
        throw new Error(
          `Insufficient borrowing power. You can borrow up to ${maxAmount.toFixed(4)} ${currentAsset?.symbol || assetId.toUpperCase()}. ` +
          `Available borrowing power: $${borrowingPower.availableBorrowingPowerUSD.toFixed(2)}`
        )
      }

      // Check utilization level and warn if getting risky
      const borrowValueUSD = currentAsset ? numericAmount * currentAsset.oraclePrice : 0
      const newUtilization = borrowingPower.totalBorrowingPowerUSD > 0 
        ? ((borrowingPower.totalBorrowedUSD + borrowValueUSD) / borrowingPower.totalBorrowingPowerUSD) * 100 
        : 0

      if (newUtilization > 85) {
        throw new Error(
          `This borrow would put your collateral utilization at ${newUtilization.toFixed(1)}%. ` +
          `High utilization increases liquidation risk. Consider borrowing less or adding more collateral.`
        )
      }

      // Additional check with account liquidity for validation
      await refetchLiquidity()
      
      if (accountLiquidity) {
        const [error, liquidity, shortfall] = accountLiquidity as [bigint, bigint, bigint]
        
        if (error !== BigInt(0)) {
          throw new Error('Failed to get account liquidity information from smart contract')
        }
        
        if (shortfall > BigInt(0)) {
          throw new Error('Smart contract indicates insufficient collateral')
        }
      }
      
      setStep('borrowing')
      writeBorrow({
        address: contractAddresses.pTokenAddress as Address,
        abi: combinedAbi,
        functionName: 'borrow',
        args: [parsedAmount],
      } as any)
      
    } catch (err) {
      const error = err as Error
      setError(error.message)
      setStep('error')
      onError?.(error)
    }
  }

  // Reset function
  const reset = () => {
    setStep('idle')
    setError(null)
    setBorrowHash(undefined)
    resetBorrow()
  }

  // Get current loading state based on step
  const isLoading = step === 'checking-liquidity' || 
                   step === 'borrowing' ||
                   isBorrowPending || 
                   isBorrowConfirming

  // Get status message
  const getStatusMessage = () => {
    switch (step) {
      case 'checking-liquidity':
        return 'Checking borrowing capacity...'
      case 'borrowing':
        return isBorrowPending ? 'Please confirm borrow in wallet...' : 'Borrowing tokens...'
      case 'success':
        return `Borrow successful! You borrowed ${amount} ${assetId.toUpperCase()}.`
      case 'error':
        return 'Transaction failed'
      default:
        return ''
    }
  }

  return {
    executeBorrow,
    step,
    error,
    isLoading,
    canBorrow,
    reset,
    contractAddresses,
    statusMessage: getStatusMessage(),
    borrowHash,
    accountLiquidity,
  }
} 