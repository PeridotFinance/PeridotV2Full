import { useState, useCallback, useEffect, useRef } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi'
import { parseUnits, Address, erc20Abi } from 'viem'
import { getAssetContractAddresses } from '@/data/market-data'
import combinedAbi from '@/app/abis/combinedAbi.json'
import { autoVerifyTransaction } from '@/lib/auto-leaderboard-verifier'
import { parseAndDecodeError } from '@/lib/compound-errors'

interface UseRedeemTransactionProps {
  assetId: string
  amount: string
  redeemType: 'pTokens' | 'underlying' // Whether to redeem specific pTokens or underlying amount
  onSuccess?: () => void
  onError?: (error: Error) => void
}

type TransactionStep = 'idle' | 'redeeming' | 'success' | 'error'

export function useRedeemTransaction({
  assetId,
  amount,
  redeemType,
  onSuccess,
  onError,
}: UseRedeemTransactionProps) {
  const { address, chainId } = useAccount()
  const [step, setStep] = useState<TransactionStep>('idle')
  const [error, setError] = useState<string | null>(null)
  const [redeemHash, setRedeemHash] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string>('')

  const onErrorRef = useRef(onError);
  useEffect(() => {
      onErrorRef.current = onError;
  });

  // Get contract addresses for the asset
  const contractAddresses = chainId ? getAssetContractAddresses(assetId, chainId) : null

  // Read pToken decimals (might be 8 instead of 18)
  const { data: pTokenDecimals } = useReadContract({
    address: contractAddresses?.pTokenAddress as `0x${string}`,
    abi: erc20Abi,
    functionName: 'decimals',
    args: [],
    query: {
      enabled: !!contractAddresses?.pTokenAddress,
    }
  })

  // Read underlying token decimals (usually 18)
  const { data: underlyingDecimals } = useReadContract({
    address: contractAddresses?.underlyingAddress as `0x${string}`,
    abi: erc20Abi,
    functionName: 'decimals',
    args: [],
    query: {
      enabled: !!contractAddresses?.underlyingAddress,
    }
  })

  // Check if we have valid contract addresses
  const canRedeem = contractAddresses && contractAddresses.pTokenAddress

  // Use correct decimals based on redeem type
  const getDecimals = (): number => {
    if (redeemType === 'pTokens') {
      return pTokenDecimals || 8 // Default to 8 for pTokens if not available
    } else {
      return underlyingDecimals || 18 // Default to 18 for underlying tokens
    }
  }
  
  const parsedAmount = amount ? parseUnits(amount, getDecimals()) : BigInt(0)

  // Write contract hook for redeem transaction
  const { writeContract, isPending, error: writeError, data: redeemData } = useWriteContract()

  // Set hash when transaction data is available
  useEffect(() => {
    if (redeemData) {
      setRedeemHash(redeemData)
    }
  }, [redeemData])

  // Wait for transaction confirmation
  const { isLoading: isConfirming, isSuccess: isTransactionSuccess, error: transactionError } = useWaitForTransactionReceipt({
    hash: redeemHash as `0x${string}`,
  })

  // Handle transaction success/error
  useEffect(() => {
    if (isTransactionSuccess && redeemHash) {
      setStep('success')
      setStatusMessage('Redeem successful! Tokens redeemed.')
      onSuccess?.()

      // Auto-verify redeem transaction in leaderboard
      if (redeemHash && address && chainId) {
        autoVerifyTransaction({
          txHash: redeemHash,
          walletAddress: address,
          chainId,
          onSuccess: (result) => {
            console.log('Redeem transaction automatically verified and added to leaderboard:', result)
          },
          onError: (error) => {
            console.warn('Auto-verification failed (user can still verify manually):', error.message)
          },
        }).catch(() => {
          // Silent fail - user can still verify manually if needed
        })
      }
    }
  }, [isTransactionSuccess, redeemHash, onSuccess, address, chainId])

  useEffect(() => {
    const combinedError = transactionError || writeError;
    if (combinedError) {
      const errorObject = combinedError instanceof Error ? combinedError : new Error(String(combinedError))
      const decodedError = parseAndDecodeError(errorObject.message);
      (errorObject as any).shortMessage = decodedError;
      
      console.error("A redeem error occurred:", errorObject)
      
      if (errorObject.message.includes('User rejected')) {
        setError('Redeem transaction rejected. Please try again.')
        reset() // Reset state if user rejects
      } else {
        setError(`Transaction failed: ${decodedError}`)
        onErrorRef.current?.(errorObject)
        setStep('error')
      }
    }
  }, [transactionError, writeError])

  const executeRedeem = useCallback(async () => {
    console.log('--- Initiating Redeem Transaction ---');
    if (!address || !contractAddresses || !amount || parsedAmount <= 0) {
      const errorMsg = 'Invalid parameters for redeem. Aborting.';
      console.error(errorMsg, {
        address,
        contractAddresses,
        amount,
        parsedAmount: parsedAmount.toString(),
      });
      setError(errorMsg);
      return;
    }

    try {
      setError(null)
      setStep('redeeming')
      
      const decimals = getDecimals()
      const functionToCall = redeemType === 'pTokens' ? 'redeem' : 'redeemUnderlying';
      
      // Debug logging
      console.log('🔍 REDEEM DEBUG CHECKPOINT');
      console.log('================================');
      console.log(`  Asset ID: ${assetId}`);
      console.log(`  Redeem Type: ${redeemType}`);
      console.log(`  Function to Call: ${functionToCall}`);
      console.log('--------------------------------');
      console.log(`  Input Amount (string): "${amount}"`);
      console.log(`  pToken Decimals: ${pTokenDecimals || 'N/A'}`);
      console.log(`  Underlying Decimals: ${underlyingDecimals || 'N/A'}`);
      console.log(`  Decimals Used for Parsing: ${decimals}`);
      console.log(`  Parsed Amount (BigInt): ${parsedAmount.toString()}`);
      console.log('--------------------------------');
      console.log(`  Target Contract: ${contractAddresses.pTokenAddress}`);
      console.log(`  User Address: ${address}`);
      console.log('================================');

      setStatusMessage(`Submitting transaction to ${functionToCall}...`);
      
      writeContract({
        address: contractAddresses.pTokenAddress as Address,
        abi: combinedAbi,
        functionName: functionToCall,
        args: [parsedAmount], 
      } as any)
        
      setStatusMessage('Transaction submitted. Waiting for confirmation...')

    } catch (err: any) {
      console.error('💥 Redeem transaction failed during preparation:', err)
      setStep('error')
      const errorMsg = err.message || 'An unexpected error occurred during redeem preparation.';
      setError(errorMsg);
      onError?.(new Error(errorMsg));
    }
  }, [address, contractAddresses, assetId, amount, parsedAmount, redeemType, writeContract, pTokenDecimals, underlyingDecimals, getDecimals, onError])

  const reset = useCallback(() => {
    setStep('idle')
    setError(null)
    setRedeemHash(null)
    setStatusMessage('')
  }, [])

  const isLoading = isPending || isConfirming

  return {
    executeRedeem,
    isLoading,
    canRedeem,
    error,
    step,
    statusMessage,
    redeemHash,
    reset,
  }
} 