import { useState, useEffect, useCallback, useRef } from 'react'
import { useAccount, useWriteContract, useReadContract, useWaitForTransactionReceipt } from 'wagmi'
import { parseUnits, Address, erc20Abi } from 'viem'
import { getAssetContractAddresses, getMarketsForChain } from '@/data/market-data'
import { getChainConfig } from '@/config/contracts'
import combinedAbi from '@/app/abis/combinedAbi.json'
import { autoVerifyTransaction } from '@/lib/auto-leaderboard-verifier'

interface UseSupplyTransactionProps {
  assetId: string
  amount: string
  onSuccess?: () => void
  onError?: (error: Error) => void
}

type TransactionStep = 'idle' | 'checking-allowance' | 'approving' | 'approved' | 'supplying' | 'entering-market' | 'success' | 'error'

export function useSupplyTransaction({
  assetId,
  amount,
  onSuccess,
  onError,
}: UseSupplyTransactionProps) {
  const { address, chainId } = useAccount()
  const [step, setStep] = useState<TransactionStep>('idle')
  const [error, setError] = useState<string | null>(null)
  const [approveHash, setApproveHash] = useState<`0x${string}` | undefined>()
  const [supplyHash, setSupplyHash] = useState<`0x${string}` | undefined>()
  const [enterMarketHash, setEnterMarketHash] = useState<`0x${string}` | undefined>()
  const hasExecutedSupply = useRef(false)
  const hasExecutedEnterMarket = useRef(false)

  const onErrorRef = useRef(onError);
  useEffect(() => {
      onErrorRef.current = onError;
  });

  const allAssets = chainId ? getMarketsForChain(chainId) : [];
  const asset = allAssets.find(a => a.id === assetId);
  const underlyingDecimals = asset?.decimals ?? 18;

  // Get contract addresses for the asset
  const contractAddresses = chainId ? getAssetContractAddresses(assetId, chainId) : null
  
  // Get chain config for controller address
  const chainConfig = chainId ? getChainConfig(chainId) : null
  const controllerAddress = chainConfig && 'unitrollerProxy' in chainConfig ? chainConfig.unitrollerProxy : null

  // Check if we have valid contract addresses
  const canSupply = contractAddresses && contractAddresses.pTokenAddress && contractAddresses.underlyingAddress && controllerAddress

  // Clean and parse amount to proper units (always 18 for supply)
  const cleanAmount = (rawAmount: string): string => {
    if (!rawAmount) return '0'
    // Remove commas and any other formatting characters, keep only numbers and decimal point
    return rawAmount.replace(/[^0-9.]/g, '')
  }
  
  const parsedAmount = amount ? parseUnits(cleanAmount(amount), underlyingDecimals) : BigInt(0)

  // Read current allowance of underlying token
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: contractAddresses?.underlyingAddress as Address,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [address!, contractAddresses?.pTokenAddress as Address],
    query: {
      enabled: !!contractAddresses && !!address,
    }
  })

  // Check if approval is needed
  const needsApproval = allowance !== undefined && parsedAmount > (allowance as bigint)

  // Write contract hooks
  const { 
    writeContract: writeApprove,
    isPending: isApprovePending,
    data: approveData,
    error: approveError,
    reset: resetApprove,
  } = useWriteContract()

  const { 
    writeContract: writeSupply,
    isPending: isSupplyPending,
    data: supplyData,
    error: supplyError,
    reset: resetSupply,
  } = useWriteContract()

  // Write contract hook for entering markets (enabling collateral)
  const { 
    writeContract: writeEnterMarket,
    isPending: isEnterMarketPending,
    data: enterMarketData,
    error: enterMarketError,
    reset: resetEnterMarket,
  } = useWriteContract()

  // Set hashes when transactions are submitted
  useEffect(() => {
    if (approveData) {
      setApproveHash(approveData)
    }
  }, [approveData])

  useEffect(() => {
    if (supplyData) {
      setSupplyHash(supplyData)
    }
  }, [supplyData])

  useEffect(() => {
    if (enterMarketData) {
      setEnterMarketHash(enterMarketData)
    }
  }, [enterMarketData])

  // Wait for transaction receipts
  const { 
    isLoading: isApprovalConfirming, 
    isSuccess: isApprovalSuccess,
    error: approvalReceiptError 
  } = useWaitForTransactionReceipt({
    hash: approveHash,
  })

  const { 
    isLoading: isSupplyConfirming, 
    isSuccess: isSupplySuccess,
    error: supplyReceiptError 
  } = useWaitForTransactionReceipt({
    hash: supplyHash,
  })

  const { 
    isLoading: isEnterMarketConfirming, 
    isSuccess: isEnterMarketSuccess,
    error: enterMarketReceiptError 
  } = useWaitForTransactionReceipt({
    hash: enterMarketHash,
  })

  // Execute supply mint (defined before useEffect to avoid hoisting issues)
  const executeSupplyMint = useCallback(() => {
    if (!contractAddresses) {
      setError('Contract addresses not available')
      setStep('error')
      return
    }
    
    if (!address) {
      setError('Wallet not connected')
      setStep('error')
      return
    }
    
    try {
      writeSupply({
        address: contractAddresses.pTokenAddress as Address,
        abi: combinedAbi,
        functionName: 'mint',
        args: [parsedAmount],
      } as any)
    } catch (err) {
      console.error('Error executing supply mint:', err)
      setError('Failed to execute supply transaction')
      setStep('error')
    }
  }, [contractAddresses, parsedAmount, writeSupply, address])

  // Execute enter market (enable pToken as collateral)
  const executeEnterMarket = useCallback(() => {
    if (!contractAddresses || !controllerAddress) {
      setError('Contract addresses not available for entering market')
      setStep('error')
      return
    }
    
    if (!address) {
      setError('Wallet not connected')
      setStep('error')
      return
    }
    
    try {
      writeEnterMarket({
        address: controllerAddress as Address,
        abi: combinedAbi,
        functionName: 'enterMarkets',
        args: [[contractAddresses.pTokenAddress as Address]], // Array of pToken addresses
      } as any)
    } catch (err) {
      console.error('Error entering market:', err)
      setError('Failed to enable asset as collateral')
      setStep('error')
    }
  }, [contractAddresses, controllerAddress, writeEnterMarket, address])

  // Set step to approved when approval succeeds
  useEffect(() => {
    if (isApprovalSuccess && step !== 'approved' && step !== 'supplying' && step !== 'success') {
      setStep('approved')
      hasExecutedSupply.current = false // Reset the flag
    }
  }, [isApprovalSuccess, step])

  // Handle approval success - proceed to supply
  useEffect(() => {
    if (isApprovalSuccess && step === 'approved' && !hasExecutedSupply.current && address) {
      refetchAllowance()
      
      // Auto-proceed to supply after approval with longer timeout
      const timer = setTimeout(() => {
        if (contractAddresses && !hasExecutedSupply.current && address) {
          hasExecutedSupply.current = true
          setStep('supplying')
          executeSupplyMint()
        }
      }, 2000) // Increased timeout to give wallet more time
      
      return () => clearTimeout(timer)
    }
  }, [isApprovalSuccess, step, contractAddresses, executeSupplyMint, refetchAllowance, address])

  // Handle supply success - complete without automatic enter market
  useEffect(() => {
    if (isSupplySuccess) {
      setStep('success')
      onSuccess?.()

      // Auto-verify supply transaction in leaderboard
      if (supplyHash && address && chainId) {
        autoVerifyTransaction({
          txHash: supplyHash,
          walletAddress: address,
          chainId,
          onSuccess: (result) => {
            console.log('Supply transaction automatically verified and added to leaderboard:', result)
          },
          onError: (error) => {
            console.warn('Auto-verification failed (user can still verify manually):', error.message)
          },
        }).catch(() => {
          // Silent fail - user can still verify manually if needed
        })
      }
    }
  }, [isSupplySuccess, onSuccess, supplyHash, address, chainId])

  // Note: Enter market is now handled separately via manual user action

  // Handle approval errors
  useEffect(() => {
    const combinedError = approveError || approvalReceiptError
    if (combinedError) {
      const errorObject = combinedError instanceof Error ? combinedError : new Error(String(combinedError))
      console.error("An approval error occurred:", errorObject)
      
      if (errorObject.message.includes('User rejected')) {
        setError('Approval rejected. Please try again.')
        reset() // Reset state if user rejects
      } else {
        onErrorRef.current?.(errorObject)
        setError(errorObject.message)
        setStep('error')
      }
    }
  }, [approveError, approvalReceiptError])

  // Handle supply errors
  useEffect(() => {
    const combinedError = supplyError || supplyReceiptError
    if (combinedError) {
      const errorObject = combinedError instanceof Error ? combinedError : new Error(String(combinedError))
      console.error("A supply error occurred:", errorObject)
      
      if (errorObject.message.includes('User rejected')) {
        setError('Supply transaction rejected. Please try again.')
        reset() // Reset state if user rejects
      } else {
        onErrorRef.current?.(errorObject)
        setError(errorObject.message)
        setStep('error')
      }
    }
  }, [supplyError, supplyReceiptError])

  // Execute approval
  const executeApproval = () => {
    if (!contractAddresses) return
    
    writeApprove({
      address: contractAddresses.underlyingAddress as Address,
      abi: erc20Abi,
      functionName: 'approve',
      args: [contractAddresses.pTokenAddress as Address, parsedAmount],
    } as any)
  }



  // Execute the supply transaction
  const executeSupply = async () => {
    try {
      setError(null)
      setStep('checking-allowance')
      hasExecutedSupply.current = false // Reset flag at start of new transaction
      
      if (!canSupply) {
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

      // Check if approval is needed
      await refetchAllowance()
      
      if (needsApproval) {
        setStep('approving')
        executeApproval()
      } else {
        setStep('supplying')
        executeSupplyMint()
      }
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
    setApproveHash(undefined)
    setSupplyHash(undefined)
    setEnterMarketHash(undefined)
    hasExecutedSupply.current = false
    hasExecutedEnterMarket.current = false
    resetApprove()
    resetSupply()
    resetEnterMarket()
  }

  // Get current loading state based on step
  const isLoading = step === 'checking-allowance' || 
                   step === 'approving' || 
                   step === 'supplying' ||
                   step === 'entering-market' ||
                   isApprovePending || 
                   isSupplyPending || 
                   isEnterMarketPending ||
                   isApprovalConfirming || 
                   isSupplyConfirming ||
                   isEnterMarketConfirming

  // Get status message
  const getStatusMessage = () => {
    switch (step) {
      case 'checking-allowance':
        return 'Checking allowance...'
      case 'approving':
        return isApprovePending ? 'Please confirm approval in wallet...' : 'Approving tokens...'
      case 'approved':
        return 'Approval confirmed! Preparing supply...'
      case 'supplying':
        return isSupplyPending ? 'Please confirm supply in wallet...' : 'Supplying tokens...'
      case 'entering-market':
        return isEnterMarketPending ? 'Please confirm collateral setup in wallet...' : 'Enabling as collateral...'
      case 'success':
        return 'Supply successful! You can enable this asset as collateral if needed.'
      case 'error':
        return 'Transaction failed'
      default:
        return ''
    }
  }

  // Manual supply trigger (in case automatic transition fails)
  const manualSupplyTrigger = useCallback(() => {
    if (step === 'approved' && !hasExecutedSupply.current && address && contractAddresses) {
      hasExecutedSupply.current = true
      setStep('supplying')
      executeSupplyMint()
    }
  }, [step, address, contractAddresses, executeSupplyMint])

  return {
    executeSupply,
    manualSupplyTrigger,
    step,
    error,
    isLoading,
    needsApproval,
    canSupply,
    reset,
    contractAddresses,
    statusMessage: getStatusMessage(),
    approveHash,
    supplyHash,
  }
} 