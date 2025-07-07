import { useState, useEffect } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { Address } from 'viem'
import { getAssetContractAddresses } from '@/data/market-data'
import { getChainConfig } from '@/config/contracts'
import combinedAbi from '@/app/abis/combinedAbi.json'

interface UseEnterMarketProps {
  assetId: string
  onSuccess?: () => void
  onError?: (error: Error) => void
}

type TransactionStep = 'idle' | 'entering' | 'success' | 'error'

export function useEnterMarket({
  assetId,
  onSuccess,
  onError,
}: UseEnterMarketProps) {
  const { address, chainId } = useAccount()
  const [step, setStep] = useState<TransactionStep>('idle')
  const [error, setError] = useState<string | null>(null)
  const [enterMarketHash, setEnterMarketHash] = useState<`0x${string}` | undefined>()

  // Get contract addresses for the asset
  const contractAddresses = chainId ? getAssetContractAddresses(assetId, chainId) : null
  
  // Get chain config for controller address
  const chainConfig = chainId ? getChainConfig(chainId) : null
  const controllerAddress = chainConfig && 'unitrollerProxy' in chainConfig ? chainConfig.unitrollerProxy : null

  // Check if we have valid contract addresses
  const canEnterMarket = contractAddresses && contractAddresses.pTokenAddress && controllerAddress

  // Write contract hook for entering markets
  const { 
    writeContract: writeEnterMarket,
    isPending: isEnterMarketPending,
    data: enterMarketData,
    error: enterMarketError,
    reset: resetEnterMarket,
  } = useWriteContract()

  // Set hash when transaction is submitted
  useEffect(() => {
    if (enterMarketData) {
      setEnterMarketHash(enterMarketData)
    }
  }, [enterMarketData])

  // Wait for transaction receipt
  const { 
    isLoading: isEnterMarketConfirming, 
    isSuccess: isEnterMarketSuccess,
    error: enterMarketReceiptError 
  } = useWaitForTransactionReceipt({
    hash: enterMarketHash,
  })

  // Handle enter market success
  useEffect(() => {
    if (isEnterMarketSuccess) {
      setStep('success')
      onSuccess?.()
    }
  }, [isEnterMarketSuccess, onSuccess])

  // Handle errors
  useEffect(() => {
    if (enterMarketError) {
      setError(`Failed to enable collateral: ${enterMarketError.message}`)
      setStep('error')
      onError?.(enterMarketError)
    }
  }, [enterMarketError, onError])

  useEffect(() => {
    if (enterMarketReceiptError) {
      setError(`Collateral transaction failed: ${enterMarketReceiptError.message}`)
      setStep('error')
      onError?.(new Error(enterMarketReceiptError.message))
    }
  }, [enterMarketReceiptError, onError])

  // Execute enter market transaction
  const executeEnterMarket = async () => {
    try {
      setError(null)
      setStep('entering')
      
      if (!canEnterMarket) {
        throw new Error('Smart contracts for this asset are not available on this network')
      }

      if (!address) {
        throw new Error('Please connect your wallet first')
      }

      if (!contractAddresses || !controllerAddress) {
        throw new Error('Contract addresses not found')
      }

      console.log('Manually entering market for:', {
        assetId,
        pTokenAddress: contractAddresses.pTokenAddress,
        controllerAddress
      })

      writeEnterMarket({
        address: controllerAddress as Address,
        abi: combinedAbi,
        functionName: 'enterMarkets',
        args: [[contractAddresses.pTokenAddress as Address]], // Array of pToken addresses
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
    setEnterMarketHash(undefined)
    resetEnterMarket()
  }

  // Get current loading state
  const isLoading = step === 'entering' || isEnterMarketPending || isEnterMarketConfirming

  // Get status message
  const getStatusMessage = () => {
    switch (step) {
      case 'entering':
        return isEnterMarketPending ? 'Please confirm in wallet...' : 'Enabling as collateral...'
      case 'success':
        return 'Successfully enabled as collateral!'
      case 'error':
        return 'Transaction failed'
      default:
        return ''
    }
  }

  return {
    executeEnterMarket,
    step,
    error,
    isLoading,
    canEnterMarket,
    reset,
    contractAddresses,
    statusMessage: getStatusMessage(),
    enterMarketHash,
  }
} 